/**
 * JARVIS Voice — Microphone Manager
 *
 * Controlled microphone lifecycle. Only one active session at a time.
 * Handles permission, getUserMedia, stream release, and half-duplex pause/resume.
 * Never captures audio when JARVIS is explicitly disabled.
 */

export type MicPermissionState = "unknown" | "granted" | "denied" | "unavailable";

export interface MicrophoneManager {
  requestPermission: () => Promise<MicPermissionState>;
  start: () => Promise<MediaStream>;
  stop: () => void;
  pause: () => void;
  resume: () => void;
  getStream: () => MediaStream | null;
  getState: () => "idle" | "active" | "paused";
  checkPermission: () => Promise<MicPermissionState>;
}

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof navigator !== "undefined";
}

export function createMicrophoneManager(): MicrophoneManager {
  let stream: MediaStream | null = null;
  let state: "idle" | "active" | "paused" = "idle";

  const getTracks = () => stream?.getAudioTracks() ?? [];

  return {
    async requestPermission(): Promise<MicPermissionState> {
      if (!isBrowser()) return "unavailable";
      try {
        const tempStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        tempStream.getTracks().forEach((t) => t.stop());
        return "granted";
      } catch (err: unknown) {
        const name = err instanceof DOMException ? err.name : "";
        if (name === "NotAllowedError" || name === "PermissionDeniedError") return "denied";
        return "unavailable";
      }
    },

    async start(): Promise<MediaStream> {
      if (state === "active" && stream) {
        return stream;
      }
      if (state === "paused" && stream) {
        this.resume();
        return stream;
      }

      if (!isBrowser()) {
        throw new Error("Microphone unavailable: not in a browser");
      }

      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        state = "active";
        return stream;
      } catch (err: unknown) {
        state = "idle";
        const name = err instanceof DOMException ? err.name : "";
        if (name === "NotAllowedError" || name === "PermissionDeniedError") {
          throw new Error("Microphone access denied. Check your browser permissions.");
        }
        throw new Error("Microphone unavailable.");
      }
    },

    stop() {
      getTracks().forEach((t) => {
        t.stop();
      });
      stream = null;
      state = "idle";
    },

    pause() {
      if (state === "active" && stream) {
        getTracks().forEach((t) => {
          t.enabled = false;
        });
        state = "paused";
      }
    },

    resume() {
      if (state === "paused" && stream) {
        getTracks().forEach((t) => {
          t.enabled = true;
        });
        state = "active";
      }
    },

    getStream() {
      return stream;
    },

    getState() {
      return state;
    },

    async checkPermission(): Promise<MicPermissionState> {
      if (!isBrowser()) return "unavailable";
      if (navigator.permissions?.query) {
        try {
          const result = await navigator.permissions.query({ name: "microphone" as PermissionName });
          if (result.state === "granted") return "granted";
          if (result.state === "denied") return "denied";
          return "unknown";
        } catch {
          return "unknown";
        }
      }
      return "unknown";
    },
  };
}
