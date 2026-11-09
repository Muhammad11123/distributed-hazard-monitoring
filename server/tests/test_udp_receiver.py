from generated.protocol import Message, Information, ContentType
import asyncio
from server.HttpServer.udp_receiver import UDPReceiver


def test_udp_receiver_decodes_sensor_reading():
    # Store readings received by the callback
    received_readings = []

    # Create the UDP receiver
    receiver = UDPReceiver(received_readings.append)

    # Create a simulated sensor message
    message = Message(
        device_name="TEST-NODE",
        mac_address=0xAABBCCDDEE01,
        content_type=ContentType.INFORMATION,
        content=Information(
            temperature=25.5,
            humidity=60.0,
            carbon_dioxide=450.0,
            status=2
        )
    )

    # Convert the message to binary data
    packet = message.to_bytes()

    # Pass the packet to the receiver
    receiver.datagram_received(packet, ("127.0.0.1", 5005))

    # Check that exactly one reading was received
    assert len(received_readings) == 1

    reading = received_readings[0]

    # Verify the decoded sensor information
    assert reading["device"] == "TEST-NODE"
    assert reading["mac_address"] == "AABBCCDDEE01"
    assert reading["temperature"] == 25.5
    assert reading["humidity"] == 60.0
    assert reading["carbon_dioxide"] == 450.0
    assert reading["status"] == 2

    import asyncio
import socket
import pytest

from server.HttpServer.udp_receiver import start_udp_receiver


@pytest.mark.anyio
async def test_udp_receiver_socket():
    received_readings = []

    # Start a real UDP listener on a temporary local port
    transport, protocol = await start_udp_receiver(
        received_readings.append,
        host="127.0.0.1",
        port=0
    )

    try:
        # Find the port assigned by the operating system
        port = transport.get_extra_info("sockname")[1]

        # Create a simulated sensor packet
        message = Message(
            device_name="SOCKET-TEST",
            mac_address=0xAABBCCDDEE02,
            content_type=ContentType.INFORMATION,
            content=Information(
                temperature=27.5,
                humidity=55.0,
                status=2
            )
        )

        # Send the packet over a real UDP socket
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sender:
            sender.sendto(message.to_bytes(), ("127.0.0.1", port))

        # Give the receiver a short opportunity to process the packet
        for _ in range(50):
            if received_readings:
                break
            await asyncio.sleep(0.01)

        # Check the received sensor information
        assert len(received_readings) == 1
        assert received_readings[0]["device"] == "SOCKET-TEST"
        assert received_readings[0]["temperature"] == 27.5
        assert received_readings[0]["humidity"] == 55.0

    finally:
        # Always close the UDP listener
        transport.close()