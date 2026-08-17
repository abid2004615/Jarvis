/**
 * macOS Application Management
 * Safe, allowlisted application launching
 *
 * Note: This module uses child_process which is Node.js-only.
 * It cannot be used in browser/client code.
 */

import type {
  AppLaunchResult,
  AppQuitResult,
  FrontmostAppResult,
  RunningApplicationsResult,
} from "./types";
import {
  getAllowlistedApplication as getAllowlistedApplicationFromAllowlist,
  resolveApplicationName as resolveApplicationNameFromAllowlist,
} from "./allowlist";

export {
  APPLICATION_ALLOWLIST,
  getAllowlistedApplication,
  getAllowlistedApplications,
  resolveApplicationName,
} from "./allowlist";

// Lazy-load child_process only when needed (server-side)
let execSync: typeof import("child_process").execSync | null = null;

function getExecSync() {
  if (execSync === null) {
    try {
      execSync = require("child_process").execSync;
    } catch (error) {
      return null;
    }
  }
  return execSync;
}

/**
 * Check if system is macOS
 */
function isMacOS(): boolean {
  return process.platform === "darwin";
}

/**
 * Launch an application by name (allowlist only)
 * Returns success status and details
 */
export function launchApplication(applicationName: string): AppLaunchResult {
  if (!isMacOS()) {
    return {
      success: false,
      application: applicationName,
      message: "Application launching only available on macOS",
    };
  }

  // Check if application is in allowlist (aliases resolve to canonical entry)
  const app = getAllowlistedApplicationFromAllowlist(applicationName) ?? resolveApplicationNameFromAllowlist(applicationName);
  if (!app) {
    return {
      success: false,
      application: applicationName,
      message: `Application '${applicationName}' is not in the approved allowlist`,
    };
  }

  try {
    const exec = getExecSync();
    if (!exec) {
      return {
        success: false,
        application: app.name,
        message: "Unable to launch applications: child_process not available",
      };
    }

    // Use 'open' command with -a flag to launch by name
    // This is safe because 'open -a' validates the application name
    exec(`open -a "${app.name}"`, {
      timeout: 5000,
      stdio: ["pipe", "pipe", "pipe"],
    });

    return {
      success: true,
      application: app.name,
      message: `Successfully launched ${app.name}`,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Determine if the error is "app not found" or something else
    if (errorMessage.includes("not found") || errorMessage.includes("doesn't exist")) {
      return {
        success: false,
        application: app.name,
        message: `Application '${app.name}' not found on this system`,
      };
    }

    return {
      success: false,
      application: app.name,
      message: `Failed to launch ${app.name}: ${errorMessage}`,
    };
  }
}

/**
 * Check if an application exists on the system
 */
export function applicationExists(applicationName: string): boolean {
  if (!isMacOS()) {
    return false;
  }

  const app = getAllowlistedApplicationFromAllowlist(applicationName);
  if (!app || !app.path) {
    return false;
  }

  try {
    const exec = getExecSync();
    if (!exec) {
      return false;
    }

    exec(`[ -d "${app.path}" ]`, {
      stdio: ["pipe", "pipe", "pipe"],
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Quit an allowlisted application by name.
 * Uses `osascript -e 'quit app "NAME"'` — a controlled, app-level quit.
 * The name is always resolved against the allowlist; arbitrary processes
 * can never be terminated.
 */
export function quitApplication(applicationName: string): AppQuitResult {
  if (!isMacOS()) {
    return {
      success: false,
      application: applicationName,
      message: "Application control only available on macOS",
    };
  }

  const app = getAllowlistedApplicationFromAllowlist(applicationName) ?? resolveApplicationNameFromAllowlist(applicationName);
  if (!app) {
    return {
      success: false,
      application: applicationName,
      message: `Application '${applicationName}' is not in the approved allowlist`,
    };
  }

  try {
    const exec = getExecSync();
    if (!exec) {
      return {
        success: false,
        application: app.name,
        message: "Unable to quit applications: child_process not available",
      };
    }

    exec(`osascript -e 'quit app "${app.name}"'`, {
      timeout: 10000,
      stdio: ["pipe", "pipe", "pipe"],
    });

    return {
      success: true,
      application: app.name,
      message: `Successfully quit ${app.name}`,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      application: app.name,
      message: `Failed to quit ${app.name}: ${errorMessage}`,
    };
  }
}

/**
 * Get the application currently in the foreground.
 * Uses `lsappinfo` (no accessibility permission required). Read-only.
 * The bundle identifier is included when `lsappinfo` reports it; it is never
 * guessed or fabricated.
 */
export function getFrontmostApplication(): FrontmostAppResult {
  if (!isMacOS()) {
    return { available: false, error: "Not running on macOS" };
  }

  try {
    const exec = getExecSync();
    if (!exec) {
      return { available: false, error: "child_process not available" };
    }

    const front = exec("lsappinfo front", {
      timeout: 5000,
      stdio: ["pipe", "pipe", "pipe"],
    })
      .toString()
      .trim();
    if (!front) {
      return { available: false, error: "Could not determine frontmost application" };
    }
    const asn = front.replace(/:$/, "");
    if (!/^ASN:[0-9A-Fa-fx,\-]+$/.test(asn)) {
      return { available: false, error: "Unexpected frontmost application identifier" };
    }

    const info = exec(`lsappinfo info -only name ${asn}`, {
      timeout: 5000,
      stdio: ["pipe", "pipe", "pipe"],
    })
      .toString()
      .trim();
    const match = info.match(/"name"="([^"]+)"/) || info.match(/"LSDisplayName"="([^"]+)"/);
    if (!match || !match[1]) {
      return { available: false, error: "Could not determine frontmost application name" };
    }

    // Best-effort bundle identifier. Failure here must never fail the whole
    // lookup — the name is still valid without it.
    let bundleId: string | undefined;
    try {
      const bundleOutput = exec(`lsappinfo info -only bundleid ${asn}`, {
        timeout: 5000,
        stdio: ["pipe", "pipe", "pipe"],
      })
        .toString()
        .trim();
      const bundleMatch =
        bundleOutput.match(/"bundleid"="([^"]+)"/) ||
        bundleOutput.match(/"ASBundle"="([^"]+)"/);
      if (bundleMatch && bundleMatch[1]) {
        bundleId = bundleMatch[1];
      }
    } catch {
      bundleId = undefined;
    }

    return { available: true, name: match[1], ...(bundleId ? { bundleId } : {}) };
  } catch (error) {
    return { available: false, error: "Failed to read frontmost application" };
  }
}

const MAX_RUNNING_APPS = 15;

/**
 * Get a concise, deduplicated list of running GUI applications.
 * Parses process executable paths under /Applications (no permissions needed)
 * and bounds the result to MAX_RUNNING_APPS entries.
 */
export function getRunningApplications(): RunningApplicationsResult {
  if (!isMacOS()) {
    return { available: false, applications: [], error: "Not running on macOS" };
  }

  try {
    const exec = getExecSync();
    if (!exec) {
      return { available: false, applications: [], error: "child_process not available" };
    }

    const output = exec("ps -ax -o comm=", {
      timeout: 5000,
      maxBuffer: 2 * 1024 * 1024,
      stdio: ["pipe", "pipe", "pipe"],
    })
      .toString();

    const appNames = new Set<string>();
    for (const line of output.split("\n")) {
      const match = line.match(
        /(?:\/Applications|\/System\/Applications|\/System\/Library\/CoreServices)\/([^/]+)\.app\//,
      );
      if (match && match[1]) {
        appNames.add(match[1]);
      }
    }

    const applications = Array.from(appNames)
      .sort((a, b) => a.localeCompare(b))
      .slice(0, MAX_RUNNING_APPS)
      .map((name) => ({ name }));

    return { available: true, applications };
  } catch (error) {
    return { available: false, applications: [], error: "Failed to read running applications" };
  }
}
