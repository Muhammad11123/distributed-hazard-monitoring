
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
        # Store all connected WebSocket clients
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        # Send updates to every connected dashboard
        for connection in self.active_connections.copy():
            try:
                await connection.send_json(message)
            except Exception:
                # Remove connections that cannot receive updates
                self.disconnect(connection)


# Create the connection manager
manager = ConnectionManager()


# ==========================================
# LATEST SENSOR READINGS
# ==========================================

# Store the latest reading from each sensor.
# Each sensor is identified by its MAC address.
# This is temporary in-memory storage.

latest_readings: dict[str, dict] = {}


# ==========================================
# UDP RECEIVER LIFECYCLE
# ==========================================

@asynccontextmanager
async def lifespan(app: FastAPI):

    # Track pending WebSocket broadcast tasks
    pending_tasks = set()

    def on_sensor_reading(reading: dict):

        # Store the latest reading using the device's MAC address
        latest_readings[reading["mac_address"]] = reading

        # Broadcast the new reading to connected dashboards
        task = asyncio.create_task(
            manager.broadcast({
                "type": "reading",
                **reading
            })
        )

        # Track the task until it finishes
        pending_tasks.add(task)
        task.add_done_callback(pending_tasks.discard)

    # Use UDP port 5005 by default.
    # Tests can use UDP_PORT=0 for a temporary port.
    udp_port = int(os.getenv("UDP_PORT", "5005"))

    # Start the UDP receiver
    transport, protocol = await start_udp_receiver(
        on_sensor_reading,
        host="0.0.0.0",
        port=udp_port
    )

    # Store the transport for integration testing
    app.state.udp_transport = transport

    try:
        # Keep the receiver active while FastAPI runs
        yield

    finally:
        # Stop receiving UDP packets
        transport.close()

        # Finish any outstanding broadcasts
        if pending_tasks:
            await asyncio.gather(
                *pending_tasks,
                return_exceptions=True
            )


# Create the FastAPI application
app = FastAPI(lifespan=lifespan)


# ==========================================
# REST API: LATEST SENSOR READINGS
# ==========================================

@app.get("/api/nodes")
def get_nodes():
    # Return the latest reading for each known sensor
    return list(latest_readings.values())


# ==========================================
# REST API: BUILDING BLUEPRINT
# ==========================================

@app.get("/api/blueprint")
def get_blueprint():

    blueprint_path = Path("config/blueprint.json")

    with open(blueprint_path, "r") as file:
        blueprint = json.load(file)

    return blueprint


# ==========================================
# REST API: HISTORICAL SENSOR READINGS
# ==========================================

@app.get("/api/history")
def get_history(
    room: str,
    from_time: float | None = Query(default=None, alias="from"),
    to_time: float | None = Query(default=None, alias="to")
):

    # Temporary simulated historical readings
    # SQLite integration is still pending.
    history = [
        {
            "room": "A",
            "ts": 1000,
            "temperature": 21.5,
            "humidity": 40.0
        },
        {
            "room": "A",
            "ts": 2000,
            "temperature": 22.0,
            "humidity": 42.0
        },
        {
            "room": "B",
            "ts": 1500,
            "temperature": 23.0,
            "humidity": 45.0
        }
    ]

    # Filter readings by room and optional time range
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

    # Register the connected dashboard
    await manager.connect(websocket)

    try:

        # Send the initial building and sensor snapshot
        await websocket.send_json({
            "type": "snapshot",
            "blueprint": get_blueprint(),
            "nodes": get_nodes(),
            "levels": {"A": "SAFE"}
        })

        # Keep the WebSocket connection open
        while True:

            message = await websocket.receive_text()

            # Test two-way WebSocket communication
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
        # Remove the client when disconnected
        manager.disconnect(websocket)
