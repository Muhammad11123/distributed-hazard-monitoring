import asyncio
import json
import os

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Query, WebSocket, WebSocketDisconnect

from server.HttpServer.udp_receiver import start_udp_receiver


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
        for connection in self.active_connections.copy():
            try:
                await connection.send_json(message)
            except Exception:
                self.disconnect(connection)


manager = ConnectionManager()


# ==========================================
# UDP RECEIVER LIFECYCLE
# ==========================================

@asynccontextmanager
async def lifespan(app: FastAPI):

    # Track pending broadcast tasks
    pending_tasks = set()

    def on_sensor_reading(reading: dict):
        # Schedule a WebSocket broadcast when UDP data arrives
        task = asyncio.create_task(
            manager.broadcast({
                "type": "reading",
                **reading
            })
        )

        pending_tasks.add(task)
        task.add_done_callback(pending_tasks.discard)

    # Port 5005 matches the group's simulator.
    # Port 0 allows tests to request a temporary available port.
    udp_port = int(os.getenv("UDP_PORT", "5005"))

    transport, protocol = await start_udp_receiver(
        on_sensor_reading,
        host="0.0.0.0",
        port=udp_port
    )

    app.state.udp_transport = transport

    try:
        yield
    finally:
        transport.close()

        if pending_tasks:
            await asyncio.gather(
                *pending_tasks,
                return_exceptions=True
            )


app = FastAPI(lifespan=lifespan)


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
# WEBSOCKET ENDPOINT
# ==========================================

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):

    await manager.connect(websocket)

    try:
        # Send the initial snapshot
        await websocket.send_json({
            "type": "snapshot",
            "blueprint": get_blueprint(),
            "nodes": [get_nodes()],
            "levels": {"A": "SAFE"}
        })

        while True:
            message = await websocket.receive_text()

            if message == "ping":
                await websocket.send_json({
                    "type": "pong"
                })

            # Temporary demonstration command
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
        manager.disconnect(websocket)