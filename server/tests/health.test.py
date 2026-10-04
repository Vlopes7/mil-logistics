from fastapi.testclient import TestClient

from app.api.routes import health as health_route
from app.main import create_app


class FakeAdmin:
    async def command(self, command: str) -> dict[str, int]:
        assert command == "ping"
        return {"ok": 1}


class FakeMongoClient:
    admin = FakeAdmin()


def test_health_reports_mongodb_connection(monkeypatch) -> None:
    monkeypatch.setattr(health_route, "client", FakeMongoClient())
    app = create_app()
    response = TestClient(app).get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "database": "connected"}
