from pymongo import AsyncMongoClient

from app.core.config import get_settings

settings = get_settings()
client = AsyncMongoClient(settings.mongo_url, serverSelectionTimeoutMS=3000)
database = client[settings.mongo_database]


def get_database():
    return database


async def close_mongo_connection() -> None:
    await client.close()
