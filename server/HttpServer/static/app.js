
const sensors = new Map();
const roomLevels = new Map();
const hazardReasons = new Map();

const sensorList = document.getElementById("sensor-list");
const roomList = document.getElementById("room-list");
const floorPlan = document.getElementById("floor-plan");

const sensorCount = document.getElementById("sensor-count");
const roomCount = document.getElementById("room-count");
const lastUpdate = document.getElementById("last-update");

const connectionStatus = document.getElementById("connection-status");
const connectionDot = document.getElementById("connection-dot");

const dangerBanner = document.getElementById("danger-banner");
const dangerBannerTitle = document.getElementById("danger-banner-title");
const dangerBannerMessage = document.getElementById("danger-banner-message");

const historyRoom = document.getElementById("history-room");
const historyStatus = document.getElementById("history-status");
const refreshHistoryButton = document.getElementById("refresh-history");
const temperatureChart = document.getElementById("temperature-chart");
const humidityChart = document.getElementById("humidity-chart");

const replayRoom = document.getElementById("replay-room");
const replayFrom = document.getElementById("replay-from");
const replayTo = document.getElementById("replay-to");
const loadReplayButton = document.getElementById("load-replay");
const replayStatus = document.getElementById("replay-status");
const replayDisplay = document.getElementById("replay-display");
const replayPosition = document.getElementById("replay-position");
const replayTimestamp = document.getElementById("replay-timestamp");
const replayValues = document.getElementById("replay-values");
const replayPrevious = document.getElementById("replay-previous");
const replayNext = document.getElementById("replay-next");

const svgNamespace = "http://www.w3.org/2000/svg";

let currentBlueprint = null;
let selectedRoom = new URLSearchParams(window.location.search).get("room");
let historyRequestId = 0;

let replayReadings = [];
let replayIndex = 0;
let replayRequestId = 0;

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

    renderDangerBanner();
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
    const level = String(roomLevels.get(roomId) ?? "")
        .trim()
        .toUpperCase();

    if (["SAFE", "WARNING", "DANGER"].includes(level)) {
        return level;
    }

    return "UNKNOWN";
}

function renderDangerBanner() {
    const dangerRooms = [...roomLevels.keys()].filter(
        roomId =>
            getRoomLevel(roomId) === "DANGER" &&
            currentBlueprint?.rooms?.[roomId]
    );

    if (dangerRooms.length === 0) {
        dangerBanner.hidden = true;
        return;
    }

    dangerBannerTitle.textContent =
        dangerRooms.length === 1
            ? "DANGER reported in building"
            : "DANGER reported in multiple rooms";

    const details = dangerRooms.map(roomId => {
        const name = currentBlueprint.rooms[roomId].name || roomId;
        const reason = hazardReasons.get(roomId);

        return reason ? `${name}: ${reason}` : name;
    });

    let message = details.join(" · ");

    if (connectionStatus.textContent !== "Connected") {
        message += " — Connection lost; hazard information may be outdated.";
    }

    dangerBannerMessage.textContent = message;
    dangerBanner.hidden = false;
}

function selectRoom(roomId) {
    if (!currentBlueprint?.rooms?.[roomId]) {
        return;
    }

    selectedRoom = roomId;

    const url = new URL(window.location.href);
    url.searchParams.set("room", roomId);
    window.history.replaceState(null, "", url);

    refreshBuilding();
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

        if (selectedRoom === id) {
            card.style.outline = "3px solid #2563eb";
            card.style.outlineOffset = "2px";

            card.appendChild(
                createElement(
                    "p",
                    "card-subtitle",
                    "Selected starting location"
                )
            );
        }

        roomList.appendChild(card);
    }
}

function renderFloorPlan(blueprint) {
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
        role: "group",
        "aria-label": "Building diagram. Select a room to set the starting location.",
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
        const isSelected = selectedRoom === id;

        const group = svgElement("g", {
            role: "button",
            tabindex: "0",
            "aria-label": `Select ${room.name} as starting location`,
            "aria-pressed": isSelected ? "true" : "false"
        });

        group.style.cursor = "pointer";

        if (isSelected) {
            group.appendChild(
                svgElement("circle", {
                    cx: room.x,
                    cy: room.y,
                    r: 38,
                    fill: "none",
                    stroke: "#2563eb",
                    "stroke-width": 4,
                    "stroke-dasharray": "7 4"
                })
            );
        }

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

        group.addEventListener("click", () => {
            selectRoom(id);
        });

        group.addEventListener("keydown", event => {
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                selectRoom(id);
            }
        });

        svg.appendChild(group);
    }

    floorPlan.appendChild(svg);

    const selectionMessage =
        selectedRoom && rooms[selectedRoom]
            ? `Selected starting location: ${rooms[selectedRoom].name || selectedRoom} (${selectedRoom})`
            : "Select a location on the diagram to set your starting room.";

    const selectionLabel = createElement(
        "p",
        "floor-plan-note",
        selectionMessage
    );

    selectionLabel.style.fontWeight = "700";
    selectionLabel.style.color = "#1d4ed8";

    floorPlan.appendChild(selectionLabel);

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
    renderDangerBanner();
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

function showEmptyChart(container, message) {
    container.replaceChildren(
        createElement("div", "empty-state", message)
    );
}

function renderHistoryChart(container, readings, field, label, unit, colour) {
    container.replaceChildren();

    const points = readings
        .filter(item =>
            item &&
            item.ts !== null &&
            item.ts !== undefined &&
            item[field] !== null &&
            item[field] !== undefined &&
            item[field] !== ""
        )
        .map(item => ({
            ts: Number(item.ts),
            value: Number(item[field])
        }))
        .filter(item =>
            Number.isFinite(item.ts) &&
            Number.isFinite(item.value)
        )
        .sort((a, b) => a.ts - b.ts);

    if (points.length === 0) {
        showEmptyChart(
            container,
            `No ${label.toLowerCase()} history available.`
        );
        return;
    }

    const width = 580;
    const height = 270;
    const left = 62;
    const right = 20;
    const top = 25;
    const bottom = 55;

    const plotWidth = width - left - right;
    const plotHeight = height - top - bottom;

    const rawMinX = Math.min(...points.map(point => point.ts));
    const rawMaxX = Math.max(...points.map(point => point.ts));
    const rawMinY = Math.min(...points.map(point => point.value));
    const rawMaxY = Math.max(...points.map(point => point.value));

    const xMin = rawMinX;
    const xMax = rawMaxX === rawMinX ? rawMinX + 1 : rawMaxX;

    const marginY = Math.max((rawMaxY - rawMinY) * 0.15, 1);
    const yMin = rawMinY - marginY;
    const yMax = rawMaxY + marginY;

    const xPosition = ts =>
        left + ((ts - xMin) / (xMax - xMin)) * plotWidth;

    const yPosition = value =>
        top + (1 - (value - yMin) / (yMax - yMin)) * plotHeight;

    const svg = svgElement("svg", {
        viewBox: `0 0 ${width} ${height}`,
        role: "img",
        "aria-label": `${label} history chart with ${points.length} readings`
    });

    svg.classList.add("history-svg");

    for (let index = 0; index <= 4; index++) {
        const fraction = index / 4;
        const y = top + fraction * plotHeight;
        const value = yMax - fraction * (yMax - yMin);

        svg.appendChild(
            svgElement("line", {
                x1: left,
                y1: y,
                x2: width - right,
                y2: y,
                stroke: "#e2e8f0",
                "stroke-width": 1
            })
        );

        svg.appendChild(
            svgElement("text", {
                x: left - 10,
                y: y + 4,
                "text-anchor": "end",
                "font-size": 12,
                fill: "#64748b"
            }, value.toFixed(1))
        );
    }

    const labels = [
        { ts: rawMinX, x: left },
        { ts: rawMaxX, x: width - right }
    ];

    if (rawMinX === rawMaxX) {
        labels.pop();
    }

    for (const labelPoint of labels) {
        svg.appendChild(
            svgElement("text", {
                x: labelPoint.x,
                y: height - 30,
                "text-anchor": labelPoint.x === left ? "start" : "end",
                "font-size": 12,
                fill: "#64748b"
            }, labelPoint.ts)
        );
    }

    svg.appendChild(
        svgElement("text", {
            x: width / 2,
            y: height - 8,
            "text-anchor": "middle",
            "font-size": 12,
            fill: "#64748b"
        }, "Timestamp (raw API value)")
    );

    const pathData = points.map((point, index) => {
        const x = xPosition(point.ts);
        const y = yPosition(point.value);

        return `${index === 0 ? "M" : "L"} ${x} ${y}`;
    }).join(" ");

    svg.appendChild(
        svgElement("path", {
            d: pathData,
            fill: "none",
            stroke: colour,
            "stroke-width": 3,
            "stroke-linejoin": "round",
            "stroke-linecap": "round"
        })
    );

    for (const point of points) {
        const circle = svgElement("circle", {
            cx: xPosition(point.ts),
            cy: yPosition(point.value),
            r: 5,
            fill: colour,
            stroke: "white",
            "stroke-width": 2
        });

        circle.appendChild(
            svgElement(
                "title",
                {},
                `${label}: ${point.value.toFixed(1)}${unit} at timestamp ${point.ts}`
            )
        );

        svg.appendChild(circle);
    }

    container.appendChild(svg);

    container.appendChild(
        createElement(
            "p",
            "chart-summary",
            `${points.length} reading(s) · Latest plotted value: ${points[points.length - 1].value.toFixed(1)}${unit}`
        )
    );
}

function populateHistoryRooms() {
    const rooms = currentBlueprint?.rooms || {};
    const previousSelection = historyRoom.value;

    historyRoom.replaceChildren();

    const entries = Object.entries(rooms).filter(
        ([, room]) => room.exit !== true
    );

    if (entries.length === 0) {
        historyRoom.appendChild(
            new Option("No rooms available", "")
        );
        historyRoom.disabled = true;
        refreshHistoryButton.disabled = true;
        return;
    }

    for (const [id, room] of entries) {
        historyRoom.appendChild(
            new Option(room.name || id, id)
        );
    }

    const preferredRoom = [
        previousSelection,
        selectedRoom,
        entries[0][0]
    ].find(id => entries.some(([roomId]) => roomId === id));

    historyRoom.value = preferredRoom;
    historyRoom.disabled = false;
    refreshHistoryButton.disabled = false;

    loadHistory();
}

async function loadHistory() {
    const roomId = historyRoom.value;
    const requestId = ++historyRequestId;

    if (!roomId) {
        return;
    }

    historyStatus.textContent = "Loading history...";
    refreshHistoryButton.disabled = true;

    try {
        const response = await fetch(
            `/api/history?${new URLSearchParams({ room: roomId })}`,
            { cache: "no-store" }
        );

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const readings = await response.json();

        if (!Array.isArray(readings)) {
            throw new Error("Unexpected history response format");
        }

        if (requestId !== historyRequestId) {
            return;
        }

        const roomName =
            currentBlueprint?.rooms?.[roomId]?.name || roomId;

        historyStatus.textContent =
            `${roomName}: ${readings.length} historical reading(s) returned.`;

        renderHistoryChart(
            temperatureChart,
            readings,
            "temperature",
            "Temperature",
            "°C",
            "#2563eb"
        );

        renderHistoryChart(
            humidityChart,
            readings,
            "humidity",
            "Humidity",
            "%",
            "#0f766e"
        );
    } catch (error) {
        if (requestId !== historyRequestId) {
            return;
        }

        historyStatus.textContent =
            `Unable to load history: ${error.message}`;

        showEmptyChart(temperatureChart, "History unavailable.");
        showEmptyChart(humidityChart, "History unavailable.");
    } finally {
        if (requestId === historyRequestId) {
            refreshHistoryButton.disabled = false;
        }
    }
}

function resetReplay(message) {
    replayRequestId += 1;
    replayReadings = [];
    replayIndex = 0;

    replayDisplay.hidden = true;
    replayValues.replaceChildren();
    replayPosition.textContent = "Reading 0 of 0";
    replayTimestamp.textContent = "Timestamp: --";
    replayPrevious.disabled = true;
    replayNext.disabled = true;
    replayStatus.textContent = message;
}

function populateReplayRooms() {
    const rooms = currentBlueprint?.rooms || {};
    const previousSelection = replayRoom.value;

    replayRoom.replaceChildren();

    const entries = Object.entries(rooms).filter(
        ([, room]) => room.exit !== true
    );

    if (entries.length === 0) {
        replayRoom.appendChild(
            new Option("No rooms available", "")
        );
        replayRoom.disabled = true;
        loadReplayButton.disabled = true;
        resetReplay("No rooms are available for replay.");
        return;
    }

    for (const [id, room] of entries) {
        replayRoom.appendChild(
            new Option(room.name || id, id)
        );
    }

    const preferredRoom = [
        previousSelection,
        selectedRoom,
        entries[0][0]
    ].find(id => entries.some(([roomId]) => roomId === id));

    replayRoom.value = preferredRoom;
    replayRoom.disabled = false;
    loadReplayButton.disabled = false;

    resetReplay("Select a room and load a replay preview.");
}

function renderReplayReading() {
    if (replayReadings.length === 0) {
        replayDisplay.hidden = true;
        return;
    }

    const reading = replayReadings[replayIndex];

    replayDisplay.hidden = false;

    replayPosition.textContent =
        `Reading ${replayIndex + 1} of ${replayReadings.length}`;

    replayTimestamp.textContent =
        `Timestamp: ${reading.ts ?? "N/A"}`;

    replayValues.replaceChildren();

    const fields = [
        ["Temperature", "temperature", "°C"],
        ["Humidity", "humidity", "%"],
        ["CO₂", "carbon_dioxide", ""],
        ["Natural gas", "natural_gas", ""],
        ["Carbon monoxide", "carbon_monoxide", ""],
        ["Smoke", "smoke", ""]
    ];

    for (const [label, key, unit] of fields) {
        if (!Object.prototype.hasOwnProperty.call(reading, key)) {
            continue;
        }

        const item = createElement("div", "replay-value");

        item.appendChild(
            createElement("span", "", label)
        );

        item.appendChild(
            createElement(
                "strong",
                "",
                formatValue(reading[key], unit)
            )
        );

        replayValues.appendChild(item);
    }

    if (replayValues.children.length === 0) {
        replayValues.appendChild(
            createElement(
                "p",
                "empty-state",
                "No environmental measurements in this reading."
            )
        );
    }

    replayPrevious.disabled = replayIndex === 0;
    replayNext.disabled =
        replayIndex >= replayReadings.length - 1;
}

async function loadReplayPreview() {
    const room = replayRoom.value;
    const fromValue = replayFrom.value.trim();
    const toValue = replayTo.value.trim();

    if (!room || !currentBlueprint?.rooms?.[room]) {
        resetReplay("Select a valid room.");
        return;
    }

    if (fromValue === "" || toValue === "") {
        resetReplay("Enter both timestamps.");
        return;
    }

    const fromTime = Number(fromValue);
    const toTime = Number(toValue);

    if (
        !Number.isFinite(fromTime) ||
        !Number.isFinite(toTime)
    ) {
        resetReplay("Both timestamps must be valid numbers.");
        return;
    }

    if (fromTime > toTime) {
        resetReplay("The start timestamp must not exceed the end timestamp.");
        return;
    }

    resetReplay("Loading replay preview...");

    const requestId = replayRequestId;
    loadReplayButton.disabled = true;

    try {
        const response = await fetch("/api/replay", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                room: room,
                from_time: fromTime,
                to_time: toTime
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();

        if (
            data.type !== "replay" ||
            !Array.isArray(data.readings)
        ) {
            throw new Error("Unexpected replay response format");
        }

        if (requestId !== replayRequestId) {
            return;
        }

        replayReadings = data.readings
            .filter(item =>
                item &&
                item.ts !== null &&
                item.ts !== undefined &&
                Number.isFinite(Number(item.ts))
            )
            .sort((a, b) => Number(a.ts) - Number(b.ts));

        replayIndex = 0;

        const roomName =
            currentBlueprint.rooms[room]?.name || room;

        if (replayReadings.length === 0) {
            replayStatus.textContent =
                `No replay readings found for ${roomName} in this range.`;
            replayDisplay.hidden = true;
            return;
        }

        replayStatus.textContent =
            `${replayReadings.length} reading(s) loaded for ${roomName}. ` +
            "Use Previous and Next to inspect them.";

        renderReplayReading();
    } catch (error) {
        if (requestId !== replayRequestId) {
            return;
        }

        resetReplay(
            `Unable to load replay preview: ${error.message}`
        );
    } finally {
        if (requestId === replayRequestId) {
            loadReplayButton.disabled = false;
        }
    }
}

function showPreviousReplayReading() {
    if (replayIndex > 0) {
        replayIndex -= 1;
        renderReplayReading();
    }
}

function showNextReplayReading() {
    if (replayIndex < replayReadings.length - 1) {
        replayIndex += 1;
        renderReplayReading();
    }
}

historyRoom.addEventListener("change", loadHistory);
refreshHistoryButton.addEventListener("click", loadHistory);

replayRoom.addEventListener("change", () => {
    resetReplay("Room changed. Load a new replay preview.");
});

replayFrom.addEventListener("input", () => {
    resetReplay("Time range changed. Load a new replay preview.");
});

replayTo.addEventListener("input", () => {
    resetReplay("Time range changed. Load a new replay preview.");
});

loadReplayButton.addEventListener("click", loadReplayPreview);
replayPrevious.addEventListener("click", showPreviousReplayReading);
replayNext.addEventListener("click", showNextReplayReading);

function connectWebSocket() {
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";

    const websocket = new WebSocket(
        `${protocol}//${location.host}/ws`
    );

    websocket.onopen = () => {
        setConnectionStatus("Connected");
    };

    websocket.onmessage = event => {
        let data;

        try {
            data = JSON.parse(event.data);
        } catch {
            return;
        }

        if (data.type === "snapshot") {
            sensors.clear();
            roomLevels.clear();
            hazardReasons.clear();

            currentBlueprint = data.blueprint || null;

            if (
                selectedRoom &&
                !currentBlueprint?.rooms?.[selectedRoom]
            ) {
                selectedRoom = null;
            }

            for (const [roomId, level] of Object.entries(data.levels || {})) {
                if (currentBlueprint?.rooms?.[roomId]) {
                    roomLevels.set(roomId, level);
                }
            }

            for (const reading of data.nodes || []) {
                const id = reading.mac_address || reading.device;

                if (id) {
                    sensors.set(id, reading);
                }
            }

            renderSensors();
            refreshBuilding();
            populateHistoryRooms();
            populateReplayRooms();

            if (sensors.size > 0) {
                lastUpdate.textContent =
                    new Date().toLocaleTimeString();
            }
        }

        if (data.type === "reading") {
            updateSensor(data);
        }

        if (data.type === "hazard") {
            if (currentBlueprint?.rooms?.[data.room] && data.level) {
                roomLevels.set(data.room, data.level);

                if (getRoomLevel(data.room) === "DANGER" && data.reason) {
                    hazardReasons.set(data.room, String(data.reason));
                } else {
                    hazardReasons.delete(data.room);
                }

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
