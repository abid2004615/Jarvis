#!/usr/bin/env python3
"""
JARVIS wake-phrase matching.

Pure, dependency-free helpers shared by the native voice companions
(`jarvis-voice.py`, `jarvis-wake.py`) so wake detection can be configured,
reasoned about, and tested without loading vosk/sounddevice.

Strategy
--------
The vosk-small-en-us-0.15 model does not reliably transcribe the wake phrase
"hey jarvis": real-mic and synthesized audio have produced "they jarvis",
"hey jeremy", "hey joe", "hey joe is", "hey joe louis", "hey journalists"
and "hey is", while unrelated speech ("hey service", "ok jarvis", ordinary
sentences) is routinely mis-decoded too. Rather than widening a fuzzy text
distance, the companions use a *phrase-constrained* vosk grammar built from
the configured phrase plus these observed variants, and gate the result with
an exact whole-utterance match against the same narrow set (see the
`WakeWordListener` in `wake_word.py`). Exact membership keeps false wakes low:
a triggered utterance must equal a known wake phrase, never merely contain
similar words.
"""

import re

_PUNCT_RE = re.compile(r"[^\w\s]+")
_WS_RE = re.compile(r"\s+")
_EDIT_BUDGET = 1

# Transcriptions of the configured wake phrase observed from the bundled
# vosk-small-en-us-0.15 model (real microphone and synthesized audio).
# Kept intentionally narrow: these are near-homophones of "hey jarvis" that
# the tiny model actually emits, not an open keyword list.
OBSERVED_WAKE_VARIANTS = [
    "hey jarvis",
    "they jarvis",
    "hey jeremy",
    "hey joe",
    "hey joe is",
    "hey joe louis",
    "hey journalists",
    "hey is",
]


def normalize_text(text: str) -> str:
    """Lowercase, strip punctuation, collapse whitespace."""
    if not text:
        return ""
    lowered = str(text).lower()
    stripped = _PUNCT_RE.sub(" ", lowered)
    return _WS_RE.sub(" ", stripped).strip()


def _edit_distance(a: str, b: str) -> int:
    """Standard Levenshtein distance between two short strings."""
    la, lb = len(a), len(b)
    prev = list(range(lb + 1))
    for i in range(1, la + 1):
        cur = [i] + [0] * lb
        ach = a[i - 1]
        for j in range(1, lb + 1):
            cur[j] = min(
                prev[j] + 1,
                cur[j - 1] + 1,
                prev[j - 1] + (ach != b[j - 1]),
            )
        prev = cur
    return prev[lb]


def _token_close(word: str, target: str) -> bool:
    return _edit_distance(word, target) <= _EDIT_BUDGET


def matches_wake_phrase(text: str, phrase: str) -> bool:
    """Very tight fuzzy containment used only as a backstop for the open
    recognizer's second opinion.

    The phrase must appear as a contiguous word run in the text with at most
    one character of edit per word. This tolerates the "hey"/"they" swap but
    will not match "hey jeremy" or "hey service" — those are accepted through
    the exact variant set instead.
    """
    words = normalize_text(text).split()
    target_words = normalize_text(phrase).split()
    if not target_words or len(words) < len(target_words):
        return False
    width = len(target_words)
    for i in range(len(words) - width + 1):
        window = words[i : i + width]
        if all(_token_close(w, t) for w, t in zip(window, target_words)):
            return True
    return False


def build_wake_grammar(phrase: str, variants=None) -> list:
    """Phrase list for the vosk grammar recognizer (JSON-encoded by caller).

    `phrase` is the configured wake phrase; `variants` are the observed
    transcriptions that must also be recognized. Order is preserved and
    duplicates collapsed.
    """
    version = variants if variants is not None else OBSERVED_WAKE_VARIANTS
    return list(dict.fromkeys([phrase] + list(version)))


def wake_accept_set(phrase: str, variants=None) -> set:
    """Normalized set of phrases that count as a wake utterance."""
    return {normalize_text(p) for p in build_wake_grammar(phrase, variants)}


def contains_wake(text: str, phrase: str, variants=None) -> bool:
    """Exact whole-utterance gate against the accept set.

    Unlike `matches_wake_phrase`, this requires the entire normalized text to
    equal one of the known phrases — a grammar-collage like "is louis hey hey
    joe louis is" must NOT wake even though "hey joe louis" is a substring.
    """
    normalized = normalize_text(text)
    return bool(normalized and normalized in wake_accept_set(phrase, variants))