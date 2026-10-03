"""Insert a small, repeatable catalog so a request can be opened immediately."""

import asyncio
import sys
from datetime import datetime, timezone
from pathlib import Path

SERVER_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SERVER_DIR))

from app.db.client import close_mongo_connection, get_database  # noqa: E402


UNITS = [
    {
        "codigo": "UNI-ALFA",
        "nome": "Unidade Alfa",
        "localizacao": "São Paulo, SP",
        "descricao": "Unidade fictícia para demonstração do fluxo.",
        "ativo": True,
    },
    {
        "codigo": "UNI-BRAVO",
        "nome": "Unidade Bravo",
        "localizacao": "Campinas, SP",
        "descricao": "Unidade fictícia para demonstração do fluxo.",
        "ativo": True,
    },
]

MATERIALS = [
    {
        "codigo": "MAT-FILTRO-AR",
        "nome": "Filtro de ar",
        "categoria": "manutencao",
        "unidade_medida": "unidade",
        "descricao": "Peça para manutenção preventiva de veículos.",
        "ativo": True,
    },
    {
        "codigo": "MAT-KIT-PRIMEIROS-SOCORROS",
        "nome": "Kit de primeiros socorros",
        "categoria": "saude",
        "unidade_medida": "kit",
        "descricao": "Material de atendimento básico.",
        "ativo": True,
    },
    {
        "codigo": "MAT-UNIFORME",
        "nome": "Uniforme operacional",
        "categoria": "almoxarifado",
        "unidade_medida": "unidade",
        "descricao": "Item de uso operacional.",
        "ativo": True,
    },
    {
        "codigo": "MAT-PAPEL-A4",
        "nome": "Papel A4",
        "categoria": "administrativo",
        "unidade_medida": "resma",
        "descricao": "Material de escritório.",
        "ativo": True,
    },
]


async def seed_collection(collection, documents: list[dict]) -> int:
    inserted = 0
    for document in documents:
        result = await collection.update_one(
            {"codigo": document["codigo"]},
            {
                "$setOnInsert": {
                    **document,
                    "criado_em": datetime.now(timezone.utc),
                    "atualizado_em": datetime.now(timezone.utc),
                }
            },
            upsert=True,
        )
        inserted += int(result.upserted_id is not None)
    return inserted


async def main() -> None:
    database = get_database()
    try:
        units_added = await seed_collection(database.unidades, UNITS)
        materials_added = await seed_collection(database.materiais, MATERIALS)

        print(
            "Seed concluído: "
            f"{units_added} unidades e {materials_added} materiais inseridos; "
            "registros existentes foram preservados."
        )
    finally:
        await close_mongo_connection()


if __name__ == "__main__":
    asyncio.run(main())
