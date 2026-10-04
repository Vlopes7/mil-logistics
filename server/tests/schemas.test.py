import pytest
from pydantic import ValidationError

from app.schemas import HumanReview, RequestCreate


@pytest.mark.parametrize("priority", ["baixa", "normal", "alta", "critica"])
def test_human_review_accepts_configured_priority_labels(priority: str) -> None:
    review = HumanReview(revisor="Responsável", prioridade=priority)

    assert review.prioridade == priority


def test_human_review_rejects_numeric_priority() -> None:
    with pytest.raises(ValidationError):
        HumanReview(revisor="Responsável", prioridade=75)


def test_request_requires_positive_quantity() -> None:
    with pytest.raises(ValidationError):
        RequestCreate(
            unidade_id="unit-id",
            material_id="material-id",
            quantidade=0,
            justificativa="Reposição necessária",
        )
