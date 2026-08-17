/**
 * macOS Application Allowlist
 * Pure data module — safe to import anywhere (client or server).
 * Single source of truth for which applications JARVIS may launch.
 * Every application must be explicitly approved; no arbitrary paths.
 */

import type { ApplicationDefinition } from "./types";

/**
 * Allowlist of applications that can be launched
 * Each application must be explicitly approved
 * Add more applications as needed
 */
export const APPLICATION_ALLOWLIST: Map<string, ApplicationDefinition> = new Map([
  [
    "Safari",
    {
      name: "Safari",
      bundleId: "com.apple.Safari",
      path: "/Applications/Safari.app",
      description: "Safari web browser",
      allowedRiskLevel: "safe",
    },
  ],
  [
    "Chrome",
    {
      name: "Google Chrome",
      bundleId: "com.google.Chrome",
      path: "/Applications/Google Chrome.app",
      description: "Google Chrome web browser",
      allowedRiskLevel: "safe",
    },
  ],
  [
    "Firefox",
    {
      name: "Firefox",
      bundleId: "org.mozilla.firefox",
      path: "/Applications/Firefox.app",
      description: "Mozilla Firefox web browser",
      allowedRiskLevel: "safe",
    },
  ],
  [
    "Mail",
    {
      name: "Mail",
      bundleId: "com.apple.mail",
      path: "/Applications/Mail.app",
      description: "Apple Mail email client",
      allowedRiskLevel: "safe",
    },
  ],
  [
    "Messages",
    {
      name: "Messages",
      bundleId: "com.apple.iChat",
      path: "/Applications/Messages.app",
      description: "Apple Messages chat application",
      allowedRiskLevel: "safe",
    },
  ],
  [
    "Finder",
    {
      name: "Finder",
      bundleId: "com.apple.finder",
      path: "/System/Library/CoreServices/Finder.app",
      description: "File manager",
      allowedRiskLevel: "safe",
    },
  ],
  [
    "Notes",
    {
      name: "Notes",
      bundleId: "com.apple.Notes",
      path: "/Applications/Notes.app",
      description: "Apple Notes application",
      allowedRiskLevel: "safe",
    },
  ],
  [
    "Calendar",
    {
      name: "Calendar",
      bundleId: "com.apple.iCal",
      path: "/Applications/Calendar.app",
      description: "Apple Calendar",
      allowedRiskLevel: "safe",
    },
  ],
  [
    "Reminders",
    {
      name: "Reminders",
      bundleId: "com.apple.reminders",
      path: "/Applications/Reminders.app",
      description: "Apple Reminders",
      allowedRiskLevel: "safe",
    },
  ],
  [
    "Terminal",
    {
      name: "Terminal",
      bundleId: "com.apple.Terminal",
      path: "/Applications/Utilities/Terminal.app",
      description: "macOS Terminal",
      allowedRiskLevel: "confirmation",
    },
  ],
  [
    "Spotify",
    {
      name: "Spotify",
      bundleId: "com.spotify.client",
      path: "/Applications/Spotify.app",
      description: "Spotify music streaming",
      allowedRiskLevel: "safe",
    },
  ],
  [
    "Music",
    {
      name: "Music",
      bundleId: "com.apple.Music",
      path: "/Applications/Music.app",
      description: "Apple Music",
      allowedRiskLevel: "safe",
    },
  ],
  [
    "Visual Studio Code",
    {
      name: "Visual Studio Code",
      bundleId: "com.microsoft.VSCode",
      path: "/Applications/Visual Studio Code.app",
      description: "Visual Studio Code editor",
      allowedRiskLevel: "safe",
    },
  ],
  [
    "System Settings",
    {
      name: "System Settings",
      bundleId: "com.apple.systempreferences",
      path: "/System/Applications/System Settings.app",
      description: "macOS System Settings",
      allowedRiskLevel: "safe",
    },
  ],
]);

/**
 * Common aliases that map to an allowlist key.
 * The model may say "VS Code", "Google Chrome", or "Settings"; these all
 * resolve to the single canonical allowlist entry — never to a raw path.
 */
const APPLICATION_ALIASES: Record<string, string> = {
  safari: "Safari",
  chrome: "Chrome",
  "google chrome": "Chrome",
  firefox: "Firefox",
  finder: "Finder",
  terminal: "Terminal",
  mail: "Mail",
  messages: "Messages",
  notes: "Notes",
  calendar: "Calendar",
  reminders: "Reminders",
  music: "Music",
  "apple music": "Music",
  spotify: "Spotify",
  "vs code": "Visual Studio Code",
  vscode: "Visual Studio Code",
  "visual studio code": "Visual Studio Code",
  "system settings": "System Settings",
  "system preferences": "System Settings",
  settings: "System Settings",
};

/**
 * Get an application from the allowlist
 */
export function getAllowlistedApplication(name: string): ApplicationDefinition | null {
  return APPLICATION_ALLOWLIST.get(name) || null;
}

/**
 * Resolve a user/model-provided application name against the allowlist.
 * Matches exact keys, aliases, and case-insensitive names. Returns null for
 * anything not explicitly approved — arbitrary paths are never resolved.
 */
export function resolveApplicationName(name: string): ApplicationDefinition | null {
  const key = name.trim();
  if (!key) return null;

  const lower = key.toLowerCase();
  const aliasTarget = APPLICATION_ALIASES[lower];
  if (aliasTarget) {
    return getAllowlistedApplication(aliasTarget);
  }

  const exact = getAllowlistedApplication(key);
  if (exact) return exact;

  for (const [k, v] of APPLICATION_ALLOWLIST.entries()) {
    if (k.toLowerCase() === lower) return v;
  }

  return null;
}

/**
 * Get list of all allowlisted applications
 */
export function getAllowlistedApplications(): ApplicationDefinition[] {
  return Array.from(APPLICATION_ALLOWLIST.values());
}
