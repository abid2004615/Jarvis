/**
 * JARVIS Voice — Public API
 *
 * Re-exports all voice modules for clean imports.
 */

export { createMicrophoneManager } from "./microphone";
export type { MicrophoneManager, MicPermissionState } from "./microphone";

export { createVoiceActivityDetector } from "./vad";
export type { VoiceActivityDetector, VADConfig, VADCallbacks } from "./vad";

export { detectWakeWord, stripWakeWord } from "./wake-word";

export { createVoiceSession } from "./session";
export type { VoiceSession, VoiceSessionState, VoiceSessionCallbacks } from "./session";

export { createTTSManager } from "./tts";
export type { TTSManager, TTSConfig } from "./tts";

export { loadVoiceSettings, saveVoiceSettings, resetVoiceSettings } from "./settings";
export type { VoiceSettings } from "./settings";
