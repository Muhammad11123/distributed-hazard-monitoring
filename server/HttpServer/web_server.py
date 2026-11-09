from fastapi import FastAPI, Query, WebSocket, WebSocketDisconnect
from pathlib import Path
import json

# Create the FastAPI application
app = FastAPI()


# API endpoint for sensor readings
@app.get("/api/nodes")
def get_nodes():
    return {
        "room": "A",
        "temperature": 25,
        "humidity": 55,
        "status": "normal"
    }


# API endpoint for the building blueprint
@app.get("/api/blueprint")
def get_blueprint():
    blueprint_path = Path("config/blueprint.json")

    with open(blueprint_path, "r") as file:
        blueprint = json.load(file)

    return blueprint


# API endpoint for historical sensor readings
@app.get("/api/history")
def get_history(
    room: str,
    from_time: float | None = Query(default=None, alias="from"),
    to_time: float | None = Query(default=None, alias="to")
):
    # Temporary simulated readings
    history = [
        {"room": "A", "ts": 1000, "temperature": 21.5, "humidity": 40.0},
        {"room": "A", "ts": 2000, "temperature": 22.0, "humidity": 42.0},
        {"room": "B", "ts": 1500, "temperature": 23.0, "humidity": 45.0}
    ]

    # Return readings for the requested room and time range
    return [
        reading for reading in history
        if reading["room"] == room
        and (from_time is None or reading["ts"] >= from_time)
        and (to_time is None or reading["ts"] <= to_time)
    ]


# WebSocket endpoint for real-time sensor updates
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    # Accept the WebSocket connection
    await websocket.accept()

    # Send initial snapshot to the dashboard
    await websocket.send_json({
        "type": "snapshot",
        "blueprint": get_blueprint(),
        "nodes": [get_nodes()],
        "levels": {"A": "SAFE"}
    })

    # Keep the connection open
    try:
        while True:
            message = await websocket.receive_text()

            # Respond to ping messages
            if message == "ping":
                await websocket.send_json({
                    "type": "pong"
                })

    # Handle dashboard disconnections
    except WebSocketDisconnect:
        pass