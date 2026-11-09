from fastapi import FastAPI, Query, WebSocket, WebSocketDisconnect
from pathlib import Path
import json

# Create the FastAPI application
app = FastAPI()


# ==========================================
# REST API ENDPOINTS
# ==========================================

@app.get("/api/nodes")
def get_nodes():
    return {
        "room": "A",
        "temperature": 25,
        "humidity": 55,
        "status": "normal"
    }


@app.get("/api/blueprint")
def get_blueprint():
    blueprint_path = Path("config/blueprint.json")

    with open(blueprint_path, "r") as file:
        blueprint = json.load(file)

    return blueprint


@app.get("/api/history")
def get_history(
    room: str,
    from_time: float | None = Query(default=None, alias="from"),
    to_time: float | None = Query(default=None, alias="to")
):
    # Temporary simulated sensor readings
    history = [
        {"room": "A", "ts": 1000, "temperature": 21.5, "humidity": 40.0},
        {"room": "A", "ts": 2000, "temperature": 22.0, "humidity": 42.0},
        {"room": "B", "ts": 1500, "temperature": 23.0, "humidity": 45.0}
    ]

    return [
        reading for reading in history
        if reading["room"] == room
        and (from_time is None or reading["ts"] >= from_time)
        and (to_time is None or reading["ts"] <= to_time)
    ]


# ==========================================
# WEBSOCKET CONNECTION MANAGER
# ==========================================

class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        # Send the same message to every connected dashboard
        for connection in self.active_connections.copy():
            try:
                await connection.send_json(message)
            except Exception:
                # Remove connections that can no longer receive updates
                self.disconnect(connection)


# Create the connection manager
manager = ConnectionManager()


# ==========================================
# WEBSOCKET ENDPOINT
# ==========================================

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):

    # Register the connected dashboard
    await manager.connect(websocket)

    try:
        # Send initial building and sensor information
        await websocket.send_json({
            "type": "snapshot",
            "blueprint": get_blueprint(),
            "nodes": [get_nodes()],
            "levels": {"A": "SAFE"}
        })

        # Keep listening while the dashboard is connected
        while True:
            message = await websocket.receive_text()

            # Check that two-way communication works
            if message == "ping":
                await websocket.send_json({
                    "type": "pong"
                })

            # Temporary simulation for testing broadcasting
            elif message == "demo_reading":
                await manager.broadcast({
                    "type": "reading",
                    "room": "A",
                    "temperature": 30,
                    "humidity": 60,
                    "status": "normal"
                })

    except WebSocketDisconnect:
        pass

    finally:
        # Remove the dashboard when its connection ends
        manager.disconnect(websocket)