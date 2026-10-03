from datetime import datetime, timezone
from typing import Any, Protocol

from app.core.config import get_settings


class DecisionProvider(Protocol):
    async def classify(self, request: dict[str, Any]) -> dict[str, Any]: ...


class LayaProvider:
    """Optional LAYA adapter; imports are lazy and weights load on first inference."""

    async def classify(self, request: dict[str, Any]) -> dict[str, Any]:
        try:
            import asyncio
            from laya import Router
        except ImportError as error:
            raise RuntimeError("LAYA não instalado. Instale o extra opcional do backend.") from error

        # Keep the model in process across calls. Router() itself does not download;
        # first decide() downloads the selected checkpoint, so it runs off-loop.
        global _router
        if _router is None:
            _router = Router(default="multilingual", max_loaded=1)
        settings = get_settings()
        category_options = {
            "manutencao": "Materiais e peças para manutenção",
            "almoxarifado": "Materiais e suprimentos de estoque",
            "saude": "Materiais médicos, medicamentos e saúde",
            "transporte": "Materiais e serviços de transporte",
            "compras": "Aquisições e compras",
            "administrativo": "Materiais administrativos e de escritório",
            "outros": "Outro material ou categoria não identificada",
        }
        sector_options = {
            "almoxarifado": "Almoxarifado e distribuição de materiais",
            "saude": "Área de saúde ou assistência clínica",
            "manutencao": "Manutenção e infraestrutura",
            "transporte": "Transporte e frota",
            "compras": "Compras e aquisições",
            "administrativo": "Área administrativa e apoio",
            "outro": "Outro setor ou setor não identificado",
        }
        questions = {
            "categoria": {"type": "choice", "instructions": "Classifique a solicitação pelo tipo de material, sem inventar detalhes.", "criteria": category_options},
            "setor": {"type": "choice", "instructions": "Indique o setor que provavelmente utilizará o material; use outro se incerto.", "criteria": sector_options},
            "prioridade": {"type": "score", "instructions": "Avalie a prioridade logística de 0 a 100. Use 0 para baixa urgência, 25 para baixa, 50 para normal, 75 para alta e 100 para crítica. Baseie-se apenas nos sinais explícitos da justificativa.", "criteria": ["0 baixa urgência", "25 baixa", "50 normal", "75 alta", "100 crítica"]},
        }
        state = {
            "solicitacao": request.get("justificativa", ""),
            "material": request.get("material", {}).get("nome", ""),
            "material_descricao": request.get("material", {}).get("descricao", ""),
            "unidade": request.get("unidade", {}).get("nome", ""),
            "quantidade": request.get("quantidade"),
        }

        def predict():
            return _router.predict(state, questions, model=settings.laya_model or "multilingual")

        result = await asyncio.to_thread(predict)
        answers = result.get("answers") or {}

        def answer(key: str):
            value = answers.get(key)
            if not isinstance(value, dict):
                return None, None
            selected = value.get("choice", value.get("score"))
            confidence = value.get("answer_confidence")
            try:
                confidence = float(confidence) if confidence is not None else None
            except (TypeError, ValueError):
                confidence = None
            return selected, confidence

        category, category_conf = answer("categoria")
        sector, sector_conf = answer("setor")
        priority, priority_conf = answer("prioridade")
        priority_answer = answers.get("prioridade") or {}
        priority_probs = priority_answer.get("probabilities") or {}
        if priority_probs:
            try:
                priority = int(max(priority_probs, key=lambda key: float(priority_probs[key]))) * 25
            except (TypeError, ValueError):
                pass
        confidences = [category_conf, sector_conf, priority_conf]
        if any(value is None for value in (category, sector, priority)) or any(value is None for value in confidences):
            raise ValueError("LAYA não retornou todos os campos e confiança necessária.")
        return {
            "categoria": category,
            "setor": sector,
            "prioridade": int(priority),
            "confianca": min(confidences),
            "confiancas": {"categoria": category_conf, "setor": sector_conf, "prioridade": priority_conf},
            "routing": result.get("routing"),
        }


_router = None


def get_decision_provider() -> DecisionProvider:
    return LayaProvider()


async def make_decision(request: dict[str, Any]) -> dict[str, Any]:
    settings = get_settings()
    if settings.decision_provider.lower() not in {"laya", "none", "off"}:
        raise RuntimeError(f"Provedor de decisão não reconhecido: {settings.decision_provider}")
    if settings.decision_provider.lower() in {"none", "off"}:
        raise RuntimeError("Provedor de decisão desativado; solicitação enviada para revisão humana.")
    result = await get_decision_provider().classify(request)
    required = {"categoria", "setor", "prioridade", "confianca"}
    if not required.issubset(result):
        raise ValueError("O provedor retornou uma decisão incompleta.")
    confidence = float(result["confianca"])
    threshold = settings.laya_review_threshold
    below_threshold = confidence < threshold
    return {
        "categoria": str(result["categoria"]),
        "setor": str(result["setor"]),
        "prioridade": max(0, min(100, int(result["prioridade"]))),
        "confianca": max(0.0, min(1.0, confidence)),
        "confiancas": result.get("confiancas", {}),
        "abaixo_limiar": below_threshold,
        # The model provides a suggestion only. It never approves or routes autonomously.
        "revisao_humana": True,
        "provedor": "laya",
        "criada_em": datetime.now(timezone.utc),
    }
