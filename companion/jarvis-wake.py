#!/usr/bin/env python3
"""
JARVIS Global Wake Word Companion

Runs a lightweight offline wake word detector using vosk.
When "Hey JARVIS" (or configurable phrase) is detected, signals the
Next.js server via HTTP POST.

Usage:
    pip install -r requirements.txt
    python jarvis-wake.py [--phrase "hey jarvis"] [--port 3000] [--model-path ./vosk-model]

The vosk small English model (~50MB) is downloaded automatically on first run.
"""

import argparse
import json
import logging
import os
import queue
import signal
import sys
import time
import urllib.error
import urllib.request
import zipfile
from pathlib import Path

import sounddevice as sd
from vosk import Model
from wake_word import WakeWordListener

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("jarvis-wake")

MODEL_URL = "https://alphacephei.com/vosk/models/vosk-model-small-en-us-0.15.zip"
MODEL_DIR = "vosk-model-small-en-us-0.15"
SAMPLE_RATE = 16000
BLOCK_SIZE = 8000

_stop = False


def _handle_signal(sig, frame):
    global _stop
    _stop = True
    log.info("Shutting down...")


signal.signal(signal.SIGINT, _handle_signal)
signal.signal(signal.SIGTERM, _handle_signal)


def ensure_model(model_path: str) -> Model:
    model_dir = Path(model_path)
    if not model_dir.exists():
        log.info("Downloading vosk model (~50MB)...")
        zip_path = model_dir.with_suffix(".zip")
        try:
            urllib.request.urlretrieve(MODEL_URL, str(zip_path))
            with zipfile.ZipFile(str(zip_path), "r") as zf:
                zf.extractall(str(model_dir.parent))
            zip_path.unlink(missing_ok=True)
            log.info("Model downloaded and extracted.")
        except Exception as e:
            log.error("Failed to download model: %s", e)
            sys.exit(1)
    return Model(str(model_dir))


def signal_wake(server_url: str, phrase: str) -> bool:
    payload = json.dumps({"event": "wake", "phrase": phrase}).encode()
    req = urllib.request.Request(
        server_url,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=3) as resp:
            return resp.status == 200
    except (urllib.error.URLError, OSError) as e:
        log.warning("Failed to signal server: %s", e)
        return False


def run(phrase: str, server_url: str, model_path: str):
    model = ensure_model(model_path)

    def on_wake(detected: str):
        log.info("Wake phrase detected!")
        signal_wake(server_url, detected)
        time.sleep(2)  # debounce — do not re-trigger on the same utterance

    wake = WakeWordListener(
        model,
        SAMPLE_RATE,
        phrase,
        on_wake=on_wake,
        debug=os.environ.get("JARVIS_VOSK_DEBUG") == "1",
    )

    audio_queue: queue.Queue[bytes] = queue.Queue()

    def audio_callback(indata, frames, time_info, status):
        if status:
            log.warning("Audio status: %s", status)
        audio_queue.put(bytes(indata))

    log.info("Listening for wake phrase: '%s'", phrase)
    log.info("Server: %s", server_url)

    with sd.RawInputStream(
        samplerate=SAMPLE_RATE,
        blocksize=BLOCK_SIZE,
        dtype="int16",
        channels=1,
        callback=audio_callback,
    ):
        while not _stop:
            try:
                data = audio_queue.get(timeout=0.5)
            except queue.Empty:
                continue

            wake.feed(data)

    log.info("Stopped.")


def main():
    parser = argparse.ArgumentParser(description="JARVIS Global Wake Word Companion")
    parser.add_argument(
        "--phrase",
        default="hey jarvis",
        help="Wake phrase to listen for (default: 'hey jarvis')",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=3000,
        help="Next.js server port (default: 3000)",
    )
    parser.add_argument(
        "--model-path",
        default=str(Path(__file__).parent / "vosk-model-small-en-us-0.15"),
        help="Path to vosk model directory",
    )
    args = parser.parse_args()

    server_url = f"http://localhost:{args.port}/api/wake"
    run(args.phrase, server_url, args.model_path)


if __name__ == "__main__":
    main()
