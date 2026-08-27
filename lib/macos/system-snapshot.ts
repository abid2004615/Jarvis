/**
 * macOS System Intelligence
 * Unified SystemSnapshot combining all available telemetry
 * into a single bounded data structure.
 *
 * Uses real values only — never fabricates unavailable data.
 */

import { getCPUUsage, getMemoryUsage, getDiskUsage, getBatteryStatus, getNetworkStatus, getSystemUptime, getProcessSummary } from "./telemetry";
import { getFrontmostApplication, getRunningApplications } from "./applications";
import { getActiveWindow } from "./window";

import type { MacOSSystemTelemetry } from "./types";

export interface SystemSnapshot {
  timestamp: string;
  cpu: {
    available: boolean;
    percentUsed?: number;
    coreCount?: number;
  };
  memory: {
    available: boolean;
    usedGB?: number;
    totalGB?: number;
    percentUsed?: number;
  };
  disk: {
    available: boolean;
    usedGB?: number;
    totalGB?: number;
    percentUsed?: number;
  };
  battery: {
    available: boolean;
    percentCharged?: number;
    isCharging?: boolean;
  };
  network: {
    available: boolean;
    megabitsPerSecondIn?: number;
    megabitsPerSecondOut?: number;
  };
  uptime: {
    available: boolean;
    uptimeSeconds?: number;
  };
  frontmostApplication: {
    available: boolean;
    name?: string;
    bundleId?: string;
  };
  activeWindow: {
    available: boolean;
    title?: string;
  };
  runningApplications: {
    available: boolean;
    count: number;
    names: string[];
  };
  processSummary: {
    available: boolean;
    totalProcessCount?: number;
    topByCPU?: Array<{ name: string; percentCPU: number }>;
  };
}

/**
 * Collect a complete system snapshot.
 * All data is real — unavailable values are omitted (not fabricated).
 */
export function getSystemSnapshot(): SystemSnapshot {
  const cpu = getCPUUsage();
  const memory = getMemoryUsage();
  const disk = getDiskUsage();
  const battery = getBatteryStatus();
  const network = getNetworkStatus();
  const uptime = getSystemUptime();
  const frontmost = getFrontmostApplication();
  const activeWindow = getActiveWindow();
  const running = getRunningApplications();
  const processes = getProcessSummary();

  return {
    timestamp: new Date().toISOString(),
    cpu: {
      available: cpu.available,
      ...(cpu.available ? { percentUsed: cpu.percentUsed, coreCount: cpu.coreCount } : {}),
    },
    memory: {
      available: memory.available,
      ...(memory.available ? { usedGB: memory.usedGB, totalGB: memory.totalGB, percentUsed: memory.percentUsed } : {}),
    },
    disk: {
      available: disk.available,
      ...(disk.available ? { usedGB: disk.usedGB, totalGB: disk.totalGB, percentUsed: disk.percentUsed } : {}),
    },
    battery: {
      available: battery.available,
      ...(battery.available ? { percentCharged: battery.percentCharged, isCharging: battery.isCharging } : {}),
    },
    network: {
      available: network.available,
      ...(network.available ? { megabitsPerSecondIn: network.megabitsPerSecondIn, megabitsPerSecondOut: network.megabitsPerSecondOut } : {}),
    },
    uptime: {
      available: uptime.available,
      ...(uptime.available ? { uptimeSeconds: uptime.uptimeSeconds } : {}),
    },
    frontmostApplication: {
      available: frontmost.available,
      ...(frontmost.available ? { name: frontmost.name, bundleId: frontmost.bundleId } : {}),
    },
    activeWindow: {
      available: activeWindow.available,
      ...(activeWindow.available ? { title: activeWindow.title } : {}),
    },
    runningApplications: {
      available: running.available,
      count: running.applications.length,
      names: running.applications.map((a) => a.name),
    },
    processSummary: {
      available: processes.available,
      ...(processes.available ? {
        totalProcessCount: processes.totalProcessCount,
        topByCPU: processes.topProcessesByCPU,
      } : {}),
    },
  };
}
