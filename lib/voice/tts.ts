/**
 * JARVIS Voice — TTS Manager
 *
 * Singleton speech synthesis with duplicate prevention, cancellation,
 * interruption, and stale callback rejection.
 *
 * Long answers are split into sentences and queued as separate utterances
 * rather than spoken as one block. The synthesizer starts on the first
 * sentence while the rest are still queued, which removes the dead air before
 * playback begins and lets a barge-in take effect at the next sentence
 * boundary instead of at the end of a paragraph.
 *
 * Callback semantics are unchanged from the single-utterance version:
 * onStart fires once when the first sentence begins, onEnd once when the last
 * one finishes.
 */

export interface TTSConfig {
  rate?: number;
  pitch?: number;
  voice?: SpeechSynthesisVoice | null;
}

export interface TTSCallbacks {
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (error: string) => void;
}

export interface TTSManager {
  speak: (text: string, callbacks?: TTSCallbacks) => number;
  cancel: () => void;
  interrupt: () => void;
  isSpeaking: () => boolean;
  getRequestId: () => number;
  setConfig: (config: TTSConfig) => void;
  destroy: () => void;
}

function isBrowser(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

// ─── Sentence chunking ─────────────────────────────────────────

/** Longest utterance before it is broken at a clause boundary. */
const DEFAULT_MAX_CHARS = 240;

/**
 * Titles: these are followed by a name, so they never end a sentence even
 * though the next word is capitalised ("Dr. Chandra called").
 */
const TITLE_ABBREVIATIONS = new Set([
  "mr", "mrs", "ms", "dr", "prof", "sr", "jr", "st", "mt", "rev",
]);

/**
 * Abbreviations that may or may not end a sentence ("etc. Then we start" does,
 * "etc. and so on" does not). Capitalisation of the next word decides.
 */
const AMBIGUOUS_ABBREVIATIONS = new Set([
  "vs", "etc", "eg", "ie", "al", "approx", "dept", "est", "fig",
  "am", "pm", "inc", "ltd", "co", "corp", "univ", "vol", "no",
]);

/** The final whitespace-delimited word before `end`, lowercased, sans dots. */
function trailingWord(text: string, end: number): string {
  let start = end;
  while (start > 0 && !/\s/.test(text[start - 1])) start--;
  return text.slice(start, end).replace(/\./g, "").toLowerCase();
}

/**
 * True when the terminator at `index` genuinely ends a sentence, as opposed to
 * marking a decimal point or an abbreviation.
 */
function isSentenceBoundary(text: string, index: number): boolean {
  const char = text[index];

  if (char === "." ) {
    // Decimal: digits on both sides, e.g. "3.14" or a version number.
    if (/\d/.test(text[index - 1] ?? "") && /\d/.test(text[index + 1] ?? "")) {
      return false;
    }
    const word = trailingWord(text, index);

    // A title is always mid-sentence, whatever follows it.
    if (word && TITLE_ABBREVIATIONS.has(word)) return false;

    // For the ambiguous set, a capitalised next word means a new sentence
    // started; anything else means the abbreviation sat mid-sentence.
    if (word && AMBIGUOUS_ABBREVIATIONS.has(word)) {
      const next = text.slice(index + 1).match(/^\s+(\S)/);
      if (!next) return true; // nothing follows: the text ends here
      return /[A-Z]/.test(next[1]);
    }
  }

  // Consume runs of terminators and closing punctuation so "?!" or ".\"" are
  // treated as a single boundary.
  let after = index + 1;
  while (after < text.length && /[.!?)\]"'”’]/.test(text[after])) after++;

  if (after >= text.length) return true;
  // A real boundary is followed by whitespace.
  return /\s/.test(text[after]);
}

/** Break an over-long chunk at the last clause or word boundary that fits. */
function splitLongChunk(chunk: string, maxChars: number): string[] {
  if (chunk.length <= maxChars) return [chunk];

  const parts: string[] = [];
  let rest = chunk;

  while (rest.length > maxChars) {
    const window = rest.slice(0, maxChars);
    // Prefer a clause boundary; fall back to the last space.
    let cut = Math.max(window.lastIndexOf(", "), window.lastIndexOf("; "), window.lastIndexOf(": "));
    cut = cut > maxChars * 0.4 ? cut + 1 : window.lastIndexOf(" ");
    if (cut <= 0) break; // single unbroken token: leave it alone

    parts.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }

  if (rest) parts.push(rest);
  return parts;
}

/**
 * Split text into utterance-sized pieces at sentence boundaries.
 * Newlines are treated as hard boundaries so lists are not run together.
 * Exported for testing — the browser is not needed to verify the split.
 */
export function splitIntoSpeechChunks(text: string, maxChars = DEFAULT_MAX_CHARS): string[] {
  if (!text || !text.trim()) return [];

  const sentences: string[] = [];

  for (const line of text.split(/\r?\n+/)) {
    const trimmedLine = line.trim();
    if (!trimmedLine) continue;

    let start = 0;
    for (let i = 0; i < trimmedLine.length; i++) {
      if (!/[.!?]/.test(trimmedLine[i])) continue;
      if (!isSentenceBoundary(trimmedLine, i)) continue;

      // Include the terminator and any closing punctuation attached to it.
      let end = i + 1;
      while (end < trimmedLine.length && /[.!?)\]"'”’]/.test(trimmedLine[end])) end++;

      const sentence = trimmedLine.slice(start, end).trim();
      if (sentence) sentences.push(sentence);
      start = end;
      i = end - 1;
    }

    const tail = trimmedLine.slice(start).trim();
    if (tail) sentences.push(tail);
  }

  // Short sentences are left alone: "Yes." is a natural utterance on its own,
  // and merging them back together is what reintroduces the dead air.
  return sentences.flatMap((chunk) => splitLongChunk(chunk, maxChars));
}

let requestCounter = 0;

export function createTTSManager(config: TTSConfig = {}): TTSManager {
  let activeRequestId = 0;
  let speaking = false;
  let destroyed = false;
  let cfg: TTSConfig = { rate: 1.05, pitch: 1.0, ...config };
  let activeCallbacks: TTSCallbacks | null = null;

  const cancel = () => {
    if (isBrowser()) {
      window.speechSynthesis.cancel();
    }
    speaking = false;
    activeRequestId = 0;
    activeCallbacks = null;
  };

  return {
    speak(text: string, callbacks?: TTSCallbacks) {
      if (destroyed || !text) return 0;
      cancel();
      if (!isBrowser()) return 0;

      const chunks = splitIntoSpeechChunks(text);
      if (chunks.length === 0) return 0;

      const reqId = ++requestCounter;
      activeRequestId = reqId;
      speaking = true;
      activeCallbacks = callbacks ?? null;

      // onStart belongs to the whole response, not to each sentence.
      let startReported = false;
      let finishedChunks = 0;

      for (const chunk of chunks) {
        const utterance = new SpeechSynthesisUtterance(chunk);
        if (cfg.rate) utterance.rate = cfg.rate;
        if (cfg.pitch) utterance.pitch = cfg.pitch;
        if (cfg.voice) utterance.voice = cfg.voice;

        utterance.onstart = () => {
          if (activeRequestId !== reqId || startReported) return;
          startReported = true;
          activeCallbacks?.onStart?.();
        };

        utterance.onend = () => {
          if (activeRequestId !== reqId) return;
          finishedChunks++;
          // Only the final sentence completes the response.
          if (finishedChunks < chunks.length) return;
          speaking = false;
          activeCallbacks?.onEnd?.();
          activeCallbacks = null;
        };

        utterance.onerror = (event) => {
          if (activeRequestId !== reqId) return;
          // cancel()/interrupt() already reset state; nothing to report.
          if (event.error === "canceled" || event.error === "interrupted") return;

          // Drop the rest of the queue: speaking the remainder after a failed
          // sentence would deliver a misleading, partial answer.
          const failed = activeCallbacks;
          speaking = false;
          activeRequestId = 0;
          activeCallbacks = null;
          window.speechSynthesis.cancel();
          failed?.onError?.(event.error || "TTS error");
        };

        window.speechSynthesis.speak(utterance);
      }

      return reqId;
    },

    cancel,

    interrupt() {
      if (isBrowser() && speaking) {
        const cb = activeCallbacks;
        window.speechSynthesis.cancel();
        speaking = false;
        activeRequestId = 0;
        activeCallbacks = null;
        cb?.onEnd?.();
      }
    },

    isSpeaking() {
      return speaking;
    },

    getRequestId() {
      return activeRequestId;
    },

    setConfig(newConfig: TTSConfig) {
      cfg = { ...cfg, ...newConfig };
    },

    destroy() {
      destroyed = true;
      cancel();
    },
  };
}
