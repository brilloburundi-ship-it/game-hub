import asyncio
import threading
import time
import webbrowser
from pathlib import Path
from typing import Optional

import numpy as np
from aiohttp import web
from rtlsdr import RtlSdr

HOST = "127.0.0.1"
PORT = 8765
ROOT = Path(__file__).resolve().parent

# Receive-only public satellite bands used by this app.
SAFE_RX_RANGES = [
    (137_000_000, 138_000_000, "Weather satellite band"),
    (145_800_000, 146_000_000, "Amateur satellite VHF downlink"),
    (435_000_000, 438_000_000, "Amateur satellite UHF downlink"),
]

class Receiver:
    def __init__(self):
        self.sdr: Optional[RtlSdr] = None
        self.frequency = 137_620_000
        self.sample_rate = 240_000
        self.gain = "auto"
        self.running = False
        self.thread: Optional[threading.Thread] = None
        self.lock = threading.Lock()
        self.latest_spectrum = np.full(512, -100.0, dtype=np.float32)
        self.latest_audio = np.zeros(0, dtype=np.int16)
        self.latest_seq = 0
        self.power_db = -100.0
        self.noise_db = -100.0
        self.error = None

    def allowed(self, frequency: int) -> bool:
        return any(lo <= frequency <= hi for lo, hi, _ in SAFE_RX_RANGES)

    def connect(self):
        if self.running:
            return
        try:
            self.sdr = RtlSdr()
            self.sdr.sample_rate = self.sample_rate
            self.sdr.center_freq = self.frequency
            self.sdr.gain = self.gain
            self.running = True
            self.error = None
            self.thread = threading.Thread(target=self._loop, daemon=True)
            self.thread.start()
        except Exception as exc:
            self.running = False
            self.error = str(exc)
            if self.sdr:
                try:
                    self.sdr.close()
                except Exception:
                    pass
                self.sdr = None
            raise

    def disconnect(self):
        self.running = False
        if self.thread and self.thread.is_alive():
            self.thread.join(timeout=1.0)
        if self.sdr:
            try:
                self.sdr.close()
            except Exception:
                pass
        self.sdr = None

    def tune(self, frequency: int):
        if not self.allowed(frequency):
            raise ValueError("Frequency outside the receive-only public satellite bands enabled in this app")
        self.frequency = int(frequency)
        if self.sdr:
            self.sdr.center_freq = self.frequency

    def _loop(self):
        window = np.hanning(2048).astype(np.float32)
        while self.running and self.sdr:
            try:
                samples = np.asarray(self.sdr.read_samples(16384), dtype=np.complex64)
                if len(samples) < 4096:
                    continue

                block = samples[-2048:]
                spec = np.fft.fftshift(np.fft.fft(block * window))
                db = 20.0 * np.log10(np.abs(spec) + 1e-8)
                db = db.reshape(512, 4).mean(axis=1).astype(np.float32)
                noise = float(np.percentile(db, 25))
                peak = float(np.max(db))

                fm = np.angle(samples[1:] * np.conj(samples[:-1])).astype(np.float32)
                kernel = np.ones(5, dtype=np.float32) / 5.0
                filtered = np.convolve(fm, kernel, mode="same")
                audio = filtered[::5]
                if audio.size:
                    audio -= np.mean(audio)
                    scale = max(float(np.percentile(np.abs(audio), 98)), 0.03)
                    audio = np.clip(audio / scale, -1.0, 1.0)
                    pcm = (audio * 12000).astype(np.int16)
                else:
                    pcm = np.zeros(0, dtype=np.int16)

                with self.lock:
                    self.latest_spectrum = db
                    self.latest_audio = pcm
                    self.latest_seq += 1
                    self.power_db = peak
                    self.noise_db = noise
            except Exception as exc:
                self.error = str(exc)
                time.sleep(0.25)

    def snapshot(self):
        with self.lock:
            return {
                "seq": self.latest_seq,
                "spectrum": self.latest_spectrum.copy(),
                "audio": self.latest_audio.copy(),
                "power_db": self.power_db,
                "noise_db": self.noise_db,
            }

rx = Receiver()

async def index(_request):
    return web.FileResponse(ROOT / "index.html")

async def status(_request):
    return web.json_response({
        "connected": rx.running and rx.sdr is not None,
        "frequency": rx.frequency,
        "sample_rate": rx.sample_rate,
        "gain": rx.gain,
        "error": rx.error,
        "bands": [{"low": lo, "high": hi, "name": name} for lo, hi, name in SAFE_RX_RANGES],
    })

async def connect(_request):
    try:
        rx.connect()
        return web.json_response({"ok": True})
    except Exception as exc:
        return web.json_response({"ok": False, "error": str(exc)}, status=500)

async def disconnect(_request):
    rx.disconnect()
    return web.json_response({"ok": True})

async def tune(request):
    try:
        data = await request.json()
        frequency = int(data.get("frequency", 0))
        rx.tune(frequency)
        return web.json_response({"ok": True, "frequency": rx.frequency})
    except Exception as exc:
        return web.json_response({"ok": False, "error": str(exc)}, status=400)

async def ws_stream(request):
    ws = web.WebSocketResponse(heartbeat=20)
    await ws.prepare(request)
    last_seq = -1
    try:
        while not ws.closed:
            if not rx.running:
                await ws.send_json({"type": "idle", "connected": False, "error": rx.error})
                await asyncio.sleep(0.5)
                continue
            snap = rx.snapshot()
            if snap["seq"] != last_seq:
                last_seq = snap["seq"]
                await ws.send_json({
                    "type": "spectrum",
                    "seq": last_seq,
                    "frequency": rx.frequency,
                    "sample_rate": rx.sample_rate,
                    "power_db": round(snap["power_db"], 1),
                    "noise_db": round(snap["noise_db"], 1),
                    "bins": np.round(snap["spectrum"], 1).tolist(),
                })
                pcm = snap["audio"]
                if pcm.size:
                    await ws.send_bytes(b"A" + pcm.astype("<i2", copy=False).tobytes())
            await asyncio.sleep(0.03)
    except (ConnectionResetError, asyncio.CancelledError):
        pass
    return ws

async def on_shutdown(_app):
    rx.disconnect()

app = web.Application()
app.router.add_get("/", index)
app.router.add_get("/index.html", index)
app.router.add_get("/api/status", status)
app.router.add_post("/api/connect", connect)
app.router.add_post("/api/disconnect", disconnect)
app.router.add_post("/api/tune", tune)
app.router.add_get("/ws", ws_stream)
app.on_shutdown.append(on_shutdown)

if __name__ == "__main__":
    print("Satellite Signal Receiver — receive only")
    print(f"Open http://{HOST}:{PORT}/")
    threading.Timer(1.0, lambda: webbrowser.open(f"http://{HOST}:{PORT}/")).start()
    web.run_app(app, host=HOST, port=PORT, print=None)
