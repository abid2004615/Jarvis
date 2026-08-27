#!/usr/bin/env python3
"""
Deterministic offline wake-recognition test.

Feeds the bundled vosk model real synthesized 16 kHz mono audio fixtures
through the same `WakeWordListener` the companions use and asserts the
expected wake decisions. Intended to run with the project venv:

    companion/.venv/bin/python companion/test_wake_recognition.py

Behavior mirrors a real microphone: fixtures are followed by ~2 seconds of
digital silence so the recognizers emit natural end-of-utterance results.

Exit code is 0 only when every fixture matches its expected outcome.
"""

import argparse
import os
import struct
import sys
import wave
from pathlib import Path

_HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(_HERE))

from vosk import Model  # noqa: E402
from wake_word import WakeWordListener  # noqa: E402

SAMPLE_RATE = 16000
BLOCK = 8000
SILENCE_BLOCKS = 6

ZERO_BLOCK = struct.pack("<%dh" % BLOCK, *([0] * BLOCK))

# Bundled fixtures and the wake outcome each must produce.
FIXTURES = [
    ("hey-jarvis-16k-mono.wav", True, "configured phrase"),
    ("hey-jeremy-16k-mono.wav", True, "observed variant"),
    ("hey-joe-16k-mono.wav", True, "observed variant"),
    ("hey-service-16k-mono.wav", False, "reject near phrase"),
    ("ok-jarvis-16k-mono.wav", False, "reject near phrase"),
    ("cpu-usage-16k-mono.wav", False, "reject arbitrary speech"),
]


def run_wav(listener, path: str) -> list:
    wf = wave.open(path, "rb")
    if wf.getframerate() != SAMPLE_RATE or wf.getnchannels() != 1:
        raise SystemExit(f"{path}: expected 16 kHz mono audio")
    data = wf.readframes(wf.getnframes())
    fired = []
    blocks = [data[i : i + BLOCK * 2] for i in range(0, len(data), BLOCK * 2)]
    blocks += [ZERO_BLOCK] * SILENCE_BLOCKS
    for block in blocks:
        if listener.feed(block):
            fired.append(listener.phrase)
    return fired


def main() -> int:
    parser = argparse.ArgumentParser(description="Offline wake-recognition test")
    parser.add_argument(
        "--model-path",
        default=str(_HERE / "vosk-model-small-en-us-0.15"),
        help="Path to the vosk model directory",
    )
    parser.add_argument(
        "--phrase",
        default="hey jarvis",
        help="Configured wake phrase",
    )
    parser.add_argument(
        "--wav",
        action="append",
        default=[],
        help="Additional 16 kHz mono wav; expected to wake (add --expect none otherwise)",
    )
    parser.add_argument(
        "--expect",
        choices=["wake", "none"],
        default="wake",
        help="Expected result for extra --wav files",
    )
    args = parser.parse_args()

    model = Model(args.model_path)
    failures = 0

    for name, want_wake, note in FIXTURES:
        path = str(_HERE / "testdata" / name)
        if not os.path.exists(path):
            print(f"SKIP {name}: fixture missing")
            continue
        fired = run_wav(WakeWordListener(model, SAMPLE_RATE, args.phrase), path)
        got = bool(fired)
        status = "PASS" if got == want_wake else "FAIL"
        if got != want_wake:
            failures += 1
        print(f"{status} {name:28s} fires={len(fired)} (expected {want_wake}) [{note}]")

    for path in args.wav:
        fired = run_wav(WakeWordListener(model, SAMPLE_RATE, args.phrase), path)
        got = bool(fired)
        want = args.expect == "wake"
        status = "PASS" if got == want else "FAIL"
        if got != want:
            failures += 1
        print(f"{status} {os.path.basename(path):28s} fires={len(fired)} (expected {want})")

    print("ALL PASS" if failures == 0 else f"{failures} FAILURE(S)")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())