from fastapi import APIRouter, Request
from pymongo.errors import PyMongoError

router = APIRouter(tags=["health"])


@router.get("/health")
async def health(request: Request) -> dict[str, str]:
    client = getattr(request.app.state, "mongo_client", None)
    if client is None:
        return {"status": "ok", "database": "not_configured"}
    try:
        await client.admin.command("ping")
    except PyMongoError:
        return {"status": "degraded", "database": "unavailable"}
    return {"status": "ok", "database": "connected"}
