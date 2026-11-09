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

    # Test the building blueprint endpoint
def test_get_blueprint():
    response = client.get("/api/blueprint")

    # Check that the API request succeeds
    assert response.status_code == 200

    # Convert the response into Python data
    data = response.json()

    # Check the blueprint contains the required sections
    assert "rooms" in data
    assert "connections" in data
    assert "devices" in data

    # Check the example rooms and exit
    assert "A" in data["rooms"]
    assert "B" in data["rooms"]
    assert "EXIT1" in data["rooms"]
    assert data["rooms"]["EXIT1"]["exit"] is True

    # Test historical readings for Room A
def test_get_history():
    response = client.get("/api/history?room=A")

    assert response.status_code == 200

    data = response.json()

    # Check that two readings are returned
    assert len(data) == 2

    # Check that both readings belong to Room A
    assert all(reading["room"] == "A" for reading in data)

    # Test history filtering by room and time range
def test_get_history_time_range():
    response = client.get(
        "/api/history?room=A&from=1500&to=2500"
    )

    assert response.status_code == 200

    data = response.json()

    assert len(data) == 1
    assert data[0]["room"] == "A"
    assert data[0]["ts"] == 2000