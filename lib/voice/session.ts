/**
 * JARVIS Voice — Session
 *
 * Voice session state machine. Orchestrates mic → recognition → pipeline → TTS
 * lifecycle. Maps to JarvisRuntimeState at each step. No global state duplication.
 *
 * Barge-in: uses VAD energy detection (single recognition, no competing instances).
 *
 * In packaged Electron mode, uses native Vosk STT via IPC instead of Web Speech API.
 */

import { createMicrophoneManager, type MicPermissionState } from "./microphone";
import { createVoiceActivityDetector, type VoiceActivityDetector } from "./vad";
import { detectWakeWord, stripWakeWord } from "./wake-word";
import { createTTSManager, type TTSManager } from "./tts";
import { loadVoiceSettings, saveVoiceSettings, type VoiceSettings } from "./settings";
import { isNativeVoiceAvailable, createNativeVoiceAdapter, type NativeVoiceAdapter } from "./native";
import { createBargeInDetector } from "./barge-in";

export type VoiceSessionState =
  | "idle"
  | "mic_requested"
  | "listening"
  | "transcribing"
  | "thinking"
  | "executing"
  | "waiting_for_confirmation"
  | "responding"
  | "speaking"
  | "error";

export interface VoiceSessionCallbacks {
  onStateChange?: (state: VoiceSessionState) => void;
  onTranscript?: (text: string, isFinal: boolean) => void;
  onAudioLevel?: (level: number) => void;
  onConfirmationRequest?: (toolId: string, description: string) => void;
  onConfirmationResult?: (toolId: string, approved: boolean) => void;
  onError?: (error: string) => void;
  onSpeakingStart?: () => void;
  onSpeakingEnd?: () => void;
}

export interface VoiceSession {
  start: () => Promise<void>;
  stop: () => void;
  pushToTalkStart: () => Promise<void>;
  pushToTalkEnd: () => void;
  processCommand: (text: string) => void;
  /** Speak a response without changing recognition state or starting follow-up listening. */
  speakText: (text: string) => void;
  handlePipelineResponse: (response: {
    message: string;
    pendingConfirmation?: { toolId: string; description: string } | null;
  }) => void;
  handleConfirmation: (toolId: string, approved: boolean) => void;
  getState: () => VoiceSessionState;
  getSettings: () => VoiceSettings;
  updateSettings: (settings: Partial<VoiceSettings>) => void;
  getPermissionState: () => MicPermissionState;
  retry: () => Promise<void>;
  destroy: () => void;
  isElectron: () => boolean;
}

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

function isElectron(): boolean {
  if (!isBrowser()) return false;
  const ua = navigator.userAgent;
  return ua.includes("Electron");
}

interface SpeechRecognitionAlternativeLike {
  readonly transcript: string;
  readonly confidence: number;
}

interface SpeechRecognitionResultLike {
  readonly length: number;
  readonly isFinal: boolean;
  item(index: number): SpeechRecognitionAlternativeLike | null;
  [index: number]: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionResultListLike {
  readonly length: number;
  item(index: number): SpeechRecognitionResultLike | null;
  [index: number]: SpeechRecognitionResultLike;
}

interface SpeechRecognitionEventLike {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultListLike;
}

interface SpeechRecognitionInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
}

export function createVoiceSession(
  sessionCallbacks: VoiceSessionCallbacks = {}
): VoiceSession {
  const mic = createMicrophoneManager();
  const vad = createVoiceActivityDetector({ speechThreshold: 0.12, silenceTimeout: 1500 });
  const tts = createTTSManager();
  // Native path has no MediaStream for the VAD, so barge-in is derived from
  // the companion's reported audio level instead.
  const bargeIn = createBargeInDetector();
  let settings = loadVoiceSettings();
  let state: VoiceSessionState = "idle";
  let permissionState: MicPermissionState = "unknown";

  let recognition: SpeechRecognitionInstance | null = null;
  let recognitionRestartTimer: ReturnType<typeof setTimeout> | null = null;
  let followUpTimer: ReturnType<typeof setTimeout> | null = null;
  let destroyed = false;

  // Native voice adapter (packaged Electron mode)
  const useNativeVoice = isElectron() && isNativeVoiceAvailable();
  let nativeVoice: NativeVoiceAdapter | null = null;

  const SpeechRecognitionCtor: (new () => SpeechRecognitionInstance) | null =
    isBrowser() && !useNativeVoice
      ? ((window as unknown as Record<string, unknown>)["SpeechRecognition"] as (new () => SpeechRecognitionInstance) | undefined) ??
        ((window as unknown as Record<string, unknown>)["webkitSpeechRecognition"] as (new () => SpeechRecognitionInstance) | undefined) ??
        null
      : null;

  const setState = (s: VoiceSessionState) => {
    state = s;
    sessionCallbacks.onStateChange?.(s);
  };

  const cleanupTimers = () => {
    if (recognitionRestartTimer) {
      clearTimeout(recognitionRestartTimer);
      recognitionRestartTimer = null;
    }
    if (followUpTimer) {
      clearTimeout(followUpTimer);
      followUpTimer = null;
    }
  };

  const destroyRecognition = () => {
    if (recognition) {
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      recognition.abort();
      recognition = null;
    }
    cleanupTimers();
  };

  const startRecognition = (opts?: { continuous?: boolean }) => {
    if (!SpeechRecognitionCtor || destroyed) return;
    destroyRecognition();

    const rec = new SpeechRecognitionCtor();
    rec.continuous = opts?.continuous ?? settings.wakeWordEnabled;
    rec.interimResults = true;
    rec.lang = "en-US";

    rec.onresult = (event: SpeechRecognitionEventLike) => {
      let finalText = "";
      let interimText = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (!result) continue;
        const text = result[0]?.transcript ?? "";
        if (result.isFinal) {
          finalText += text;
        } else {
          interimText += text;
        }
      }

      const displayText = finalText || interimText;

      if (displayText) {
        sessionCallbacks.onTranscript?.(displayText, !!finalText);
      }

      if (settings.wakeWordEnabled && state === "listening") {
        if (detectWakeWord(interimText) || detectWakeWord(finalText)) {
          const stripped = stripWakeWord(finalText || interimText);
          if (stripped.length > 0) {
            sessionCallbacks.onTranscript?.(stripped, true);
          }
          return;
        }
      }

      if (finalText && state === "listening") {
        setState("transcribing");
        processCommandInternal(finalText);
      }
    };

    rec.onerror = (event: { error: string }) => {
      if (event.error === "no-speech" || event.error === "aborted") return;

      // In packaged Electron, Web Speech API often fails with "network"
      // because it requires Google's cloud servers which may be unreachable.
      if (event.error === "network" && isElectron()) {
        setState("error");
        sessionCallbacks.onError?.(
          "Speech recognition is unavailable in the packaged app. Use typed commands or the voice button for push-to-talk.",
        );
        return;
      }

      setState("error");
      sessionCallbacks.onError?.(`Recognition error: ${event.error}`);
    };

    rec.onend = () => {
      if (destroyed) return;
      if (state === "listening" && settings.wakeWordEnabled) {
        recognitionRestartTimer = setTimeout(() => {
          if (!destroyed && state === "listening") {
            startRecognition(opts);
          }
        }, 100);
      }
    };

    recognition = rec;
    try {
      rec.start();
    } catch {
      setState("error");
      sessionCallbacks.onError?.("Failed to start speech recognition.");
    }
  };

  const processCommandInternal = async (text: string) => {
    setState("thinking");
    sessionCallbacks.onTranscript?.(text, true);

    // The caller (JarvisOrb) must handle the actual pipeline call.
    // We just expose the command via onTranscript and wait for handlePipelineResponse.
  };

  const startFollowUpWindow = () => {
    cleanupTimers();
    if (settings.followUpWindow <= 0) return;
    followUpTimer = setTimeout(() => {
      followUpTimer = null;
      if (state === "listening" || state === "idle") {
        if (settings.wakeWordEnabled) {
          if (state === "idle") {
            setState("listening");
            startRecognition({ continuous: true });
          }
        } else {
          setState("idle");
          stopMic();
        }
      }
    }, settings.followUpWindow * 1000);
  };

  const stopMic = () => {
    mic.stop();
    vad.detach();
    destroyRecognition();
  };

  const startNativeVoice = async () => {
    if (!nativeVoice) {
      nativeVoice = createNativeVoiceAdapter({
        onStateChange: (nativeState: string) => {
          if (destroyed) return;
          // Map native states to session states
          if (nativeState === "idle") {
            setState("idle");
          } else if (nativeState === "listening_for_wake") {
            setState("listening");
          } else if (nativeState === "listening_for_command") {
            setState("listening");
          }
        },
        onTranscript: (text: string, isFinal: boolean) => {
          if (destroyed) return;
          sessionCallbacks.onTranscript?.(text, isFinal);
          if (isFinal && text.length > 0 && state !== "thinking") {
            setState("transcribing");
            processCommandInternal(text);
          }
        },
        onAudioLevel: (level: number) => {
          sessionCallbacks.onAudioLevel?.(level);

          // Barge-in: the browser path gets this from the VAD's onSpeechStart,
          // but the native path only has this level stream to work with.
          if (state === "speaking" && bargeIn.feed(level)) {
            tts.interrupt();
            bargeIn.reset();
            sessionCallbacks.onSpeakingEnd?.();
            // The companion listens continuously, so unlike the browser path
            // there is no recognition to restart here.
            setState("listening");
          }
        },
        onError: (error: string) => {
          if (destroyed) return;
          setState("error");
          sessionCallbacks.onError?.(error);
        },
      });
    }
    await nativeVoice.start();
  };

  return {
    async start() {
      if (destroyed) return;
      cleanupTimers();

      // Native voice path (packaged Electron)
      if (useNativeVoice) {
        setState("mic_requested");
        sessionCallbacks.onStateChange?.("mic_requested");
        try {
          await startNativeVoice();
          setState("listening");
        } catch {
          setState("error");
          sessionCallbacks.onError?.("Failed to start native voice recognition.");
        }
        return;
      }

      // Browser path (Web Speech API)
      permissionState = await mic.requestPermission();
      setState("mic_requested");
      sessionCallbacks.onStateChange?.("mic_requested");

      if (permissionState !== "granted") {
        setState("error");
        sessionCallbacks.onError?.(
          permissionState === "denied"
            ? "Microphone access denied. Check your browser permissions."
            : "Microphone unavailable."
        );
        return;
      }

      let stream: MediaStream;
      try {
        stream = await mic.start();
      } catch {
        setState("error");
        sessionCallbacks.onError?.("Failed to access microphone. Please check permissions.");
        return;
      }
      vad.attach(stream);
      vad.setCallbacks({
        onLevel: (level) => sessionCallbacks.onAudioLevel?.(level),
        onSpeechStart: () => {
          if (state === "speaking") {
            tts.interrupt();
            sessionCallbacks.onSpeakingEnd?.();
            setState("listening");
            startRecognition({ continuous: settings.wakeWordEnabled });
          }
        },
      });

      setState("listening");
      startRecognition({ continuous: settings.wakeWordEnabled });
    },

    stop() {
      if (destroyed) return;
      cleanupTimers();
      tts.cancel();
      bargeIn.reset();
      if (useNativeVoice) {
        nativeVoice?.stop();
      } else {
        stopMic();
      }
      setState("idle");
    },

    async pushToTalkStart() {
      if (destroyed) return;
      cleanupTimers();

      if (state === "speaking") {
        tts.interrupt();
        bargeIn.reset();
        sessionCallbacks.onSpeakingEnd?.();
      }

      // Native voice path
      if (useNativeVoice) {
        setState("listening");
        await startNativeVoice();
        return;
      }

      // Browser path
      if (mic.getState() !== "active") {
        permissionState = await mic.requestPermission();
        if (permissionState !== "granted") {
          setState("error");
          sessionCallbacks.onError?.(
            permissionState === "denied"
              ? "Microphone access denied."
              : "Microphone unavailable."
          );
          return;
        }
        const stream = await mic.start();
        vad.attach(stream);
        vad.setCallbacks({
          onLevel: (level) => sessionCallbacks.onAudioLevel?.(level),
          onSpeechStart: () => {
            if (state === "speaking") {
              tts.interrupt();
              sessionCallbacks.onSpeakingEnd?.();
            }
          },
        });
      }

      setState("listening");
      startRecognition({ continuous: false });
    },

    pushToTalkEnd() {
      if (destroyed) return;
      if (useNativeVoice) {
        nativeVoice?.stop();
      } else if (recognition) {
        recognition.stop();
      }
    },

    processCommand(text: string) {
      processCommandInternal(text);
    },

    speakText(text: string) {
      if (destroyed || !settings.voiceResponseEnabled) return;
      tts.speak(text);
    },

    handlePipelineResponse(response: {
      message: string;
      pendingConfirmation?: { toolId: string; description: string } | null;
    }) {
      if (response.pendingConfirmation) {
        setState("waiting_for_confirmation");
        sessionCallbacks.onConfirmationRequest?.(
          response.pendingConfirmation.toolId,
          response.pendingConfirmation.description
        );
        return;
      }

      setState("responding");
      sessionCallbacks.onSpeakingStart?.();

      tts.speak(response.message, {
        onStart: () => {
          setState("speaking");
          // Arms native barge-in and starts its echo grace period.
          bargeIn.playbackStarted();
        },
        onEnd: () => {
          bargeIn.reset();
          sessionCallbacks.onSpeakingEnd?.();
          setState("listening");
          startFollowUpWindow();
          if (settings.wakeWordEnabled && !destroyed) {
            startRecognition({ continuous: true });
          }
        },
        onError: () => {
          bargeIn.reset();
          sessionCallbacks.onSpeakingEnd?.();
          setState("listening");
          startFollowUpWindow();
        },
      });
    },

    handleConfirmation(toolId: string, approved: boolean) {
      if (state === "waiting_for_confirmation") {
        setState("thinking");
        sessionCallbacks.onConfirmationResult?.(toolId, approved);
      }
    },

    getState() {
      return state;
    },

    getSettings() {
      return settings;
    },

    updateSettings(partial: Partial<VoiceSettings>) {
      settings = { ...settings, ...partial };
      saveVoiceSettings(settings);
    },

    getPermissionState() {
      return permissionState;
    },

    async retry() {
      if (destroyed) return;
      if (useNativeVoice) {
        nativeVoice?.stop();
        nativeVoice?.destroy();
        nativeVoice = null;
      } else {
        stopMic();
      }
      setState("idle");
      await new Promise((r) => setTimeout(r, 200));
      if (!destroyed) {
        await this.start();
      }
    },

    destroy() {
      destroyed = true;
      cleanupTimers();
      tts.destroy();
      vad.destroy();
      if (useNativeVoice) {
        nativeVoice?.destroy();
        nativeVoice = null;
      } else {
        stopMic();
      }
      setState("idle");
    },

    isElectron() {
      return isElectron();
    },
  };
}
