/**
 * JARVIS HUD — Electron bridge
 *
 * Thin accessor for the quick-command overlay half of the preload bridge.
 * Mirrors lib/voice/native.ts: every method is optional so the HUD route also
 * renders in a plain browser, where it simply has nothing to talk to.
 */

export interface HudInfo {
  shortcut: string;
  shortcutRegistered: boolean;
}

interface JarvisHudElectron {
  hudHide?: () => Promise<{ ok: boolean }>;
  hudResize?: (height: number) => Promise<{ ok: boolean; height?: number }>;
  hudOpenMain?: () => Promise<{ ok: boolean }>;
  hudInfo?: () => Promise<HudInfo>;
  onHudShown?: (callback: () => void) => () => void;
  onHudHidden?: (callback: () => void) => () => void;
}

function getBridge(): JarvisHudElectron | null {
  if (typeof window === "undefined") return null;
  const candidate = (window as unknown as Record<string, unknown>).jarvis;
  if (candidate && typeof candidate === "object") {
    return candidate as JarvisHudElectron;
  }
  return null;
}

/** True when running inside the Electron overlay window. */
export function isHudBridgeAvailable(): boolean {
  return Boolean(getBridge()?.hudHide);
}

/** Dismiss the overlay. No-op outside Electron. */
export function hideHud(): void {
  void getBridge()?.hudHide?.();
}

/** Ask the main process to match the window height to the content. */
export function resizeHud(height: number): void {
  void getBridge()?.hudResize?.(height);
}

/** Dismiss the overlay and bring the full JARVIS window forward. */
export function openMainWindow(): void {
  void getBridge()?.hudOpenMain?.();
}

/** Shortcut metadata for display, or null when unavailable. */
export async function getHudInfo(): Promise<HudInfo | null> {
  const bridge = getBridge();
  if (!bridge?.hudInfo) return null;
  try {
    return await bridge.hudInfo();
  } catch {
    return null;
  }
}

/** Subscribe to reveal events. Returns an unsubscribe function. */
export function onHudShown(callback: () => void): () => void {
  return getBridge()?.onHudShown?.(callback) ?? (() => {});
}

/** Subscribe to dismiss events. Returns an unsubscribe function. */
export function onHudHidden(callback: () => void): () => void {
  return getBridge()?.onHudHidden?.(callback) ?? (() => {});
}
