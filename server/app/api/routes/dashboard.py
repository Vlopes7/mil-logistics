from datetime import date, datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from bson import ObjectId
from pymongo.errors import PyMongoError

from app.db.client import get_database

router = APIRouter(tags=["dashboard"])
COMPLETED_STATUSES = ["atendida", "concluida", "concluído"]
CLOSED_STATUSES = [*COMPLETED_STATUSES, "cancelada", "cancelado"]


def serialize_date(value: Any) -> str | None:
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    return value if isinstance(value, str) else None


def _safe_oid(value: Any):
    try:
        return ObjectId(value) if ObjectId.is_valid(value) else None
    except (TypeError, ValueError):
        return None


@router.get("/dashboard")
async def dashboard(database=Depends(get_database)) -> dict[str, Any]:
    requests = database["solicitacoes"]
    try:
        total = await requests.count_documents({})
        completed = await requests.count_documents({"status": {"$in": COMPLETED_STATUSES}})
        pending = await requests.count_documents({"status": {"$nin": CLOSED_STATUSES}})
        review = await requests.count_documents({"decisao.revisao_humana": True})
        high_priority = await requests.count_documents({"decisao.prioridade": {"$gte": 75}})

        average_cursor = await requests.aggregate([
            {"$match": {"decisao.prioridade": {"$type": "number"}}},
            {"$group": {"_id": None, "value": {"$avg": "$decisao.prioridade"}}},
        ])
        average_result = await average_cursor.to_list(length=1)

        category_cursor = await requests.aggregate([
            {"$match": {"decisao.categoria": {"$type": "string"}}},
            {"$group": {"_id": "$decisao.categoria", "total": {"$sum": 1}}},
            {"$sort": {"total": -1}},
        ])
        category_result = await category_cursor.to_list(length=50)

        documents = await requests.find({}).sort([
            ("decisao.prioridade", -1),
            ("criado_em", -1),
        ]).limit(8).to_list(length=8)
    except PyMongoError as error:
        raise HTTPException(status_code=503, detail="Não foi possível consultar o MongoDB.") from error

    recent_requests = []
    for document in documents:
        decision = document.get("decisao") or document.get("classificacao") or {}
        unit = document.get("unidade")
        if unit is None and _safe_oid(document.get("unidade_id")):
            unit = await database.unidades.find_one({"_id": _safe_oid(document.get("unidade_id"))})
        material = document.get("material")
        if material is None and _safe_oid(document.get("material_id")):
            material = await database.materiais.find_one({"_id": _safe_oid(document.get("material_id"))})
        recent_requests.append({
            "id": str(document.get("_id", "")),
            "unit": unit.get("nome", "Unidade não informada") if isinstance(unit, dict) else unit or document.get("unidade_nome", "Unidade não informada"),
            "material": material.get("nome", "Material não informado") if isinstance(material, dict) else material or document.get("material_nome", "Material não informado"),
            "quantity": document.get("quantidade", 0),
            "category": decision.get("categoria", ""),
            "sector": decision.get("setor", ""),
            "priority": decision.get("prioridade"),
            "needs_review": decision.get("revisao_humana", False),
            "status": document.get("status", "pendente"),
            "created_at": serialize_date(document.get("criado_em") or document.get("data") or document.get("created_at")),
        })

    return {
        "metrics": {
            "total": total,
            "pending": pending,
            "review": review,
            "completed": completed,
            "high_priority": high_priority,
            "average_priority": round(average_result[0]["value"], 1) if average_result else None,
        },
        "categories": [
            {"name": item["_id"] or "Sem classificação", "total": item["total"]}
            for item in category_result
        ],
        "recent_requests": recent_requests,
    }
