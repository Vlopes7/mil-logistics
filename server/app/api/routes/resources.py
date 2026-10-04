from datetime import datetime, timezone
from typing import Any

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query
from app.db.client import get_database
from app.schemas import (EntityCreate, EntityUpdate, UnitCreate, UnitUpdate, MaterialCreate,
                         MaterialUpdate, HumanReview, InventoryCreate,
                         InventoryUpsert, InventoryUpdate, RequestCreate, RequestUpdate, serialize)
from app.services.decisions import apply_priority_rules, make_decision

router = APIRouter(tags=["logística"])
UTC_NOW = lambda: datetime.now(timezone.utc)
COLLECTIONS = {"unidades": "unidades", "materiais": "materiais"}
PRIORITY_RANK = {"baixa": 0, "normal": 1, "alta": 2, "critica": 3}


def priority_rank(value: Any) -> int:
    if isinstance(value, str):
        return PRIORITY_RANK.get(value, -1)
    if isinstance(value, (int, float)):
        if value >= 88:
            return 3
        if value >= 63:
            return 2
        if value >= 38:
            return 1
        if value >= 0:
            return 0
    return -1


def oid(value: str) -> ObjectId:
    if not ObjectId.is_valid(value):
        raise HTTPException(400, "Identificador inválido.")
    return ObjectId(value)


async def require_entity(database, collection: str, entity_id: str) -> dict[str, Any]:
    document = await database[collection].find_one({"_id": oid(entity_id)})
    if not document:
        raise HTTPException(404, f"Registro não encontrado em {collection}.")
    return document


async def create_entity(database, collection: str, payload: EntityCreate):
    data = payload.model_dump()
    data.update(criado_em=UTC_NOW(), atualizado_em=UTC_NOW())
    result = await database[collection].insert_one(data)
    return serialize(await database[collection].find_one({"_id": result.inserted_id}))


@router.post("/unidades", status_code=201)
async def create_unit(payload: UnitCreate, database=Depends(get_database)):
    if await database.unidades.find_one({"codigo": payload.codigo}):
        raise HTTPException(409, "Já existe uma unidade com esse código.")
    return await create_entity(database, "unidades", payload)


@router.get("/unidades")
async def list_units(database=Depends(get_database)):
    return [serialize(row) for row in await database.unidades.find({}).sort("nome", 1).to_list(500)]


@router.get("/unidades/{entity_id}")
async def get_unit(entity_id: str, database=Depends(get_database)):
    return serialize(await require_entity(database, "unidades", entity_id))


@router.patch("/unidades/{entity_id}")
async def update_unit(entity_id: str, payload: UnitUpdate, database=Depends(get_database)):
    values = payload.model_dump(exclude_unset=True)
    if "codigo" in values and await database.unidades.find_one({"codigo": values["codigo"], "_id": {"$ne": oid(entity_id)}}):
        raise HTTPException(409, "Já existe uma unidade com esse código.")
    return await patch_entity(database, "unidades", entity_id, values)


@router.delete("/unidades/{entity_id}", status_code=204)
async def delete_unit(entity_id: str, database=Depends(get_database)):
    if await database.solicitacoes.find_one({"unidade_id": entity_id}) or await database.estoques.find_one({"unidade_id": entity_id}):
        raise HTTPException(409, "Não é possível excluir a unidade vinculada a solicitações ou estoque.")
    return await delete_entity(database, "unidades", entity_id)


@router.post("/materiais", status_code=201)
async def create_material(payload: MaterialCreate, database=Depends(get_database)):
    if payload.codigo and await database.materiais.find_one({"codigo": payload.codigo}):
        raise HTTPException(409, "Já existe um material com esse código.")
    return await create_entity(database, "materiais", payload)


@router.get("/materiais")
async def list_materials(database=Depends(get_database)):
    return [serialize(row) for row in await database.materiais.find({}).sort("nome", 1).to_list(500)]


@router.get("/materiais/{entity_id}")
async def get_material(entity_id: str, database=Depends(get_database)):
    return serialize(await require_entity(database, "materiais", entity_id))


@router.patch("/materiais/{entity_id}")
async def update_material(entity_id: str, payload: MaterialUpdate, database=Depends(get_database)):
    values = payload.model_dump(exclude_unset=True)
    if values.get("codigo") and await database.materiais.find_one({"codigo": values["codigo"], "_id": {"$ne": oid(entity_id)}}):
        raise HTTPException(409, "Já existe um material com esse código.")
    return await patch_entity(database, "materiais", entity_id, values)


@router.delete("/materiais/{entity_id}", status_code=204)
async def delete_material(entity_id: str, database=Depends(get_database)):
    if await database.solicitacoes.find_one({"material_id": entity_id}) or await database.estoques.find_one({"material_id": entity_id}):
        raise HTTPException(409, "Não é possível excluir o material vinculado a solicitações ou estoque.")
    return await delete_entity(database, "materiais", entity_id)


async def patch_entity(database, collection: str, entity_id: str, values: dict[str, Any]):
    await require_entity(database, collection, entity_id)
    values["atualizado_em"] = UTC_NOW()
    await database[collection].update_one({"_id": oid(entity_id)}, {"$set": values})
    return serialize(await require_entity(database, collection, entity_id))


async def delete_entity(database, collection: str, entity_id: str):
    await require_entity(database, collection, entity_id)
    await database[collection].delete_one({"_id": oid(entity_id)})


@router.post("/estoques", status_code=201)
async def create_inventory(payload: InventoryCreate, database=Depends(get_database)):
    await require_entity(database, "unidades", payload.unidade_id)
    await require_entity(database, "materiais", payload.material_id)
    data = payload.model_dump()
    existing = await database.estoques.find_one({"unidade_id": data["unidade_id"], "material_id": data["material_id"]})
    if existing:
        raise HTTPException(409, "Já existe um registro de estoque para essa unidade e material; atualize-o.")
    data.update(criado_em=UTC_NOW(), atualizado_em=UTC_NOW())
    result = await database.estoques.insert_one(data)
    return serialize(await database.estoques.find_one({"_id": result.inserted_id}))


@router.put("/estoques")
async def upsert_inventory(payload: InventoryUpsert, database=Depends(get_database)):
    await require_entity(database, "unidades", payload.unidade_id)
    await require_entity(database, "materiais", payload.material_id)
    values = payload.model_dump()
    values["atualizado_em"] = UTC_NOW()
    document = await database.estoques.find_one_and_update(
        {"unidade_id": payload.unidade_id, "material_id": payload.material_id},
        {"$set": values, "$setOnInsert": {"criado_em": UTC_NOW()}},
        upsert=True,
        return_document=True,
    )
    return serialize(document)


@router.get("/estoques")
async def list_inventory(unidade_id: str | None = None, material_id: str | None = None,
                         database=Depends(get_database)):
    query = {}
    if unidade_id: query["unidade_id"] = unidade_id
    if material_id: query["material_id"] = material_id
    return [serialize(row) for row in await database.estoques.find(query).to_list(1000)]


@router.get("/estoques/{entity_id}")
async def get_inventory(entity_id: str, database=Depends(get_database)):
    return serialize(await require_entity(database, "estoques", entity_id))


@router.patch("/estoques/{entity_id}")
async def update_inventory(entity_id: str, payload: InventoryUpdate, database=Depends(get_database)):
    return await patch_entity(database, "estoques", entity_id, payload.model_dump(exclude_unset=True))


@router.delete("/estoques/{entity_id}", status_code=204)
async def delete_inventory(entity_id: str, database=Depends(get_database)):
    return await delete_entity(database, "estoques", entity_id)


async def create_request_document(database, payload: RequestCreate):
    unit = await require_entity(database, "unidades", payload.unidade_id)
    material = await require_entity(database, "materiais", payload.material_id)
    inventory = await database.estoques.find_one({
        "unidade_id": payload.unidade_id,
        "material_id": payload.material_id,
    })
    data = payload.model_dump()
    data.update(status="pendente", criado_em=UTC_NOW(), atualizado_em=UTC_NOW(), decisao=None)
    try:
        decision = await make_decision({
            **data,
            "unidade": unit,
            "material": material,
            "estoque": inventory,
        })
    except Exception:
        # Fail closed: save request; no fabricated classification/confidence.
        rule_priority, priority_rule = apply_priority_rules(None, {
            "estoque": inventory,
            "justificativa": data.get("justificativa", ""),
        })
        data["decisao"] = {"categoria": None, "setor": None, "prioridade": rule_priority,
                            "revisao_humana": True,
                            "regra_prioridade_aplicada": priority_rule,
                            "erro_provedor": "Provedor de decisão indisponível; revisão humana necessária."}
        data["status"] = "aguardando_revisao"
    else:
        data["decisao"] = decision
        data["status"] = "aguardando_revisao" if decision["revisao_humana"] else "pendente"
    result = await database.solicitacoes.insert_one(data)
    created = await database.solicitacoes.find_one({"_id": result.inserted_id})
    await database.decisoes.insert_one({"solicitacao_id": str(result.inserted_id), "tipo": "classificacao_inicial",
        "decisao": data["decisao"], "criado_em": UTC_NOW()})
    return serialize(created)


@router.post("/solicitacoes", status_code=201)
async def create_request(payload: RequestCreate, database=Depends(get_database)):
    return await create_request_document(database, payload)


@router.get("/solicitacoes/revisao")
async def requests_for_review(database=Depends(get_database)):
    docs = await database.solicitacoes.find({"decisao.revisao_humana": True}).sort("criado_em", -1).to_list(1000)
    return [serialize(row) for row in docs]


@router.get("/solicitacoes/prioridade")
async def requests_by_priority(order: str = Query("desc", pattern="^(asc|desc)$"),
                               database=Depends(get_database)):
    docs = await database.solicitacoes.find({}).to_list(1000)
    docs.sort(key=lambda row: priority_rank((row.get("decisao") or {}).get("prioridade")),
              reverse=order == "desc")
    return [serialize(row) for row in docs]


@router.get("/solicitacoes")
async def list_requests(status: str | None = None, unidade_id: str | None = None,
                        precisa_revisao: bool | None = None,
                        prioridade: str | None = Query(None, pattern="^(baixa|normal|alta|critica)$"),
                        order: str = Query("desc", pattern="^(asc|desc)$"), database=Depends(get_database)):
    query: dict[str, Any] = {}
    if status: query["status"] = status
    if unidade_id: query["unidade_id"] = unidade_id
    if precisa_revisao is not None: query["decisao.revisao_humana"] = precisa_revisao
    if prioridade is not None:
        query["decisao.prioridade"] = prioridade
    docs = await database.solicitacoes.find(query).to_list(1000)
    docs.sort(key=lambda row: priority_rank((row.get("decisao") or {}).get("prioridade")),
              reverse=order == "desc")
    return [serialize(row) for row in docs]


@router.get("/solicitacoes/{request_id}/decisoes")
async def list_decisions(request_id: str, database=Depends(get_database)):
    await require_entity(database, "solicitacoes", request_id)
    rows = await database.decisoes.find({"solicitacao_id": request_id}).sort("criado_em", 1).to_list(1000)
    return [serialize(row) for row in rows]


@router.post("/solicitacoes/{request_id}/revisao")
async def review_request(request_id: str, payload: HumanReview, database=Depends(get_database)):
    request = await require_entity(database, "solicitacoes", request_id)
    old = request.get("decisao") or {}
    decision = {key: value for key, value in old.items() if key not in {"erro_provedor"}}
    for field in ("categoria", "setor", "prioridade"):
        value = getattr(payload, field)
        if value is not None: decision[field] = value
    decision["revisao_humana"] = False
    decision["revisada_por"] = payload.revisor
    decision["revisada_em"] = UTC_NOW()
    new_status = payload.status or "pendente"
    await database.solicitacoes.update_one({"_id": oid(request_id)}, {"$set": {"decisao": decision,
        "status": new_status, "atualizado_em": UTC_NOW()}})
    entry = {"solicitacao_id": request_id, "tipo": "revisao_humana", "antes": old,
        "depois": decision, "revisor": payload.revisor, "notas": payload.notas,
        "status": new_status, "criado_em": UTC_NOW()}
    await database.decisoes.insert_one(entry)
    return serialize(await database.solicitacoes.find_one({"_id": oid(request_id)}))


@router.get("/solicitacoes/{request_id}")
async def get_request(request_id: str, database=Depends(get_database)):
    return serialize(await require_entity(database, "solicitacoes", request_id))


@router.patch("/solicitacoes/{request_id}")
async def update_request(request_id: str, payload: RequestUpdate, database=Depends(get_database)):
    current = await require_entity(database, "solicitacoes", request_id)
    values = payload.model_dump(exclude_unset=True)
    request_fields = {"unidade_id", "material_id", "quantidade", "justificativa"}
    reclassify = bool(request_fields.intersection(values))
    updated_request = {**current, **values}

    if reclassify:
        unit = await require_entity(database, "unidades", updated_request["unidade_id"])
        material = await require_entity(database, "materiais", updated_request["material_id"])
        inventory = await database.estoques.find_one({
            "unidade_id": updated_request["unidade_id"],
            "material_id": updated_request["material_id"],
        })
        try:
            decision = await make_decision({
                **updated_request,
                "unidade": unit,
                "material": material,
                "estoque": inventory,
            })
        except Exception:
            rule_priority, priority_rule = apply_priority_rules(None, {
                "estoque": inventory,
                "justificativa": updated_request.get("justificativa", ""),
            })
            decision = {
                "categoria": None,
                "setor": None,
                "prioridade": rule_priority,
                "revisao_humana": True,
                "regra_prioridade_aplicada": priority_rule,
                "erro_provedor": "Provedor de decisão indisponível; revisão humana necessária.",
            }
        values["decisao"] = decision
        values["status"] = "aguardando_revisao"

    updated = await patch_entity(database, "solicitacoes", request_id, values)
    if reclassify:
        await database.decisoes.insert_one({
            "solicitacao_id": request_id,
            "tipo": "reclassificacao_por_edicao",
            "antes": current.get("decisao"),
            "depois": updated.get("decisao"),
            "criado_em": UTC_NOW(),
        })
    if current.get("status") != updated.get("status"):
        await database.decisoes.insert_one({
            "solicitacao_id": request_id,
            "tipo": "alteracao_status",
            "status_anterior": current.get("status"),
            "status_novo": updated.get("status"),
            "criado_em": UTC_NOW(),
        })
    return updated


@router.delete("/solicitacoes/{request_id}", status_code=204)
async def delete_request(request_id: str, database=Depends(get_database)):
    await require_entity(database, "solicitacoes", request_id)
    await database.decisoes.delete_many({"solicitacao_id": request_id})
    await delete_entity(database, "solicitacoes", request_id)
