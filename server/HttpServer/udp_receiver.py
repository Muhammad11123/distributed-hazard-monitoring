import asyncio

from generated.protocol import Message, ContentType, Information


class UDPReceiver(asyncio.DatagramProtocol):
    """
    Receive UDP sensor packets and decode them
    using the group's existing communication protocol.
    """

    def __init__(self, on_reading):
        self.on_reading = on_reading

    def connection_made(self, transport):
        self.transport = transport
        print("UDP receiver started")

    def datagram_received(self, data, addr):
        try:
            # Validate the expected packet length
            if len(data) != 105:
                print(f"Ignoring packet with unexpected length: {len(data)}")
                return

            # Decode the incoming binary packet
            message = Message().decode(data)

            # Only process sensor information messages
            if message.content_type != ContentType.INFORMATION:
                return

            # Encrypted packets are not supported by this prototype
            if message.is_encrypted:
                return

            info = message.content

            if not isinstance(info, Information):
                return

            # Convert the decoded packet into a Python dictionary
            reading = {
                "device": message.device_name,
                "mac_address": f"{message.mac_address:012X}",
                "ts": message.time_stamp,
                "status": int(info.status),
                "temperature": info.temperature,
                "humidity": info.humidity,
                "carbon_dioxide": info.carbon_dioxide,
                "natural_gas": info.natrual_gas,
                "carbon_monoxide": info.carbon_monoxide,
                "smoke": info.smoke
            }

            # Forward the reading to the supplied callback
            self.on_reading(reading)

        except (ValueError, TypeError, UnicodeError, OverflowError) as error:
            print(f"Invalid sensor packet: {error}")

    def error_received(self, error):
        print(f"UDP receiver error: {error}")


async def start_udp_receiver(on_reading, host="0.0.0.0", port=5005):
    """
    Start listening for UDP sensor messages.
    """
    loop = asyncio.get_running_loop()

    transport, protocol = await loop.create_datagram_endpoint(
        lambda: UDPReceiver(on_reading),
        local_addr=(host, port)
    )

    return transport, protocol