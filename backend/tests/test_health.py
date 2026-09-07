from fastapi.testclient import TestClient


def test_health_check_endpoint(client: TestClient):
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["database"] == "healthy"
    assert "CBT Platform API" in data["app_name"]
    assert "environment" in data
