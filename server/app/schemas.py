from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field, ConfigDict


class EntityCreate(BaseModel):
    nome: str = Field(min_length=1, max_length=160)
    descricao: str | None = None
    ativo: bool = True


class EntityUpdate(BaseModel):
    nome: str | None = Field(default=None, min_length=1, max_length=160)
    descricao: str | None = None
    ativo: bool | None = None


class UnitCreate(EntityCreate):
    codigo: str = Field(min_length=1, max_length=40)
    localizacao: str = Field(min_length=1, max_length=300)


class UnitUpdate(EntityUpdate):
    codigo: str | None = Field(default=None, min_length=1, max_length=40)
    localizacao: str | None = Field(default=None, min_length=1, max_length=300)


class MaterialCreate(EntityCreate):
    categoria: str = Field(min_length=1, max_length=100)
    unidade_medida: str = Field(min_length=1, max_length=40)
    codigo: str | None = Field(default=None, max_length=80)


class MaterialUpdate(EntityUpdate):
    categoria: str | None = Field(default=None, min_length=1, max_length=100)
    unidade_medida: str | None = Field(default=None, min_length=1, max_length=40)
    codigo: str | None = Field(default=None, max_length=80)


class InventoryCreate(BaseModel):
    unidade_id: str
    material_id: str
    quantidade: float = Field(ge=0)
    unidade_medida: str = "unidade"
    observacoes: str | None = None


class InventoryUpsert(InventoryCreate):
    pass


class InventoryUpdate(BaseModel):
    quantidade: float | None = Field(default=None, ge=0)
    unidade_medida: str | None = None
    observacoes: str | None = None


class RequestCreate(BaseModel):
    unidade_id: str
    material_id: str
    quantidade: float = Field(gt=0)
    justificativa: str = Field(min_length=3, max_length=4000)


REQUEST_STATUSES = {"pendente", "aguardando_revisao", "em_analise", "encaminhada", "aprovada", "rejeitada", "atendida", "concluida", "cancelada"}


class RequestUpdate(BaseModel):
    unidade_id: str | None = None
    material_id: str | None = None
    quantidade: float | None = Field(default=None, gt=0)
    justificativa: str | None = Field(default=None, min_length=3, max_length=4000)
    status: str | None = Field(default=None, pattern="^(pendente|aguardando_revisao|em_analise|encaminhada|aprovada|rejeitada|atendida|concluida|cancelada)$")


class HumanReview(BaseModel):
    categoria: str | None = None
    setor: str | None = None
    prioridade: int | None = Field(default=None, ge=0, le=100)
    status: str | None = Field(default=None, pattern="^(pendente|em_analise|aprovada|rejeitada|atendida|concluida|cancelada)$")
    revisor: str = Field(min_length=1, max_length=160)
    notas: str | None = None


class EntityOut(BaseModel):
    model_config = ConfigDict(extra="allow")
    id: str


def serialize(document: dict[str, Any]) -> dict[str, Any]:
    document = dict(document)
    document["id"] = str(document.pop("_id"))
    for key, value in list(document.items()):
        if isinstance(value, datetime):
            document[key] = value.isoformat()
    return document
