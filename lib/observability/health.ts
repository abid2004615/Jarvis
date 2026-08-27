/**
 * P14 — Health System
 *
 * Monitors subsystem health for diagnostics.
 * All checks are read-only and never expose secrets.
 */

import type { HealthStatus, SystemHealth } from "./types";

const subsystemStatuses: Map<string, HealthStatus> = new Map();
let startupTime: number = Date.now();

/**
 * Record health status for a subsystem.
 */
export function setSubsystemHealth(
  subsystem: string,
  status: HealthStatus["status"],
  message?: string,
  details?: Record<string, unknown>,
): void {
  subsystemStatuses.set(subsystem, {
    subsystem,
    status,
    lastChecked: Date.now(),
    message,
    details,
  });
}

/**
 * Get health status for a specific subsystem.
 */
export function getSubsystemHealth(subsystem: string): HealthStatus | null {
  return subsystemStatuses.get(subsystem) || null;
}

/**
 * Get health status for all subsystems.
 */
export function getAllSubsystemHealth(): HealthStatus[] {
  return [...subsystemStatuses.values()];
}

/**
 * Get overall system health.
 */
export function getSystemHealth(): SystemHealth {
  const subsystems = getAllSubsystemHealth();
  let overall: SystemHealth["overall"] = "healthy";

  for (const sub of subsystems) {
    if (sub.status === "unavailable" || sub.status === "misconfigured") {
      overall = "unavailable";
      break;
    }
    if (sub.status === "degraded") {
      overall = "degraded";
    }
  }

  return {
    overall,
    uptime: Date.now() - startupTime,
    subsystems,
    checkedAt: Date.now(),
  };
}

/**
 * Reset startup time (for testing).
 */
export function resetStartupTime(): void {
  startupTime = Date.now();
}

/**
 * Clear all subsystem statuses (for testing).
 */
export function clearSubsystemHealth(): void {
  subsystemStatuses.clear();
}

/**
 * Check common subsystem health.
 * This performs non-destructive read-only checks.
 */
export function performHealthChecks(): SystemHealth {
  // AI provider
  try {
    // Support both provider-specific keys and the unified AI_API_KEY
    const apiKey = process.env.AI_API_KEY
      || (process.env.AI_PROVIDER === "groq" ? process.env.GROQ_API_KEY : undefined)
      || (process.env.AI_PROVIDER === "openai" ? process.env.OPENAI_API_KEY : undefined)
      || (process.env.AI_PROVIDER === "xai" ? process.env.XAI_API_KEY : undefined);

    if (apiKey) {
      setSubsystemHealth("ai_provider", "healthy", "Configured");
    } else {
      setSubsystemHealth("ai_provider", "misconfigured", "API key not set");
    }
  } catch {
    setSubsystemHealth("ai_provider", "unavailable", "Check failed");
  }

  // Storage
  try {
    const fs = require("fs");
    const path = require("path");
    const storageDir = path.join(process.cwd(), ".jarvis");
    if (fs.existsSync(storageDir)) {
      setSubsystemHealth("storage", "healthy", "Storage directory exists");
    } else {
      setSubsystemHealth("storage", "degraded", "Storage directory not yet created");
    }
  } catch {
    setSubsystemHealth("storage", "unavailable", "Storage check failed");
  }

  return getSystemHealth();
}

/**
 * Reset all health state (for testing).
 */
export function resetHealthSystem(): void {
  clearSubsystemHealth();
  resetStartupTime();
}
