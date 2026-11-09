
import socket

from fastapi.testclient import TestClient
from generated.protocol import Message, Information, ContentType
from server.HttpServer import web_server

app = web_server.app
client = TestClient(app)


# ==========================================
# TEST 1: LATEST SENSOR READINGS
# ==========================================

def test_get_nodes(monkeypatch):
    # Create isolated sample readings for this test
    sample_readings = {
        "AABBCCDDEE01": {
            "device": "NODE-1",
            "mac_address": "AABBCCDDEE01",
            "temperature": 25.5,
            "humidity": 60.0
        }
    }

    monkeypatch.setattr(
        web_server,
        "latest_readings",
        sample_readings
    )

    response = client.get("/api/nodes")

    assert response.status_code == 200

    data = response.json()

    assert isinstance(data, list)
    assert len(data) == 1
    assert data[0]["device"] == "NODE-1"
    assert data[0]["temperature"] == 25.5
    assert data[0]["humidity"] == 60.0


# ==========================================
# TEST 2: BUILDING BLUEPRINT
# ==========================================

def test_get_blueprint():
    response = client.get("/api/blueprint")

    assert response.status_code == 200

    data = response.json()

    assert "rooms" in data
    assert "connections" in data
    assert "devices" in data

    assert "A" in data["rooms"]
    assert "B" in data["rooms"]
    assert "EXIT1" in data["rooms"]
    assert data["rooms"]["EXIT1"]["exit"] is True


# ==========================================
# TEST 3: HISTORICAL READINGS
# ==========================================

def test_get_history():
    response = client.get("/api/history?room=A")

    assert response.status_code == 200

    data = response.json()

    assert len(data) == 2
    assert all(reading["room"] == "A" for reading in data)


# ==========================================
# TEST 4: TIME-RANGE FILTERING
# ==========================================

def test_get_history_time_range():
    response = client.get(
        "/api/history?room=A&from=1500&to=2500"
    )

    assert response.status_code == 200

    data = response.json()

    assert len(data) == 1
    assert data[0]["room"] == "A"
    assert data[0]["ts"] == 2000


# ==========================================
# TEST 5: WEBSOCKET CONNECTION
# ==========================================

def test_websocket_connection(monkeypatch):
    # Start with no stored sensor readings
    monkeypatch.setattr(
        web_server,
        "latest_readings",
        {}
    )

    with client.websocket_connect("/ws") as websocket:
        data = websocket.receive_json()

        assert data["type"] == "snapshot"
        assert "blueprint" in data
        assert data["nodes"] == []
        assert "levels" in data

        websocket.send_text("ping")

        response = websocket.receive_json()

        assert response["type"] == "pong"


# ==========================================
# TEST 6: MULTIPLE-CLIENT BROADCASTING
# ==========================================

def test_websocket_broadcast(monkeypatch):
    monkeypatch.setattr(
        web_server,
        "latest_readings",
        {}
    )

    # Use a temporary UDP port during application startup
    monkeypatch.setenv("UDP_PORT", "0")

    with TestClient(app) as test_client:
        with test_client.websocket_connect("/ws") as ws1:
            with test_client.websocket_connect("/ws") as ws2:

                snapshot1 = ws1.receive_json()
                snapshot2 = ws2.receive_json()

                assert snapshot1["type"] == "snapshot"
                assert snapshot2["type"] == "snapshot"

                ws1.send_text("demo_reading")

                update1 = ws1.receive_json()
                update2 = ws2.receive_json()

                assert update1["type"] == "reading"
                assert update2["type"] == "reading"

                assert update1["room"] == "A"
                assert update2["room"] == "A"

                assert update1["temperature"] == 30
                assert update2["temperature"] == 30


# ==========================================
# TEST 7: UDP-TO-WEBSOCKET AND REST API
# ==========================================

def test_udp_to_websocket_integration(monkeypatch):
    # Keep this test independent of other readings
    monkeypatch.setattr(
        web_server,
        "latest_readings",
        {}
    )

    # Start the UDP receiver on an available local port
    monkeypatch.setenv("UDP_PORT", "0")

    with TestClient(app) as test_client:

        udp_transport = app.state.udp_transport
        udp_port = udp_transport.get_extra_info("sockname")[1]

        with test_client.websocket_connect("/ws") as websocket:

            # Before receiving UDP data, nodes should be empty
            snapshot = websocket.receive_json()

            assert snapshot["type"] == "snapshot"
            assert snapshot["nodes"] == []

            # Create a sensor packet using the team's protocol
            message = Message(
                device_name="INTEGRATION-TEST",
                mac_address=0xAABBCCDDEE03,
                content_type=ContentType.INFORMATION,
                content=Information(
                    temperature=31.5,
                    humidity=58.0,
                    status=2
                )
            )

            # Send the packet through a real local UDP socket
            with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sender:
                sender.sendto(
                    message.to_bytes(),
                    ("127.0.0.1", udp_port)
                )

            # Verify the WebSocket receives the reading
            update = websocket.receive_json()

            assert update["type"] == "reading"
            assert update["device"] == "INTEGRATION-TEST"
            assert update["temperature"] == 31.5
            assert update["humidity"] == 58.0

            # Verify that /api/nodes now contains the reading
            response = test_client.get("/api/nodes")

            assert response.status_code == 200

            nodes = response.json()

            assert len(nodes) == 1
            assert nodes[0]["device"] == "INTEGRATION-TEST"
            assert nodes[0]["mac_address"] == "AABBCCDDEE03"
            assert nodes[0]["temperature"] == 31.5
            assert nodes[0]["humidity"] == 58.0
