import type { MacOSSystemTelemetry } from "@/lib/macos/types";

export interface TelemetrySnapshot {
  cpu: number;
  memory: number;
  network: number;
  battery: number;
  uptime: number;
  disk: number;
}

/**
 * Get real macOS telemetry (server-side only)
 */
async function getMacOSSystemTelemetry(): Promise<MacOSSystemTelemetry | null> {
  if (typeof window !== "undefined") {
    return null;
  }

  try {
    const { getSystemTelemetry } = await import("@/lib/macos/telemetry");
    return getSystemTelemetry();
  } catch {
    return null;
  }
}

/**
 * Create a telemetry snapshot from real macOS data (server-side only).
 * Returns null on the client — consumers must handle this gracefully.
 */
export async function createTelemetrySnapshot(): Promise<TelemetrySnapshot | null> {
  if (typeof window !== "undefined") {
    return null;
  }

  try {
    const raw = await getMacOSSystemTelemetry();
    if (!raw) return null;
    return {
      cpu: raw.cpu?.percentUsed ?? 0,
      memory: raw.memory?.usedGB && raw.memory?.totalGB
        ? Number(((raw.memory.usedGB / raw.memory.totalGB) * 100).toFixed(1))
        : 0,
      network: raw.network?.bytesReceivedPerSecond
        ? Number((raw.network.bytesReceivedPerSecond / 1024 / 1024).toFixed(1))
        : 0,
      battery: raw.battery?.percentCharged ?? 0,
      uptime: raw.uptime?.uptimeSeconds ?? 0,
      disk: raw.disk?.percentUsed ?? 0,
    };
  } catch {
    return null;
  }
}

/**
 * Get the frontmost application name (server-side only).
 */
export async function getFrontmostAppName(): Promise<string | null> {
  if (typeof window !== "undefined") return null;
  try {
    const { getFrontmostApplication } = await import("@/lib/macos/applications");
    const result = getFrontmostApplication();
    return result.available && result.name ? result.name : null;
  } catch {
    return null;
  }
}

export { getMacOSSystemTelemetry };
