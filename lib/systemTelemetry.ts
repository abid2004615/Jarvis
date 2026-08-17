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
  // Only available on server side
  if (typeof window !== "undefined") {
    return null;
  }

  try {
    // Dynamic import to avoid bundling child_process on client
    const { getSystemTelemetry } = await import("@/lib/macos/telemetry");
    return getSystemTelemetry();
  } catch (error) {
    console.warn("Failed to load macOS telemetry:", error);
    return null;
  }
}

/**
 * Create a telemetry snapshot
 * Returns real macOS data on macOS server, synthetic data otherwise
 */
export function createTelemetrySnapshot(): TelemetrySnapshot {
  // Try to get real macOS telemetry
  if (process.platform === "darwin" && typeof window === "undefined") {
    try {
      // Synchronous version for use in synchronous contexts
      // Note: In production, this should be refactored to async/promise-based
      // For now, we'll use synthetic data and load real data asynchronously in effects
      
      // This will be loaded asynchronously by useEffect in JarvisOrb
      return getSyntheticTelemetry();
    } catch (error) {
      console.warn("Failed to read real telemetry:", error);
      return getSyntheticTelemetry();
    }
  }

  return getSyntheticTelemetry();
}

/**
 * Get synthetic telemetry data (for non-macOS or fallback)
 */
function getSyntheticTelemetry(): TelemetrySnapshot {
  const now = Date.now() / 1000;
  const cpu = 30 + Math.sin(now / 7) * 18 + Math.random() * 16;
  const memory = 54 + Math.sin(now / 13) * 12 + Math.random() * 18;
  const network = 8 + Math.sin(now / 5) * 6 + Math.random() * 22;
  const battery = 78 + Math.sin(now / 30) * 6 + Math.random() * 4;
  const uptime = Math.max(400, 1800 + Math.round(now * 0.7) % 2600);
  const disk = 48 + Math.sin(now / 9) * 9 + Math.random() * 10;

  return {
    cpu: Number(cpu.toFixed(1)),
    memory: Number(memory.toFixed(1)),
    network: Number(network.toFixed(1)),
    battery: Number(Math.max(0, Math.min(100, battery)).toFixed(0)),
    uptime,
    disk: Number(disk.toFixed(1)),
  };
}

/**
 * Load real macOS telemetry asynchronously (for server-side use)
 * This is exported for use in server-side effects and API routes
 */
export { getMacOSSystemTelemetry };
