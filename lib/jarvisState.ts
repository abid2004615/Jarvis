export type OrbMode =
  | "IDLE"
  | "LISTENING"
  | "THINKING"
  | "SPEAKING"
  | "PROCESSING"
  | "SYSTEM"
  | "ALERT"
  | "ERROR"
  | "SUCCESS";

export type GestureName =
  | "IDLE"
  | "PINCH ACTIVE"
  | "OPEN PALM"
  | "FIST"
  | "SWIPE LEFT"
  | "SWIPE RIGHT"
  | "SWIPE UP"
  | "SWIPE DOWN"
  | "POINTING"
  | "THREE-FINGER"
  | "TWO-HAND ZOOM";

export type CameraState = "off" | "starting" | "on" | "error";

import { JarvisRuntimeState } from "@/lib/runtime/types";

export interface JarvisState {
  orbMode: OrbMode;
  runtimeState: JarvisRuntimeState;
  gesture: GestureName;
  gestureConfidence: number;
  camera: CameraState;
  micEnabled: boolean;
  hudVisible: boolean;
  aiReady: boolean;
  systemOnline: boolean;
  transcript: string;
  responseText: string;
  audioLevel: number;
  cpu: number;
  memory: number;
  network: number;
  battery: number;
  uptime: number;
  disk: number;
}

export const DEFAULT_JARVIS_STATE: JarvisState = {
  orbMode: "IDLE",
  runtimeState: JarvisRuntimeState.IDLE,
  gesture: "IDLE",
  gestureConfidence: 0,
  camera: "off",
  micEnabled: false,
  hudVisible: true,
  aiReady: true,
  systemOnline: true,
  transcript: "SYSTEM READY",
  responseText: "JARVIS ONLINE",
  audioLevel: 0,
  cpu: 42,
  memory: 72,
  network: 18,
  battery: 84,
  uptime: 1880,
  disk: 61,
};

export const ORB_MODE_SETTINGS: Record<OrbMode, {
  rotationSpeed: number;
  coreBrightness: number;
  particleSpeed: number;
  particleDensity: number;
  ringSpeed: number;
  shellOpacity: number;
  bloom: number;
  pulse: number;
  scanline: number;
}> = {
  IDLE: {
    rotationSpeed: 0.0018,
    coreBrightness: 0.9,
    particleSpeed: 0.9,
    particleDensity: 0.8,
    ringSpeed: 0.7,
    shellOpacity: 0.76,
    bloom: 1.6,
    pulse: 0.7,
    scanline: 0.3,
  },
  LISTENING: {
    rotationSpeed: 0.004,
    coreBrightness: 1.3,
    particleSpeed: 1.1,
    particleDensity: 1.05,
    ringSpeed: 1.4,
    shellOpacity: 0.88,
    bloom: 2.2,
    pulse: 1.4,
    scanline: 0.55,
  },
  THINKING: {
    rotationSpeed: 0.008,
    coreBrightness: 1.8,
    particleSpeed: 1.5,
    particleDensity: 1.35,
    ringSpeed: 2.2,
    shellOpacity: 0.95,
    bloom: 2.8,
    pulse: 2.2,
    scanline: 0.72,
  },
  SPEAKING: {
    rotationSpeed: 0.01,
    coreBrightness: 2.2,
    particleSpeed: 1.8,
    particleDensity: 1.4,
    ringSpeed: 2.8,
    shellOpacity: 1,
    bloom: 3.2,
    pulse: 2.6,
    scanline: 0.9,
  },
  PROCESSING: {
    rotationSpeed: 0.012,
    coreBrightness: 2.0,
    particleSpeed: 1.9,
    particleDensity: 1.7,
    ringSpeed: 2.4,
    shellOpacity: 0.98,
    bloom: 3.5,
    pulse: 2.8,
    scanline: 0.8,
  },
  SYSTEM: {
    rotationSpeed: 0.006,
    coreBrightness: 1.5,
    particleSpeed: 1.2,
    particleDensity: 1.25,
    ringSpeed: 1.8,
    shellOpacity: 0.9,
    bloom: 2.4,
    pulse: 1.8,
    scanline: 0.6,
  },
  ALERT: {
    rotationSpeed: 0.014,
    coreBrightness: 2.7,
    particleSpeed: 2.1,
    particleDensity: 1.6,
    ringSpeed: 2.9,
    shellOpacity: 1,
    bloom: 4.2,
    pulse: 3.4,
    scanline: 1.1,
  },
  ERROR: {
    rotationSpeed: 0.015,
    coreBrightness: 2.5,
    particleSpeed: 2.3,
    particleDensity: 1.8,
    ringSpeed: 3.2,
    shellOpacity: 0.95,
    bloom: 4.8,
    pulse: 3.8,
    scanline: 1.3,
  },
  SUCCESS: {
    rotationSpeed: 0.009,
    coreBrightness: 2.0,
    particleSpeed: 1.5,
    particleDensity: 1.4,
    ringSpeed: 2.6,
    shellOpacity: 0.92,
    bloom: 3.1,
    pulse: 3.0,
    scanline: 0.7,
  },
};

export const MODE_TO_STATUS: Record<OrbMode, string> = {
  IDLE: "ONLINE",
  LISTENING: "LISTENING",
  THINKING: "PROCESSING",
  SPEAKING: "RESPONDING",
  PROCESSING: "ANALYZING",
  SYSTEM: "SYSTEM",
  ALERT: "ALERT",
  ERROR: "ERROR",
  SUCCESS: "SUCCESS",
};

export function getOrbState(mode: OrbMode) {
  return ORB_MODE_SETTINGS[mode];
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export interface JarvisStore {
  getState: () => JarvisState;
  setState: (updater: JarvisState | ((prev: JarvisState) => JarvisState)) => void;
  subscribe: (listener: (state: JarvisState) => void) => () => void;
  setOrbMode: (orbMode: OrbMode) => void;
  setGesture: (gesture: GestureName, confidence?: number) => void;
  setInfo: (patch: Partial<JarvisState>) => void;
}

export function createJarvisStore(initialState: JarvisState = DEFAULT_JARVIS_STATE): JarvisStore {
  let state = { ...initialState };
  const listeners = new Set<(value: JarvisState) => void>();

  const emit = () => {
    for (const listener of listeners) listener(state);
  };

  return {
    getState: () => state,
    setState: (updater) => {
      state = typeof updater === "function" ? updater(state) : updater;
      emit();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setOrbMode: (orbMode) => {
      state = { ...state, orbMode };
      emit();
    },
    setGesture: (gesture, confidence = state.gestureConfidence) => {
      state = { ...state, gesture, gestureConfidence: confidence };
      emit();
    },
    setInfo: (patch) => {
      state = { ...state, ...patch };
      emit();
    },
  };
}
