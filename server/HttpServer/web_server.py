from fastapi import FastAPI
import json
from pathlib import Path

# Create the FastAPI application
app = FastAPI()

# Create an API endpoint
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
def get_history(room: str):
    # Temporary simulated readings
    history = [
        {"room": "A", "temperature": 21.5, "humidity": 40.0},
        {"room": "A", "temperature": 22.0, "humidity": 42.0},
        {"room": "B", "temperature": 23.0, "humidity": 45.0}
    ]

    # Return readings for the requested room
    return [reading for reading in history if reading["room"] == room]
