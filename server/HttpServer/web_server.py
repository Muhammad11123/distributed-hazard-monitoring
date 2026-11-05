from fastapi import FastAPI

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