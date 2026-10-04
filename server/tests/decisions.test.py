import asyncio

import pytest

from app.services.decisions import apply_priority_rules, make_decision


@pytest.mark.parametrize("priority", [None, "baixa", "normal"])
def test_empty_inventory_and_service_today_raise_priority_to_high(priority: str | None) -> None:
    result = apply_priority_rules(priority, {
        "estoque": {"quantidade": 0},
        "justificativa": "Há atendimento agendado para hoje.",
    })

    assert result == ("alta", "estoque_zerado_atendimento_hoje")


@pytest.mark.parametrize("priority", ["alta", "critica"])
def test_priority_rule_does_not_lower_high_or_critical(priority: str) -> None:
    result = apply_priority_rules(priority, {
        "estoque": {"quantidade": 0},
        "justificativa": "Consulta marcada para hoje.",
    })

    assert result == (priority, None)


@pytest.mark.parametrize(
    ("priority", "inventory", "justification"),
    [
        ("normal", {"quantidade": 1}, "Há atendimento agendado para hoje."),
        ("baixa", {"quantidade": 0}, "Reposição para o próximo mês."),
        ("normal", None, "Temos consulta para hoje."),
    ],
)
def test_priority_rule_needs_zero_inventory_and_service_today(
    priority: str,
    inventory: dict[str, int] | None,
    justification: str,
) -> None:
    result = apply_priority_rules(priority, {
        "estoque": inventory,
        "justificativa": justification,
    })

    assert result == (priority, None)


def test_make_decision_uses_laya_choice_labels_and_applies_priority_rule(monkeypatch) -> None:
    def predict(state, questions):
        assert state["quantidade_disponivel"] == 0
        assert set(questions["prioridade"]["criteria"]) == {"baixa", "normal", "alta", "critica"}
        return {
            "answers": {
                "categoria": {"choice": "saude", "answer_confidence": 0.9},
                "setor": {"choice": "saude", "answer_confidence": 0.8},
                "prioridade": {"choice": "normal", "answer_confidence": 0.7},
            },
            "routing": {"model": "multilingual"},
        }

    monkeypatch.setattr("app.services.decisions._predict", predict)
    result = asyncio.run(make_decision({
        "justificativa": "Há consulta agendada para hoje.",
        "material": {"nome": "Gaze", "categoria": "saude"},
        "unidade": {"nome": "Unidade Alfa"},
        "quantidade": 3,
        "estoque": {"quantidade": 0},
    }))

    assert result["prioridade"] == "alta"
    assert result["regra_prioridade_aplicada"] == "estoque_zerado_atendimento_hoje"
    assert result["revisao_humana"] is True
    assert result["provedor"] == "laya"
