from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from pymongo import AsyncMongoClient

from app.core.config import Settings


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings: Settings = app.state.settings
    client = AsyncMongoClient(settings.mongo_url, serverSelectionTimeoutMS=3000)
    app.state.mongo_client = client
    app.state.database = client[settings.mongo_database]
    try:
        yield
    finally:
        await client.close()


def get_database(request: Request):
    return request.app.state.database
