import asyncio
import math
import re
import unicodedata
from typing import Any


_router = None


def _get_router():
    global _router
    if _router is None:
        from laya import Router

        _router = Router(default="multilingual", max_loaded=1)
    return _router


def _confidence(answer: dict[str, Any]) -> float:
    confidence = answer.get("answer_confidence", answer.get("confidence"))
    if isinstance(confidence, bool) or not isinstance(confidence, (int, float)):
        raise ValueError("A LAYA não retornou uma confiança numérica.")
    confidence = float(confidence)
    if not math.isfinite(confidence) or not 0 <= confidence <= 1:
        raise ValueError("A LAYA retornou uma confiança fora do intervalo esperado.")
    return confidence


def _predict(state: dict[str, Any], questions: dict[str, Any]) -> dict[str, Any]:
    return _get_router().predict(state, questions, model="multilingual")


PRIORITY_LEVELS = ("baixa", "normal", "alta", "critica")


def _has_service_scheduled_today(justification: str) -> bool:
    normalized = unicodedata.normalize("NFKD", justification.casefold())
    normalized = "".join(char for char in normalized if not unicodedata.combining(char))
    normalized = re.sub(r"\s+", " ", normalized)
    service = r"(?:atendimentos?|consultas?|procedimentos?)"
    return re.search(
        rf"(?:\b{service}\b[^.!?\n]{{0,100}}\bhoje\b|"
        rf"\bhoje\b[^.!?\n]{{0,100}}\b{service}\b)",
        normalized,
    ) is not None


def apply_priority_rules(priority: str | None, request: dict[str, Any]) -> tuple[str | None, str | None]:
    inventory = request.get("estoque") or {}
    rule_matches = (
        inventory.get("quantidade") == 0
        and _has_service_scheduled_today(request.get("justificativa", ""))
    )
    if rule_matches and (priority is None or priority in {"baixa", "normal"}):
        return "alta", "estoque_zerado_atendimento_hoje"
    return priority, None


async def make_decision(request: dict[str, Any]) -> dict[str, Any]:
    material = request.get("material") or {}
    inventory = request.get("estoque")
    available_quantity = inventory.get("quantidade") if inventory else None
    state = {
        "solicitacao": request.get("justificativa", ""),
        "material": material.get("nome", ""),
        "material_categoria_cadastrada": material.get("categoria", ""),
        "material_descricao": material.get("descricao", ""),
        "unidade": request.get("unidade", {}).get("nome", ""),
        "quantidade": request.get("quantidade"),
        "estoque_registrado": inventory is not None,
        "quantidade_disponivel": available_quantity,
        "saldo_insuficiente": (
            available_quantity < request.get("quantidade", 0)
            if available_quantity is not None else None
        ),
    }

    category_options = {
        "manutencao": (
            "Manutenção e infraestrutura: ferramentas, peças e insumos para reparar ou conservar "
            "prédios, instalações, máquinas e veículos. Exemplos: filtro de ar, parafusos, cabos, "
            "tinta, lubrificantes e ferramentas. Use para peças de reparo, inclusive de veículos."
        ),
        "almoxarifado": (
            "Suprimentos operacionais gerais armazenados e distribuídos pelo almoxarifado, "
            "sem uma área de uso mais específica. Exemplos: uniformes, caixas, embalagens e "
            "materiais de uso geral. Não escolha esta opção só porque o item ficará guardado no estoque."
        ),
        "saude": (
            "Materiais para assistência à saúde, atendimento clínico, primeiros socorros e "
            "proteção de pacientes ou profissionais. Exemplos: kits de primeiros socorros, "
            "luvas de atendimento, máscaras, gazes, curativos, medicamentos e materiais clínicos."
        ),
        "transporte": (
            "Materiais e serviços usados diretamente na operação de transporte e deslocamento. "
            "Exemplos: combustível, passagens, frete e serviços de transporte. Peças e ferramentas "
            "para consertar veículos pertencem a manutenção."
        ),
        "compras": (
            "Aquisição e processo de compras quando esse é o objeto explícito da solicitação, "
            "como cotação, fornecedor ou contratação. Não classifique um material como compras "
            "apenas porque ele precisará ser comprado."
        ),
        "administrativo": (
            "Materiais para rotinas de escritório, impressão, arquivo e trabalho administrativo. "
            "Exemplos: papel A4, canetas, pastas, envelopes, toner e material de expediente."
        ),
        "outros": (
            "Use somente quando o material não se encaixar claramente em nenhuma das categorias "
            "anteriores e a categoria cadastrada estiver ausente ou for genérica."
        ),
    }

    sector_options = {
        "almoxarifado": (
            "Equipe responsável por recebimento, armazenamento, separação e distribuição interna "
            "de materiais. Escolha quando o pedido for para recompor ou movimentar o estoque central."
        ),
        "saude": (
            "Equipe que usa o material em atendimento clínico, assistência, primeiros socorros ou "
            "proteção à saúde. Exemplos: enfermagem, ambulatório e equipe de atendimento."
        ),
        "manutencao": (
            "Equipe que executa reparos e conservação de prédios, instalações, máquinas ou veículos. "
            "Escolha quando o material será aplicado em uma manutenção."
        ),
        "transporte": (
            "Equipe que organiza ou executa deslocamentos, entregas, fretes e operação de transporte. "
            "Diferencie da equipe de manutenção da frota."
        ),
        "compras": (
            "Equipe responsável por cotação, fornecedores, aquisição e contratação. Escolha quando "
            "a solicitação é dirigida ao processo de compras; não deduza este setor só porque o item "
            "precisa ser comprado."
        ),
        "administrativo": (
            "Equipe que executa rotinas de escritório, impressão, arquivo, atendimento administrativo "
            "ou apoio organizacional. Exemplos: secretaria e escritório."
        ),
        "outro": (
            "Use quando os dados não identificarem um setor responsável com clareza. Não use como "
            "alternativa para uma categoria de material desconhecida."
        ),
    }

    questions = {
        "categoria": {
            "type": "choice",
            "instructions": (
                "Classifique pelo tipo e finalidade do material, não pelo setor que fará a compra ou "
                "guardará o item. Considere material_categoria_cadastrada como sinal principal quando "
                "ela corresponder a uma categoria desta lista. Se o cadastro estiver vazio ou genérico, "
                "use o nome, a descrição e a justificativa. Não escolha outros quando houver uma "
                "correspondência clara; não invente informações."
            ),
            "criteria": category_options,
        },
        "setor": {
            "type": "choice",
            "instructions": (
                "Identifique a equipe responsável ou usuária indicada pela finalidade e pela justificativa. "
                "Setor é quem usará ou tratará o pedido; categoria é o tipo de material. Não conclua que "
                "o setor é compras apenas porque o item será adquirido, nem que é almoxarifado só porque "
                "há estoque. Use outro se os dados não permitirem identificar a equipe."
            ),
            "criteria": sector_options,
        },
        "prioridade": {
            "type": "choice",
            "instructions": (
                "Escolha uma das quatro faixas de prioridade logística. Considere "
                "falta ou insuficiência de estoque, prazo e impacto descritos. "
                "Não presuma urgência que não esteja nos dados. Use critica somente "
                "quando houver risco imediato grave explicitamente informado."
            ),
            "criteria": {
                "baixa": "Baixa: necessidade sem urgência e com prazo confortável.",
                "normal": "Normal: solicitação necessária, sem impacto ou prazo imediato.",
                "alta": "Alta: estoque insuficiente, prazo próximo ou atendimento afetado.",
                "critica": "Crítica: risco imediato grave à operação ou às pessoas, descrito explicitamente.",
            },
        },
    }

    result = await asyncio.to_thread(_predict, state, questions)

    answers = result.get("answers")
    if not isinstance(answers, dict):
        raise ValueError("A LAYA não retornou as respostas esperadas.")

    category_answer = answers.get("categoria")
    sector_answer = answers.get("setor")
    priority_answer = answers.get("prioridade")
    if not all(isinstance(answer, dict) for answer in (category_answer, sector_answer, priority_answer)):
        raise ValueError("A LAYA retornou uma classificação incompleta.")

    category = category_answer.get("choice")
    sector = sector_answer.get("choice")
    if category not in category_options or sector not in sector_options:
        raise ValueError("A LAYA retornou uma categoria ou setor desconhecido.")

    confidences = {
        "categoria": _confidence(category_answer),
        "setor": _confidence(sector_answer),
        "prioridade": _confidence(priority_answer),
    }
    priority = priority_answer.get("choice")
    if priority not in PRIORITY_LEVELS:
        raise ValueError("A LAYA retornou um nível de prioridade desconhecido.")

    priority, priority_rule = apply_priority_rules(priority, request)

    return {
        "categoria": category,
        "setor": sector,
        "prioridade": priority,
        "regra_prioridade_aplicada": priority_rule,
        "confianca": min(confidences.values()),
        "confiancas": confidences,
        "revisao_humana": True,
        "provedor": "laya",
        "routing": result.get("routing"),
    }
