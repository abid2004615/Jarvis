export interface VoiceController {
  startListening: (
    onResult: (text: string) => void,
    onError?: (message: string) => void,
  ) => void;
  stopListening: () => void;
  speak: (text: string, options?: { onStart?: () => void; onEnd?: () => void }) => void;
  cancel: () => void;
  isListening: () => boolean;
  isSpeaking: () => boolean;
  supported: boolean;
  mapErrorMessage: (error: string) => string;
}

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((event: {
    results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal?: boolean }>;
  }) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
};

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  }
}

/**
 * Map browser error codes to user-friendly messages.
 * Never surfaces raw implementation details.
 */
function mapErrorMessage(error: string): string {
  const errorMap: Record<string, string> = {
    network: "Network error. Check your connection.",
    "no-speech": "No speech detected. Please try again.",
    "not-allowed": "Microphone access denied. Check your browser permissions.",
    "service-not-allowed": "Speech recognition service not available.",
    "bad-grammar": "Speech grammar error.",
    unknown: "Speech recognition error.",
  };
  return errorMap[error] || errorMap["unknown"];
}

export function createVoiceController(): VoiceController {
  const SpeechCtor =
    typeof window !== "undefined"
      ? (window as typeof window & {
          SpeechRecognition?: new () => SpeechRecognitionLike;
          webkitSpeechRecognition?: new () => SpeechRecognitionLike;
        }).SpeechRecognition ??
        (window as typeof window & {
          webkitSpeechRecognition?: new () => SpeechRecognitionLike;
        }).webkitSpeechRecognition
      : undefined;
  const supported = Boolean(SpeechCtor);

  let recognizer: SpeechRecognitionLike | null = null;
  let isListeningState = false;
  let isSpeakingState = false;

  const ensureRecognizer = () => {
    if (!SpeechCtor || typeof window === "undefined") return null;
    if (!recognizer) {
      recognizer = new SpeechCtor();
      recognizer.continuous = false;
      recognizer.interimResults = true;
      recognizer.lang = "en-US";
    }
    return recognizer;
  };

  return {
    supported,
    isListening: () => isListeningState,
    isSpeaking: () => isSpeakingState,
    startListening(onResult, onError) {
      const instance = ensureRecognizer();
      if (!instance || typeof window === "undefined") {
        onError?.("Speech recognition is unavailable in this browser.");
        return;
      }

      if (isListeningState) {
        onError?.("Microphone is already listening.");
        return;
      }

      isListeningState = true;
      let transcript = "";
      let deliveredFinal = false;

      instance.onresult = (event) => {
        const results = Array.from(event.results);
        const last = results[results.length - 1];
        const next = results.map((result) => result[0]?.transcript ?? "").join(" ").trim();

        if (last && last.isFinal) {
          transcript = next;
          deliveredFinal = true;
          if (transcript) {
            onResult(transcript);
          }
        } else {
          transcript = next;
        }
      };

      instance.onerror = (event) => {
        isListeningState = false;
        const errorMessage = event.error ?? "unknown";
        onError?.(mapErrorMessage(errorMessage));
      };

      instance.onend = () => {
        isListeningState = false;
        if (deliveredFinal) {
          return;
        }
        if (transcript) {
          onResult(transcript);
        } else {
          onError?.("No speech detected. Please try again.");
        }
      };

      try {
        instance.start();
      } catch (error) {
        isListeningState = false;
        if (error instanceof Error && error.message.includes("already listening")) {
          onError?.("Microphone is already listening.");
        } else {
          onError?.("Failed to start microphone.");
        }
      }
    },

    stopListening() {
      isListeningState = false;
      recognizer?.stop();
    },

    speak(text, options) {
      if (typeof window === "undefined" || !("speechSynthesis" in window)) {
        options?.onEnd?.();
        return;
      }

      isSpeakingState = true;
      window.speechSynthesis.cancel();

      const content = text || "";
      const utterance = new SpeechSynthesisUtterance(content);
      utterance.rate = 1.05;
      utterance.pitch = 1.1;
      utterance.volume = 1;

      utterance.onstart = () => {
        isSpeakingState = true;
        options?.onStart?.();
      };

      utterance.onend = () => {
        isSpeakingState = false;
        options?.onEnd?.();
      };

      utterance.onerror = () => {
        isSpeakingState = false;
        options?.onEnd?.();
      };

      try {
        window.speechSynthesis.speak(utterance);
      } catch (error) {
        isSpeakingState = false;
        options?.onEnd?.();
      }
    },

    cancel() {
      isListeningState = false;
      isSpeakingState = false;
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
      recognizer?.stop();
    },

    /**
     * Map browser error codes to user-friendly messages
     */
    mapErrorMessage,
  };
}
