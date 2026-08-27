/**
 * JARVIS Vision — Settings
 *
 * Vision settings persistence via localStorage.
 * Conservative defaults — all vision features OFF by default.
 */

import type { VisionConfig } from "./types";

const STORAGE_KEY = "jarvis-vision-settings";

const DEFAULTS: VisionConfig = {
  enabled: false,
  screenAwareness: false,
  autoChangeDetection: false,
};

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

export function loadVisionSettings(): VisionConfig {
  if (!isBrowser()) return { ...DEFAULTS };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<VisionConfig>;
    return { ...DEFAULTS, ...parsed };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveVisionSettings(settings: VisionConfig): void {
  if (!isBrowser()) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // fail silently
  }
}

export function resetVisionSettings(): void {
  if (!isBrowser()) return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
