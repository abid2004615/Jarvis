#!/usr/bin/env python3
"""
JARVIS Native Voice Companion

Offline speech-to-text for the packaged Electron app.
Extends the wake companion to support:
  1. Wake word detection ("Hey JARVIS")
  2. Command recognition after wake
  3. Final transcript emission via stdout JSON

State machine:
  IDLE → listen for wake phrase
  WAKE → listen for command (up to 10s silence timeout)
  → emit transcript → back to IDLE

Output protocol (stdout, one JSON per line):
  {"type":"state","state":"idle"}
  {"type":"state","state":"listening_for_wake"}
  {"type":"state","state":"listening_for_command"}
  {"type":"transcript","text":"...","isFinal":true}
  {"type":"audio_level","level":0.0}
  {"type":"error","message":"..."}

Input protocol (stdin, one JSON per line):
  {"command":"start"}    — begin listening
  {"command":"stop"}     — stop listening
  {"command":"shutdown"} — exit gracefully

Usage:
    python jarvis-voice.py [--port 3000] [--model-path ./vosk-model]
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
from vosk import Model, KaldiRecognizer
from wake_word import WakeWordListener

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
    stream=sys.stderr,  # logs go to stderr, NOT stdout
)
log = logging.getLogger("jarvis-voice")

MODEL_URL = "https://alphacephei.com/vosk/models/vosk-model-small-en-us-0.15.zip"
SAMPLE_RATE = 16000
BLOCK_SIZE = 8000
WAKE_PHRASE = "hey jarvis"
COMMAND_SILENCE_TIMEOUT = 10.0  # seconds of silence before ending command
MAX_COMMAND_DURATION = 15.0     # max seconds for a single command

_stop = False
_state = "idle"  # idle | listening_for_wake | listening_for_command
_command_start_time = 0.0
_last_speech_time = 0.0
_has_speech_in_command = False

# Diagnostic logging of vosk recognition text (set JARVIS_VOSK_DEBUG=1).
# Only recognized text is logged — never raw audio or credentials.
VOSK_DEBUG = os.environ.get("JARVIS_VOSK_DEBUG") == "1"


def _handle_signal(sig, frame):
    global _stop
    _stop = True
    log.info("Shutting down...")


signal.signal(signal.SIGINT, _handle_signal)
signal.signal(signal.SIGTERM, _handle_signal)


def emit(obj: dict):
    """Write a JSON message to stdout (one line). Never raises."""
    try:
        line = json.dumps(obj, ensure_ascii=False)
        sys.stdout.write(line + "\n")
        sys.stdout.flush()
    except Exception:
        pass


def emit_state(state: str):
    global _state
    _state = state
    emit({"type": "state", "state": state})


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
            emit({"type": "error", "message": f"Model download failed: {e}"})
            sys.exit(1)
    return Model(str(model_dir))


def signal_wake(server_url: str) -> bool:
    payload = json.dumps({"event": "wake", "phrase": WAKE_PHRASE}).encode()
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
        log.warning("Failed to signal wake: %s", e)
        return False


def read_stdin_commands():
    """Non-blocking read of stdin for control commands."""
    import select
    if sys.platform == "darwin":
        # On macOS, use select with a short timeout
        try:
            ready, _, _ = select.select([sys.stdin], [], [], 0)
            if ready:
                line = sys.stdin.readline().strip()
                if line:
                    try:
                        cmd = json.loads(line)
                        return cmd.get("command")
                    except json.JSONDecodeError:
                        pass
        except Exception:
            pass
    else:
        try:
            if select.select([sys.stdin], [], [], 0)[0]:
                line = sys.stdin.readline().strip()
                if line:
                    try:
                        cmd = json.loads(line)
                        return cmd.get("command")
                    except json.JSONDecodeError:
                        pass
        except Exception:
            pass
    return None


def run(model_path: str, server_url: str):
    global _stop, _command_start_time, _last_speech_time, _has_speech_in_command

    model = ensure_model(model_path)

    # Command recognizer (open vocabulary) — used in listening_for_command.
    command_rec = KaldiRecognizer(model, SAMPLE_RATE)
    command_rec.SetWords(True)

    # Wake listener — a phrase-constrained recognizer whose candidate is
    # confirmed by an open recognizer on the same audio (see wake_word.py).
    def on_wake(phrase: str):
        global _command_start_time, _last_speech_time, _has_speech_in_command
        nonlocal command_rec
        log.info("Wake detected (phrase: %s)", phrase)
        signal_wake(server_url)
        # Switch to command listening with a freshly-built recognizer.
        command_rec = KaldiRecognizer(model, SAMPLE_RATE)
        command_rec.SetWords(True)
        _command_start_time = time.time()
        _last_speech_time = time.time()
        _has_speech_in_command = False
        emit_state("listening_for_command")

    wake = WakeWordListener(
        model, SAMPLE_RATE, WAKE_PHRASE, on_wake=on_wake, debug=VOSK_DEBUG
    )

    audio_queue: queue.Queue[bytes] = queue.Queue()

    def audio_callback(indata, frames, time_info, status):
        if status:
            log.warning("Audio status: %s", status)
        audio_queue.put(bytes(indata))

    log.info("Voice companion started. Listening for wake phrase.")
    emit_state("idle")

    with sd.RawInputStream(
        samplerate=SAMPLE_RATE,
        blocksize=BLOCK_SIZE,
        dtype="int16",
        channels=1,
        callback=audio_callback,
    ):
        while not _stop:
            # Process stdin commands
            cmd = read_stdin_commands()
            if cmd == "start":
                if _state == "idle":
                    wake.reset()
                    emit_state("listening_for_wake")
            elif cmd == "stop":
                if _state != "idle":
                    emit_state("idle")
                    wake.reset()
                    command_rec = KaldiRecognizer(model, SAMPLE_RATE)
                    command_rec.SetWords(True)
            elif cmd == "shutdown":
                _stop = True
                break

            # Process audio
            try:
                data = audio_queue.get(timeout=0.5)
            except queue.Empty:
                continue

            # Compute audio level for UI feedback
            import struct
            samples = struct.unpack(f"<{len(data)//2}h", data)
            if samples:
                rms = (sum(s*s for s in samples) / len(samples)) ** 0.5
                level = min(1.0, rms / 32768.0)
                emit({"type": "audio_level", "level": round(level, 3)})

            if _state in ("idle", "listening_for_wake"):
                # Wake word detection — runs while the app has signaled
                # "start" (listening_for_wake) as well as in the default
                # idle state before a start command arrives. on_wake
                # transitions the state machine to command listening.
                wake.feed(data)

            elif _state == "listening_for_command":
                # Command recognition
                elapsed = time.time() - _command_start_time
                if elapsed > MAX_COMMAND_DURATION:
                    # Timeout — return whatever we have
                    if _has_speech_in_command:
                        final = json.loads(command_rec.FinalResult())
                        text = final.get("text", "").strip()
                        if text:
                            emit({"type": "transcript", "text": text, "isFinal": True})
                    else:
                        # No speech at all — emit empty to signal timeout
                        emit({"type": "transcript", "text": "", "isFinal": True})
                    command_rec = KaldiRecognizer(model, SAMPLE_RATE)
                    command_rec.SetWords(True)
                    wake.reset()
                    emit_state("idle")
                    continue

                if command_rec.AcceptWaveform(data):
                    result = json.loads(command_rec.Result())
                    text = result.get("text", "").strip()
                    if text:
                        _has_speech_in_command = True
                        _last_speech_time = time.time()
                        emit({"type": "transcript", "text": text, "isFinal": True})
                        # After final result, go back to idle
                        command_rec = KaldiRecognizer(model, SAMPLE_RATE)
                        command_rec.SetWords(True)
                        wake.reset()
                        emit_state("idle")
                else:
                    # Partial results — show interim transcript
                    partial = json.loads(command_rec.PartialResult())
                    text = partial.get("partial", "").strip()
                    if text:
                        _has_speech_in_command = True
                        _last_speech_time = time.time()
                        emit({"type": "transcript", "text": text, "isFinal": False})
                    elif _has_speech_in_command:
                        # Silence after speech — check timeout
                        silence_elapsed = time.time() - _last_speech_time
                        if silence_elapsed > COMMAND_SILENCE_TIMEOUT:
                            # End command
                            final = json.loads(command_rec.FinalResult())
                            text = final.get("text", "").strip()
                            if text:
                                emit({"type": "transcript", "text": text, "isFinal": True})
                            command_rec = KaldiRecognizer(model, SAMPLE_RATE)
                            command_rec.SetWords(True)
                            wake.reset()
                            emit_state("idle")

    log.info("Stopped.")
    emit_state("idle")


def main():
    parser = argparse.ArgumentParser(description="JARVIS Native Voice Companion")
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
    run(args.model_path, server_url)


if __name__ == "__main__":
    main()
