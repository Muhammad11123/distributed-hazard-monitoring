
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

    if (
        value === null ||
        value === undefined ||
        value === "" ||
        !Number.isFinite(number)
    ) {
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

function getSensorStatus(sensor) {
    const rawStatus = sensor.status;

    if (
        rawStatus === null ||
        rawStatus === undefined ||
        rawStatus === ""
    ) {
        return {
            label: "UNKNOWN",
            className: "status-unknown"
        };
    }

    const status = Number(rawStatus);

    if (!Number.isInteger(status)) {
        return {
            label: "UNKNOWN",
            className: "status-unknown"
        };
    }

    if (status === 2) {
        return {
            label: "NORMAL",
            className: "status-safe"
        };
    }

    if ([11, 14, 16].includes(status)) {
        return {
            label: "WARNING",
            className: "status-warning"
        };
    }

    if ([12, 15, 17].includes(status)) {
        return {
            label: "DANGER",
            className: "status-danger"
        };
    }

    if ([0, 1, 3, 4, 5, 6, 7, 8, 9, 10, 13].includes(status)) {
        return {
            label: "FAULT / NOT READY",
            className: "status-unknown"
        };
    }

    return {
        label: "UNKNOWN",
        className: "status-unknown"
    };
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
        const status = getSensorStatus(sensor);

        const card = createElement(
            "article",
            `sensor-card ${status.className}`
        );

        const heading = createElement("div", "card-heading");
        const titleGroup = createElement("div");

        titleGroup.appendChild(
            createElement(
                "h3",
                "",
                sensor.device || "Unknown sensor"
            )
        );

        titleGroup.appendChild(
            createElement(
                "p",
                "card-subtitle",
                sensor.mac_address || ""
            )
        );

        heading.appendChild(titleGroup);

        const statusTag = createElement(
            "span",
            `tag status-tag ${status.className}`,
            status.label
        );

        statusTag.title = `Reported sensor status: ${String(
            sensor.status ?? "not provided"
        )}`;

        heading.appendChild(statusTag);
        card.appendChild(heading);

        const readings = createElement("div", "readings");

        addReading(
            readings,
            "Temperature",
            formatValue(sensor.temperature, "°C")
        );

        addReading(
            readings,
            "Humidity",
            formatValue(sensor.humidity, "%")
        );

        addReading(
            readings,
            "CO₂",
            formatValue(sensor.carbon_dioxide)
        );

        addReading(
            readings,
            "Natural gas",
            formatValue(sensor.natural_gas)
        );

        addReading(
            readings,
            "Carbon monoxide",
            formatValue(sensor.carbon_monoxide)
        );

        addReading(
            readings,
            "Smoke",
            formatValue(sensor.smoke)
        );

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
            createElement(
                "div",
                "empty-state",
                "No rooms configured."
            )
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
            createElement(
                "span",
                "tag",
                room.exit ? "Exit" : "Room"
            )
        );

        card.appendChild(heading);

        card.appendChild(
            createElement(
                "p",
                "card-subtitle",
                `Room ID: ${id}`
            )
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

    const websocket = new WebSocket(
        `${protocol}//${location.host}/ws`
    );

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
                const id = reading.mac_address || reading.device;

                if (id) {
                    sensors.set(id, reading);
                }
            }

            renderSensors();
            renderRooms(data.blueprint);

            if (sensors.size > 0) {
                lastUpdate.textContent =
                    new Date().toLocaleTimeString();
            }
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
