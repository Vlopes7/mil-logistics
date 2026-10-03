from fastapi import APIRouter
from pymongo.errors import PyMongoError

from app.db.client import client

router = APIRouter(tags=["health"])


@router.get("/health")
async def health() -> dict[str, str]:
    try:
        await client.admin.command("ping")
    except PyMongoError:
        return {"status": "degraded", "database": "unavailable"}
    return {"status": "ok", "database": "connected"}
