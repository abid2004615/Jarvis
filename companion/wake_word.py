#!/usr/bin/env python3
"""
JARVIS dedicated wake-word listener.

A phrase-constrained vosk recognizer biases decoding toward the configured
wake phrase and its observed variants, which the small model otherwise
transcribes erratically ("hey jeremy", "they jarvis", ...).

Because a grammar recognizer also coerces *rejected* speech into grammar
phrases ("hey service" -> "they jarvis"), every candidate wake must be
confirmed by an unconstrained (open) recognizer.

Boundary alignment (why a forced flush failed):
    Both recognizers consume the same audio stream, but each applies its own
    segmentation. Calling FinalResult() on the open recognizer at the GRAMMAR
    recognizer's utterance boundary flushes it mid-word; on a real microphone
    the open recognizer then reports an unrelated tail fragment ("interests")
    for the wake audio it would otherwise decode as "hey journalists". The
    open recognizer is therefore re-run on the exact audio chunk the grammar
    segmented, padded with silence so it emits a natural, complete final. That
    decodes real-mic wake audio the way the always-on recognizer historically
    did ("hey jeremy" / "hey joe" / "hey journalists" ...), all of which are
    accept-set members.

Confirmation accepts only: an exact whole-utterance match against the known
wake forms, or at most one character of edit per word of the configured
phrase. The sequential replay is deterministic — the same audio in the same
order always produces the same decision. Both recognizers are recreated at
every utterance boundary (and on fire) so duplicates cannot re-trigger.
"""

import json
import logging

from vosk import KaldiRecognizer

from wake_match import (
    OBSERVED_WAKE_VARIANTS,
    build_wake_grammar,
    matches_wake_phrase,
    normalize_text,
    wake_accept_set,
)

log = logging.getLogger("jarvis-wake")

# Silence replayed after a candidate utterance so a freshly created open
# recognizer emits its natural final (mirrors the lag proven by tests where
# short fixtures never produced an endpoint without trailing silence).
SILENCE_PAD_BLOCKS = 6
BLOCK_SAMPLES = 8000


class WakeWordListener:
    """Feeds audio and calls `on_wake(phrase)` when the wake phrase is
    detected. `on_wake` runs once per confirmed utterance."""

    def __init__(
        self,
        model,
        sample_rate,
        phrase,
        variants=None,
        on_wake=None,
        debug=False,
    ):
        self.model = model
        self.sample_rate = sample_rate
        self.phrase = phrase
        self.variants = variants if variants is not None else OBSERVED_WAKE_VARIANTS
        self.accept = wake_accept_set(phrase, self.variants)
        self.on_wake = on_wake or (lambda phrase: None)
        self.debug = debug
        self.grammar = json.dumps(build_wake_grammar(phrase, self.variants))
        # Cap the buffered utterance audio (~30 s) so continuous input cannot
        # grow it without bound; a wake phrase lives in the tail.
        self._max_buffer = sample_rate * 2 * 30
        self._make_recognizers()

    def _make_recognizers(self):
        self.wake_rec = KaldiRecognizer(self.model, self.sample_rate, self.grammar)
        self._buffer = bytearray()

    def reset(self):
        """Recreate both recognizers (e.g. when re-entering wake listening)."""
        self._make_recognizers()

    def _silence_pad(self) -> bytes:
        return b"\x00\x00" * (SILENCE_PAD_BLOCKS * BLOCK_SAMPLES)

    def _confirm(self, open_text: str) -> bool:
        """Final-utterance confirmation. The open recognizer's transcription
        must be a known wake phrase or a tight typo of the configured phrase.
        Reject text ("the a service", "okay jarvis", "interests", ...) never
        confirms."""
        if not open_text:
            return False
        if open_text in self.accept:
            return True
        return matches_wake_phrase(open_text, self.phrase)

    def _recognize_chunk(self, chunk: bytes) -> str:
        """Decode one grammar-segmented utterance with a fresh open recognizer
        and a silence tail, so its final is natural and complete (not a
        mid-word flush) and exactly aligned to the grammar's boundaries."""
        rec = KaldiRecognizer(self.model, self.sample_rate)
        rec.AcceptWaveform(chunk)
        rec.AcceptWaveform(self._silence_pad())
        return normalize_text(
            json.loads(rec.FinalResult()).get("text", "")
        )

    def _fire(self) -> bool:
        self._make_recognizers()
        self.on_wake(self.phrase)
        return True

    def feed(self, data: bytes) -> bool:
        """Process one audio block. Returns True if the wake phrase fired."""
        self._buffer += data
        if len(self._buffer) > self._max_buffer:
            del self._buffer[: len(self._buffer) - self._max_buffer]

        if self.wake_rec.AcceptWaveform(data):
            grammar_final = normalize_text(
                json.loads(self.wake_rec.Result()).get("text", "")
            )
            if grammar_final in self.accept:
                open_text = self._recognize_chunk(bytes(self._buffer))
                if self.debug:
                    log.info(
                        "[VOSK] grammar-final=%r open=%r",
                        grammar_final,
                        open_text,
                    )
                if self._confirm(open_text):
                    if self.debug:
                        log.info("[VOSK] WAKE")
                    return self._fire()
            elif self.debug:
                log.info("[VOSK] grammar-final=%r", grammar_final)
            # Utterance boundary — clean slate for the next wake listen.
            self._make_recognizers()
            return False

        partial = normalize_text(
            json.loads(self.wake_rec.PartialResult()).get("partial", "")
        )
        if self.debug and partial:
            log.info("[VOSK] partial=%r", partial)
        return False