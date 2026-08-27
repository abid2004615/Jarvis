/**
 * macOS Music Integration
 * Read and control Apple Music playback via AppleScript.
 * Read operations are safe (no confirmation).
 * Playback control operations (play/pause/next/previous) are safe.
 *
 * Uses execFileSync (no shell) for security.
 */

// Lazy-load child_process only when needed (server-side)
let execFileSync: typeof import("child_process").execFileSync | null = null;

function getExecFileSync() {
  if (execFileSync === null) {
    try {
      execFileSync = require("child_process").execFileSync;
    } catch {
      return null;
    }
  }
  return execFileSync;
}

function isMacOS(): boolean {
  return process.platform === "darwin";
}

const MUSIC_TIMEOUT_MS = 5000;

export interface TrackInfo {
  name: string;
  artist: string;
  album: string;
  duration: number;
  position: number;
  isPlaying: boolean;
}

export interface MusicState {
  available: boolean;
  isRunning: boolean;
  playerState?: string;
  currentTrack?: TrackInfo;
  error?: string;
}

export interface MusicActionResult {
  success: boolean;
  message: string;
  error?: string;
}

/**
 * Check if Music app is running.
 */
export function isMusicRunning(): boolean {
  if (!isMacOS()) return false;

  try {
    const exec = getExecFileSync();
    if (!exec) return false;

    const output = exec("pgrep -x Music", {
      encoding: "utf8",
      timeout: MUSIC_TIMEOUT_MS,
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
    }).toString().trim();

    return output.length > 0;
  } catch {
    return false;
  }
}

/**
 * Get the current Music state including playback info and track details.
 */
export function getMusicState(): MusicState {
  if (!isMacOS()) {
    return { available: false, isRunning: false, error: "Not running on macOS" };
  }

  const running = isMusicRunning();
  if (!running) {
    return { available: true, isRunning: false };
  }

  try {
    const exec = getExecFileSync();
    if (!exec) {
      return { available: false, isRunning: true, error: "child_process not available" };
    }

    const script = [
      'tell application "Music"',
      "  set playerState to player state as string",
      "  if playerState is \"stopped\" then",
      "    return \"STOPPED\"",
      "  end if",
      "  set trackName to name of current track",
      "  set artistName to artist of current track",
      "  set albumName to album of current track",
      "  set trackDuration to duration of current track",
      "  set trackPosition to player position",
      "  return playerState & \"|||\" & trackName & \"|||\" & artistName & \"|||\" & albumName & \"|||\" & trackDuration & \"|||\" & trackPosition",
      "end tell",
    ].join("\n");

    const output = exec("osascript", [], {
      input: script,
      encoding: "utf8",
      shell: false,
      timeout: MUSIC_TIMEOUT_MS,
      stdio: ["pipe", "pipe", "pipe"],
    }).toString().trim();

    if (output === "STOPPED") {
      return { available: true, isRunning: true, playerState: "stopped" };
    }

    const parts = output.split("|||");
    if (parts.length >= 6) {
      return {
        available: true,
        isRunning: true,
        playerState: parts[0],
        currentTrack: {
          name: parts[1],
          artist: parts[2],
          album: parts[3],
          duration: parseInt(parts[4], 10) || 0,
          position: parseInt(parts[5], 10) || 0,
          isPlaying: parts[0] === "playing",
        },
      };
    }

    return { available: true, isRunning: true, playerState: "unknown" };
  } catch {
    return { available: false, isRunning: true, error: "Could not read Music state" };
  }
}

/**
 * Control Music playback: play, pause, next, previous.
 */
export function controlMusic(action: "play" | "pause" | "next" | "previous"): MusicActionResult {
  if (!isMacOS()) {
    return { success: false, message: "Not running on macOS" };
  }

  const running = isMusicRunning();
  if (!running) {
    return { success: false, message: "Music is not running" };
  }

  try {
    const exec = getExecFileSync();
    if (!exec) {
      return { success: false, message: "child_process not available" };
    }

    const appleScriptAction = {
      play: "play",
      pause: "pause",
      next: "next track",
      previous: "previous track",
    }[action];

    const script = [
      'tell application "Music"',
      `  ${appleScriptAction}`,
      "end tell",
    ].join("\n");

    exec("osascript", [], {
      input: script,
      encoding: "utf8",
      shell: false,
      timeout: MUSIC_TIMEOUT_MS,
      stdio: ["pipe", "pipe", "pipe"],
    });

    return { success: true, message: `Music ${action === "play" ? "playing" : action === "pause" ? "paused" : action === "next" ? "skipped to next track" : "went to previous track"}` };
  } catch {
    return { success: false, message: `Could not ${action} music` };
  }
}

/**
 * Play a specific track or search and play in Music.
 */
export function playTrack(query: string): MusicActionResult {
  if (!isMacOS()) {
    return { success: false, message: "Not running on macOS" };
  }

  if (!query || typeof query !== "string") {
    return { success: false, message: "Track name or search query required" };
  }

  try {
    const exec = getExecFileSync();
    if (!exec) {
      return { success: false, message: "child_process not available" };
    }

    const script = [
      'tell application "Music"',
      "  activate",
      `  search playlist "Library" for "${query.replace(/"/g, '\\"')}" only songs`,
      "  play",
      "end tell",
    ].join("\n");

    exec("osascript", [], {
      input: script,
      encoding: "utf8",
      shell: false,
      timeout: MUSIC_TIMEOUT_MS,
      stdio: ["pipe", "pipe", "pipe"],
    });

    return { success: true, message: `Playing music matching "${query}"` };
  } catch {
    return { success: false, message: `Could not play "${query}"` };
  }
}
