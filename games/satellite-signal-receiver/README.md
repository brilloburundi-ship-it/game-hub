# Satellite Signal Receiver

Receive-only ground-station app for **public weather and amateur satellite downlinks**. The Game Hub page is the UI; real RF reception is performed by `receiver_bridge.py` on a PC connected to an RTL-SDR-compatible USB receiver and antenna.

## What is real

When the local bridge is running and an SDR is connected, the spectrum, waterfall, signal level and FM audio come from the USB radio. The bridge never transmits RF and contains no satellite command path.

## Quick start on Windows

1. Connect an RTL-SDR-compatible USB receiver and a suitable VHF/UHF antenna.
2. Make sure the RTL-SDR driver/library is installed for your device.
3. Double-click `AVVIA_RICEVITORE.bat`.
4. The first launch creates a local Python environment and installs the Python packages.
5. A browser opens at `http://127.0.0.1:8765/`.
6. Press **Connetti RTL-SDR** and tune one of the enabled public satellite bands.

## Enabled receive-only bands

- 137–138 MHz: weather-satellite downlinks.
- 145.8–146.0 MHz: amateur-satellite VHF downlinks.
- 435–438 MHz: amateur-satellite UHF downlinks.

The bridge rejects frequencies outside these ranges. Frequency allocations and station rules vary by country; receive only transmissions you are permitted to receive.

## Game Hub vs local mode

GitHub Pages cannot directly access an RTL-SDR attached to a PC. The deployed Game Hub URL therefore acts as the UI/demo. Real reception is available through the local bridge on the computer connected to the SDR. The bridge serves the same UI locally so RF samples remain on that computer.

## Architecture

`RTL-SDR -> receiver_bridge.py -> FFT + FM discriminator -> WebSocket -> browser spectrum / waterfall / audio`
