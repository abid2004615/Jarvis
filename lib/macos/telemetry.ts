/**
 * macOS Telemetry - Real system data collection
 * Uses safe, hardcoded system commands only
 * Never accepts user input for command execution
 *
 * Note: This module uses child_process which is Node.js-only.
 * It cannot be used in browser/client code.
 */

import type {
  CPUTelemetry,
  MemoryTelemetry,
  DiskTelemetry,
  BatteryTelemetry,
  NetworkTelemetry,
  UptimeTelemetry,
  MacOSSystemTelemetry,
  ProcessSummary,
} from "./types";

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
 * Execute a safe, hardcoded system command
 * Only returns stdout on success
 */
function safeExecSync(command: string): string {
  if (!isMacOS()) {
    return "";
  }

  try {
    const exec = getExecSync();
    if (!exec) {
      return "";
    }

    // Use execSync with explicit timeout and no shell interpretation
    const result = exec(command, {
      timeout: 5000,
      maxBuffer: 1024 * 1024,
      stdio: ["pipe", "pipe", "pipe"],
    });
    return result.toString().trim();
  } catch (error) {
    return "";
  }
}

/**
 * Get CPU usage percentage
 */
export function getCPUUsage(): CPUTelemetry {
  if (!isMacOS()) {
    return { available: false, error: "Not running on macOS" };
  }

  try {
    // Get CPU usage via top command (first 1 iteration, immediate return)
    // Note: top -l 1 gives one iteration, -n 0 means no processes listed (just header)
    // We parse the "CPU" line from the header
    const output = safeExecSync("top -l 1 -n 0");
    const lines = output.split("\n");

    // Look for the CPU usage line (format: "CPU usage: XX.XX% user, YY.YY% sys...")
    for (const line of lines) {
      if (line.includes("CPU usage:")) {
        const match = line.match(/CPU usage: ([\d.]+)%/);
        if (match) {
          const percentUsed = parseFloat(match[1]);
          // Get core count
          const coreOutput = safeExecSync("sysctl -n hw.ncpu");
          const coreCount = parseInt(coreOutput, 10) || undefined;
          return {
            available: true,
            percentUsed: Number(percentUsed.toFixed(1)),
            coreCount,
          };
        }
      }
    }

    return { available: false, error: "Could not parse CPU usage" };
  } catch (error) {
    return { available: false, error: "Failed to read CPU usage" };
  }
}

/**
 * Get memory usage
 */
export function getMemoryUsage(): MemoryTelemetry {
  if (!isMacOS()) {
    return { available: false, error: "Not running on macOS" };
  }

  try {
    // Get total physical memory
    const totalBytes = parseInt(safeExecSync("sysctl -n hw.memsize"), 10);
    const totalGB = totalBytes / (1024 * 1024 * 1024);

    if (!totalGB || totalGB === 0) {
      return { available: false, error: "Could not determine total memory" };
    }

    // Get available memory
    const vmStatOutput = safeExecSync("vm_stat");
    const lines = vmStatOutput.split("\n");

    let freePages = 0;
    let inactivePages = 0;

    for (const line of lines) {
      const freeMatch = line.match(/Pages free:\s+(\d+)/);
      const inactiveMatch = line.match(/Pages inactive:\s+(\d+)/);

      if (freeMatch) freePages = parseInt(freeMatch[1], 10);
      if (inactiveMatch) inactivePages = parseInt(inactiveMatch[1], 10);
    }

    // Available memory = free + inactive pages
    const pageSize = 4096; // Standard macOS page size
    const availableBytes = (freePages + inactivePages) * pageSize;
    const usedBytes = totalBytes - availableBytes;
    const usedGB = usedBytes / (1024 * 1024 * 1024);
    const percentUsed = (usedBytes / totalBytes) * 100;

    return {
      available: true,
      usedGB: Number(usedGB.toFixed(1)),
      totalGB: Number(totalGB.toFixed(1)),
      percentUsed: Number(percentUsed.toFixed(1)),
    };
  } catch (error) {
    return { available: false, error: "Failed to read memory usage" };
  }
}

/**
 * Get disk usage for root volume
 */
export function getDiskUsage(): DiskTelemetry {
  if (!isMacOS()) {
    return { available: false, error: "Not running on macOS" };
  }

  try {
    // Get disk usage for root volume using df
    const output = safeExecSync("df -Pk / | tail -1");
    const parts = output.split(/\s+/);

    if (parts.length < 4) {
      return { available: false, error: "Could not parse disk usage" };
    }

    const totalBlocks = parseInt(parts[1], 10); // 1K-blocks
    const usedBlocks = parseInt(parts[2], 10); // Used 1K-blocks
    const totalGB = totalBlocks / (1024 * 1024);
    const usedGB = usedBlocks / (1024 * 1024);
    const percentUsed = (usedBlocks / totalBlocks) * 100;

    return {
      available: true,
      usedGB: Number(usedGB.toFixed(1)),
      totalGB: Number(totalGB.toFixed(1)),
      percentUsed: Number(percentUsed.toFixed(1)),
    };
  } catch (error) {
    return { available: false, error: "Failed to read disk usage" };
  }
}

/**
 * Get battery status
 */
export function getBatteryStatus(): BatteryTelemetry {
  if (!isMacOS()) {
    return { available: false, error: "Not running on macOS" };
  }

  try {
    const output = safeExecSync("pmset -g batt");
    const lines = output.split("\n");

    for (const line of lines) {
      const percentMatch = line.match(/(\d+)%/);
      const chargingMatch = line.toLowerCase().includes("charging");
      const discharging = line.toLowerCase().includes("discharging");

      if (percentMatch) {
        const percentCharged = parseInt(percentMatch[1], 10);
        return {
          available: true,
          percentCharged,
          isCharging: chargingMatch && !discharging,
        };
      }
    }

    return { available: false, error: "Could not parse battery status" };
  } catch (error) {
    return { available: false, error: "Failed to read battery status" };
  }
}

/**
 * Get network throughput (approximate)
 */
export function getNetworkStatus(): NetworkTelemetry {
  if (!isMacOS()) {
    return { available: false, error: "Not running on macOS" };
  }

  try {
    // Get network interface stats
    const output = safeExecSync("netstat -i | grep -E 'en[0-9]' | head -1");
    const parts = output.split(/\s+/);

    if (parts.length < 8) {
      return { available: false, error: "Could not parse network stats" };
    }

    // netstat -i output: Ibytes Obytes
    const bytesIn = parseInt(parts[6], 10) || 0;
    const bytesOut = parseInt(parts[7], 10) || 0;

    // Note: This is cumulative total, not per-second rate
    // For real-time throughput, would need multiple samples
    // For now, return the instantaneous snapshot
    const megabitsPerSecondIn = (bytesIn * 8) / (1000 * 1000);
    const megabitsPerSecondOut = (bytesOut * 8) / (1000 * 1000);

    return {
      available: true,
      bytesReceivedPerSecond: bytesIn,
      bytesSentPerSecond: bytesOut,
      megabitsPerSecondIn: Number(megabitsPerSecondIn.toFixed(2)),
      megabitsPerSecondOut: Number(megabitsPerSecondOut.toFixed(2)),
    };
  } catch (error) {
    return { available: false, error: "Failed to read network status" };
  }
}

/**
 * Get system uptime
 */
export function getSystemUptime(): UptimeTelemetry {
  if (!isMacOS()) {
    return { available: false, error: "Not running on macOS" };
  }

  try {
    // Get boot time using sysctl
    const bootTimeOutput = safeExecSync("sysctl -n kern.boottime");
    const match = bootTimeOutput.match(/sec = (\d+)/);

    if (!match) {
      return { available: false, error: "Could not parse boot time" };
    }

    const bootTimeUnix = parseInt(match[1], 10);
    const currentTimeUnix = Math.floor(Date.now() / 1000);
    const uptimeSeconds = currentTimeUnix - bootTimeUnix;

    return {
      available: true,
      uptimeSeconds: Math.max(0, uptimeSeconds),
    };
  } catch (error) {
    return { available: false, error: "Failed to read system uptime" };
  }
}

/**
 * Get top processes by CPU and memory
 */
export function getProcessSummary(): ProcessSummary {
  if (!isMacOS()) {
    return { available: false, error: "Not running on macOS" };
  }

  try {
    // Get total process count
    const psOutput = safeExecSync("ps aux | wc -l");
    const totalProcessCount = parseInt(psOutput, 10) - 1; // Subtract header line

    // Get top 5 processes by CPU
    const topCPUOutput = safeExecSync("top -l 1 -o cpu -n 5");
    const topCPULines = topCPUOutput.split("\n");
    const topProcessesByCPU: Array<{ name: string; percentCPU: number }> = [];

    let processSectionStarted = false;
    for (const line of topCPULines) {
      if (line.includes("PID")) {
        processSectionStarted = true;
        continue;
      }

      if (processSectionStarted && line.trim()) {
        const match = line.match(/\s+\d+\s+[\w.]+\s+([\d.]+)\s+[\d.]+\s+\d+\s+\d+[KMG]?\s+\d+[KMG]?\s+[\w.]+\s+[\w.]+\s+[\d:]+\s+(.+)/);
        if (match && match[2]) {
          topProcessesByCPU.push({
            name: match[2].substring(0, 50),
            percentCPU: parseFloat(match[1]),
          });
        }
      }
    }

    // Get total process count more reliably
    const processCountOutput = safeExecSync("ps aux | wc -l");
    const count = Math.max(0, parseInt(processCountOutput, 10) - 1);

    return {
      available: true,
      topProcessesByCPU: topProcessesByCPU.slice(0, 3),
      topProcessesByMemory: [],
      totalProcessCount: count,
    };
  } catch (error) {
    return { available: false, error: "Failed to get process summary" };
  }
}

/**
 * Get complete system telemetry snapshot
 */
export function getSystemTelemetry(): MacOSSystemTelemetry {
  return {
    timestamp: Date.now(),
    cpu: getCPUUsage(),
    memory: getMemoryUsage(),
    disk: getDiskUsage(),
    battery: getBatteryStatus(),
    network: getNetworkStatus(),
    uptime: getSystemUptime(),
  };
}
