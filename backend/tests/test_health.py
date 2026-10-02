from fastapi.testclient import TestClient

from app.main import create_app


def test_health_without_started_lifespan_reports_api_status() -> None:
    app = create_app()
    response = TestClient(app).get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "database": "not_configured"}
