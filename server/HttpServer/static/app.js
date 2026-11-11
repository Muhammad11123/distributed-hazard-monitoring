
const sensors = new Map();
const roomLevels = new Map();

const sensorList = document.getElementById("sensor-list");
const roomList = document.getElementById("room-list");
const floorPlan = document.getElementById("floor-plan");

const sensorCount = document.getElementById("sensor-count");
const roomCount = document.getElementById("room-count");
const lastUpdate = document.getElementById("last-update");

const connectionStatus = document.getElementById("connection-status");
const connectionDot = document.getElementById("connection-dot");

const svgNamespace = "http://www.w3.org/2000/svg";

let currentBlueprint = null;

const roomColours = {
    SAFE: {
        fill: "#dcfce7",
        stroke: "#16a34a",
        text: "#166534"
    },
    WARNING: {
        fill: "#fef3c7",
        stroke: "#d97706",
        text: "#92400e"
    },
    DANGER: {
        fill: "#fee2e2",
        stroke: "#dc2626",
        text: "#991b1b"
    },
    UNKNOWN: {
        fill: "#e2e8f0",
        stroke: "#64748b",
        text: "#334155"
    }
};

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

function svgElement(tag, attributes = {}, text = null) {
    const element = document.createElementNS(svgNamespace, tag);

    for (const [name, value] of Object.entries(attributes)) {
        element.setAttribute(name, String(value));
    }

    if (text !== null) {
        element.textContent = String(text);
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

function getRoomLevel(roomId) {
    const level = String(roomLevels.get(roomId) ?? "").toUpperCase();

    if (["SAFE", "WARNING", "DANGER"].includes(level)) {
        return level;
    }

    return "UNKNOWN";
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
            createElement("h3", "", sensor.device || "Unknown sensor")
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

        const level = getRoomLevel(id);
        const colours = roomColours[level];

        const levelTag = createElement(
            "span",
            "tag",
            `Level: ${level}`
        );

        levelTag.style.backgroundColor = colours.fill;
        levelTag.style.color = colours.text;
        levelTag.style.fontWeight = "700";
        levelTag.style.display = "inline-block";
        levelTag.style.marginTop = "12px";

        card.appendChild(levelTag);
        roomList.appendChild(card);
    }
}

function renderFloorPlan(blueprint) {
    if (!floorPlan) {
        return;
    }

    floorPlan.replaceChildren();

    const rooms = blueprint?.rooms || {};
    const connections = blueprint?.connections || [];

    const validRooms = Object.entries(rooms).filter(
        ([, room]) =>
            room &&
            room.x !== null &&
            room.x !== undefined &&
            room.y !== null &&
            room.y !== undefined &&
            room.x !== "" &&
            room.y !== "" &&
            Number.isFinite(Number(room.x)) &&
            Number.isFinite(Number(room.y))
    );

    if (validRooms.length === 0) {
        floorPlan.appendChild(
            createElement(
                "div",
                "empty-state",
                "No building layout available."
            )
        );
        return;
    }

    const roomPositions = new Map(
        validRooms.map(([id, room]) => [
            id,
            {
                x: Number(room.x),
                y: Number(room.y),
                name: room.name || id,
                exit: room.exit === true
            }
        ])
    );

    const xs = [...roomPositions.values()].map(room => room.x);
    const ys = [...roomPositions.values()].map(room => room.y);

    const paddingX = 100;
    const paddingY = 110;

    const minX = Math.min(...xs) - paddingX;
    const minY = Math.min(...ys) - paddingY;

    const width = Math.max(
        300,
        Math.max(...xs) - Math.min(...xs) + paddingX * 2
    );

    const height = Math.max(
        220,
        Math.max(...ys) - Math.min(...ys) + paddingY * 2
    );

    const svg = svgElement("svg", {
        viewBox: `${minX} ${minY} ${width} ${height}`,
        role: "img",
        "aria-label": "Building connectivity diagram showing reported room hazard levels",
        preserveAspectRatio: "xMidYMid meet"
    });

    svg.classList.add("building-svg");

    for (const connection of connections) {
        if (!Array.isArray(connection) || connection.length < 2) {
            continue;
        }

        const [startId, endId, weight] = connection;
        const start = roomPositions.get(startId);
        const end = roomPositions.get(endId);

        if (!start || !end) {
            continue;
        }

        svg.appendChild(
            svgElement("line", {
                x1: start.x,
                y1: start.y,
                x2: end.x,
                y2: end.y,
                class: "floor-connection"
            })
        );

        if (
            weight !== undefined &&
            weight !== null &&
            weight !== ""
        ) {
            const middleX = (start.x + end.x) / 2;
            const middleY = (start.y + end.y) / 2 - 16;

            svg.appendChild(
                svgElement("rect", {
                    x: middleX - 16,
                    y: middleY - 14,
                    width: 32,
                    height: 25,
                    rx: 5,
                    class: "floor-weight-background"
                })
            );

            svg.appendChild(
                svgElement(
                    "text",
                    {
                        x: middleX,
                        y: middleY + 3,
                        class: "floor-weight-text",
                        "text-anchor": "middle"
                    },
                    weight
                )
            );
        }
    }

    for (const [id, room] of roomPositions) {
        const level = getRoomLevel(id);
        const colours = roomColours[level];

        const group = svgElement("g");

        group.appendChild(
            svgElement("circle", {
                cx: room.x,
                cy: room.y,
                r: 30,
                fill: colours.fill,
                stroke: colours.stroke,
                "stroke-width": 3
            })
        );

        group.appendChild(
            svgElement(
                "text",
                {
                    x: room.x,
                    y: room.y + 5,
                    "text-anchor": "middle",
                    "font-size": 13,
                    "font-weight": 700,
                    fill: colours.text
                },
                room.exit ? "EXIT" : id
            )
        );

        group.appendChild(
            svgElement(
                "text",
                {
                    x: room.x,
                    y: room.y + 52,
                    "text-anchor": "middle",
                    class: "floor-node-label"
                },
                room.name
            )
        );

        group.appendChild(
            svgElement(
                "text",
                {
                    x: room.x,
                    y: room.y + 71,
                    "text-anchor": "middle",
                    "font-size": 12,
                    "font-weight": 700,
                    fill: colours.text
                },
                level
            )
        );

        group.appendChild(
            svgElement(
                "title",
                {},
                `${room.name} (${id}) — ${level}`
            )
        );

        svg.appendChild(group);
    }

    floorPlan.appendChild(svg);

    floorPlan.appendChild(
        createElement(
            "p",
            "floor-plan-note",
            "Colours show reported room levels. Connection weights are not verified distances. Not to scale."
        )
    );
}

function refreshBuilding() {
    if (!currentBlueprint) {
        return;
    }

    renderRooms(currentBlueprint);
    renderFloorPlan(currentBlueprint);
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
            roomLevels.clear();

            currentBlueprint = data.blueprint || null;

            for (const [roomId, level] of Object.entries(data.levels || {})) {
                roomLevels.set(roomId, level);
            }

            for (const reading of data.nodes || []) {
                const id = reading.mac_address || reading.device;

                if (id) {
                    sensors.set(id, reading);
                }
            }

            renderSensors();
            refreshBuilding();

            if (sensors.size > 0) {
                lastUpdate.textContent =
                    new Date().toLocaleTimeString();
            }
        }

        if (data.type === "reading") {
            updateSensor(data);
        }

        if (data.type === "hazard") {
            if (data.room && data.level) {
                roomLevels.set(data.room, data.level);
                refreshBuilding();
            }
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
