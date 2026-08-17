/**
 * JARVIS Voice — TTS Manager
 *
 * Singleton speech synthesis with duplicate prevention, cancellation,
 * interruption, and stale callback rejection.
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

      const reqId = ++requestCounter;
      activeRequestId = reqId;
      speaking = true;
      activeCallbacks = callbacks ?? null;

      const utterance = new SpeechSynthesisUtterance(text);
      if (cfg.rate) utterance.rate = cfg.rate;
      if (cfg.pitch) utterance.pitch = cfg.pitch;
      if (cfg.voice) utterance.voice = cfg.voice;

      utterance.onstart = () => {
        if (activeRequestId !== reqId) return;
        activeCallbacks?.onStart?.();
      };

      utterance.onend = () => {
        if (activeRequestId !== reqId) return;
        speaking = false;
        activeCallbacks?.onEnd?.();
        activeCallbacks = null;
      };

      utterance.onerror = (event) => {
        if (activeRequestId !== reqId) return;
        speaking = false;
        if (event.error !== "canceled" && event.error !== "interrupted") {
          activeCallbacks?.onError?.(event.error || "TTS error");
        }
        activeCallbacks = null;
      };

      window.speechSynthesis.speak(utterance);
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
