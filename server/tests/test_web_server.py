import socket

from fastapi.testclient import TestClient
from generated.protocol import Message, Information, ContentType
from server.HttpServer.web_server import app


# Create a test client for our FastAPI application
client = TestClient(app)


# ==========================================
# TEST 1: SENSOR READINGS
# ==========================================

def test_get_nodes():
    response = client.get("/api/nodes")

    assert response.status_code == 200

    data = response.json()

    assert data["room"] == "A"
    assert data["temperature"] == 25
    assert data["humidity"] == 55
    assert data["status"] == "normal"


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

def test_websocket_connection():
    with client.websocket_connect("/ws") as websocket:

        data = websocket.receive_json()

        assert data["type"] == "snapshot"
        assert "blueprint" in data
        assert "nodes" in data
        assert "levels" in data

        websocket.send_text("ping")

        response = websocket.receive_json()

        assert response["type"] == "pong"


# ==========================================
# TEST 6: MULTIPLE-CLIENT BROADCASTING
# ==========================================

def test_websocket_broadcast():
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
# TEST 7: UDP-TO-WEBSOCKET INTEGRATION
# ==========================================

def test_udp_to_websocket_integration(monkeypatch):

    # Use a temporary UDP port
    monkeypatch.setenv("UDP_PORT", "0")

    with TestClient(app) as test_client:

        # Get the UDP port started by FastAPI
        udp_transport = app.state.udp_transport
        udp_port = udp_transport.get_extra_info("sockname")[1]

        with test_client.websocket_connect("/ws") as websocket:

            # Check the initial snapshot
            snapshot = websocket.receive_json()

            assert snapshot["type"] == "snapshot"

            # Create a simulated sensor packet
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

            # Send the packet through UDP
            with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sender:
                sender.sendto(
                    message.to_bytes(),
                    ("127.0.0.1", udp_port)
                )

            # Receive the UDP reading through WebSocket
            update = websocket.receive_json()

            assert update["type"] == "reading"
            assert update["device"] == "INTEGRATION-TEST"
            assert update["temperature"] == 31.5
            assert update["humidity"] == 58.0