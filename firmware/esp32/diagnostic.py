"""USB-only entry point for a bare ESP32_GENERIC; no sensors or storage."""
from main import StdioStreamTransport, asyncio, main_loop


def main():
    asyncio.run(main_loop(StdioStreamTransport(), diagnostic_only=True))


if __name__ == '__main__':
    main()
