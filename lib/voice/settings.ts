/**
 * JARVIS Voice — Settings
 *
 * Voice settings types + localStorage persistence.
 * Non-sensitive data only — no secrets stored here.
 */

export interface VoiceSettings {
  wakeWordEnabled: boolean;
  followUpWindow: number;
  voiceResponseEnabled: boolean;
  pushToTalkEnabled: boolean;
}

const STORAGE_KEY = "jarvis-voice-settings";

const DEFAULTS: VoiceSettings = {
  wakeWordEnabled: false,
  followUpWindow: 15,
  voiceResponseEnabled: true,
  pushToTalkEnabled: true,
};

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

export function loadVoiceSettings(): VoiceSettings {
  if (!isBrowser()) return { ...DEFAULTS };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<VoiceSettings>;
    return { ...DEFAULTS, ...parsed };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveVoiceSettings(settings: VoiceSettings): void {
  if (!isBrowser()) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // localStorage may be full or disabled — fail silently
  }
}

export function resetVoiceSettings(): void {
  if (!isBrowser()) return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
