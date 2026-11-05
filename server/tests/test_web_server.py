from fastapi.testclient import TestClient
from server.HttpServer.web_server import app

# Create a test client for our FastAPI application
client = TestClient(app)

# Test the sensor readings endpoint
def test_get_nodes():
    response = client.get("/api/nodes")

    assert response.status_code == 200

    data = response.json()

    assert data["room"] == "A"
    assert data["temperature"] == 25
    assert data["humidity"] == 55
    assert data["status"] == "normal"