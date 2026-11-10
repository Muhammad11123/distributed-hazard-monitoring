
const sensors = new Map();

const sensorList = document.getElementById("sensor-list");
const roomList = document.getElementById("room-list");

const sensorCount = document.getElementById("sensor-count");
const roomCount = document.getElementById("room-count");
const lastUpdate = document.getElementById("last-update");

const connectionStatus = document.getElementById("connection-status");
const connectionDot = document.getElementById("connection-dot");

function setConnectionStatus(status) {
    connectionStatus.textContent = status;
    connectionDot.className = "dot";

    if (status === "Connected") {
        connectionDot.classList.add("connected");
    } else if (status === "Disconnected") {
        connectionDot.classList.add("disconnected");
    }
}

function formatValue(value, unit = "") {
    const number = Number(value);

    if (value === null || value === undefined ||
        !Number.isFinite(number)) {
        return "N/A";
    }

    return `${number.toFixed(1)}${unit}`;
}

function createElement(tag, className, text) {
    const element = document.createElement(tag);

    if (className) {
        element.className = className;
    }

    if (text !== undefined) {
        element.textContent = text;
    }

    return element;
}

function addReading(container, label, value) {
    const item = createElement("div", "reading");
    item.appendChild(createElement("span", "", label));
    item.appendChild(createElement("strong", "", value));
    container.appendChild(item);
}

function renderSensors() {
    sensorList.replaceChildren();
    sensorCount.textContent = sensors.size;

    if (sensors.size === 0) {
        sensorList.appendChild(
            createElement(
                "div",
                "empty-state",
                "No sensor readings received yet."
            )
        );
        return;
    }

    for (const sensor of sensors.values()) {
        const card = createElement("article", "sensor-card");
        const heading = createElement("div", "card-heading");
        const titleGroup = createElement("div");

        titleGroup.appendChild(
            createElement("h3", "", sensor.device || "Unknown sensor")
        );

        titleGroup.appendChild(
            createElement("p", "card-subtitle", sensor.mac_address || "")
        );

        heading.appendChild(titleGroup);
        heading.appendChild(
            createElement("span", "tag", "Status: " + (sensor.status ?? "Unknown"))
        );

        card.appendChild(heading);

        const readings = createElement("div", "readings");

        addReading(readings, "Temperature", formatValue(sensor.temperature, "°C"));
        addReading(readings, "Humidity", formatValue(sensor.humidity, "%"));
        addReading(readings, "CO₂", formatValue(sensor.carbon_dioxide));
        addReading(readings, "Natural gas", formatValue(sensor.natural_gas));
        addReading(readings, "Carbon monoxide", formatValue(sensor.carbon_monoxide));
        addReading(readings, "Smoke", formatValue(sensor.smoke));

        card.appendChild(readings);
        sensorList.appendChild(card);
    }
}

function renderRooms(blueprint) {
    roomList.replaceChildren();

    const rooms = blueprint?.rooms || {};
    const entries = Object.entries(rooms);

    roomCount.textContent = entries.length;

    if (entries.length === 0) {
        roomList.appendChild(
            createElement("div", "empty-state", "No rooms configured.")
        );
        return;
    }

    for (const [id, room] of entries) {
        const card = createElement("article", "room-card");
        const heading = createElement("div", "card-heading");

        heading.appendChild(
            createElement("h3", "", room.name || id)
        );

        heading.appendChild(
            createElement("span", "tag", room.exit ? "Exit" : "Room")
        );

        card.appendChild(heading);
        card.appendChild(
            createElement("p", "card-subtitle", `Room ID: ${id}`)
        );

        roomList.appendChild(card);
    }
}

function updateSensor(reading) {
    const id = reading.mac_address || reading.device;

    if (!id) {
        return;
    }

    sensors.set(id, reading);
    lastUpdate.textContent = new Date().toLocaleTimeString();

    renderSensors();
}

function connectWebSocket() {
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const websocket = new WebSocket(`${protocol}//${location.host}/ws`);

    websocket.onopen = () => {
        setConnectionStatus("Connected");
    };

    websocket.onmessage = (event) => {
        let data;

        try {
            data = JSON.parse(event.data);
        } catch {
            return;
        }

        if (data.type === "snapshot") {
            sensors.clear();

            for (const reading of data.nodes || []) {
                updateSensor(reading);
            }

            renderSensors();
            renderRooms(data.blueprint);
        }

        if (data.type === "reading") {
            updateSensor(data);
        }
    };

    websocket.onclose = () => {
        setConnectionStatus("Disconnected");
        setTimeout(connectWebSocket, 3000);
    };

    websocket.onerror = () => {
        websocket.close();
    };
}

renderSensors();
connectWebSocket();
