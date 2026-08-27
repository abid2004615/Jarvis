/**
 * JARVIS Voice — Native STT Adapter
 *
 * Bridges Electron IPC native voice events to the voice session interface.
 * Only active in packaged Electron mode where Web Speech API is unavailable.
 *
 * Flow:
 *   Electron main → IPC → adapter → voice session → pipeline
 */

export interface NativeVoiceCallbacks {
  onStateChange?: (state: string) => void;
  onTranscript?: (text: string, isFinal: boolean) => void;
  onAudioLevel?: (level: number) => void;
  onError?: (error: string) => void;
}

export interface NativeVoiceAdapter {
  start: () => Promise<void>;
  stop: () => void;
  isAvailable: () => boolean;
  destroy: () => void;
}

interface JarvisElectron {
  voiceStart?: () => Promise<{ ok: boolean; available?: boolean }>;
  voiceStop?: () => Promise<{ ok: boolean }>;
  voiceAvailable?: () => Promise<{ available: boolean }>;
  onVoiceEvent?: (callback: (event: unknown) => void) => () => void;
}

function getJarvisElectron(): JarvisElectron | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, unknown>;
  const jarvis = w.jarvis;
  if (jarvis && typeof jarvis === "object") {
    return jarvis as JarvisElectron;
  }
  return null;
}

export function isNativeVoiceAvailable(): boolean {
  const electron = getJarvisElectron();
  return Boolean(electron?.voiceStart && electron?.voiceStop && electron?.onVoiceEvent);
}

export function createNativeVoiceAdapter(
  callbacks: NativeVoiceCallbacks = {},
): NativeVoiceAdapter {
  const electron = getJarvisElectron();
  let available = Boolean(electron?.voiceStart);
  let destroyed = false;
  let unsubscribe: (() => void) | null = null;

  // Subscribe to voice events from main process
  const setupListener = () => {
    if (!electron?.onVoiceEvent) return;

    unsubscribe = electron.onVoiceEvent((event: unknown) => {
      if (destroyed) return;
      const msg = event as Record<string, unknown>;
      const type = msg.type;

      if (type === "state") {
        callbacks.onStateChange?.(String(msg.state ?? "idle"));
      } else if (type === "transcript") {
        callbacks.onTranscript?.(
          String(msg.text ?? ""),
          Boolean(msg.isFinal),
        );
      } else if (type === "audio_level") {
        callbacks.onAudioLevel?.(Number(msg.level ?? 0));
      } else if (type === "error") {
        callbacks.onError?.(String(msg.message ?? "Voice error"));
      }
    });
  };

  return {
    async start() {
      if (destroyed || !electron?.voiceStart) {
        available = false;
        return;
      }

      setupListener();

      try {
        const result = await electron.voiceStart();
        available = result?.available !== false;
      } catch {
        available = false;
        callbacks.onError?.("Failed to start native voice");
      }
    },

    stop() {
      if (!electron?.voiceStop) return;
      try {
        electron.voiceStop();
      } catch {
        // ignore
      }
    },

    isAvailable() {
      return available;
    },

    destroy() {
      destroyed = true;
      unsubscribe?.();
      unsubscribe = null;
    },
  };
}
