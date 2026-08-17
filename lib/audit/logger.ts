/**
 * Audit Logger for System Tools
 * Records tool usage, permissions, and execution results
 * Does NOT log sensitive data like API keys, passwords, or personal information
 */

interface AuditRecord {
  timestamp: number;
  iso: string;
  toolName: string;
  riskLevel: string;
  arguments: Record<string, unknown>;
  permissionResult: {
    allowed: boolean;
    reason?: string;
  };
  execution: {
    attempted: boolean;
    success: boolean;
    duration: number;
    error?: string;
  };
}

/**
 * In-memory audit log (in production, would write to persistent storage)
 */
const auditLog: AuditRecord[] = [];

/**
 * Maximum records to keep in memory
 */
const MAX_AUDIT_RECORDS = 1000;

/**
 * Log a tool execution
 */
export function logToolExecution(
  toolName: string,
  riskLevel: string,
  arguments_: Record<string, unknown>,
  permissionResult: { allowed: boolean; reason?: string },
  execution: { attempted: boolean; success: boolean; duration: number; error?: string },
): void {
  const record: AuditRecord = {
    timestamp: Date.now(),
    iso: new Date().toISOString(),
    toolName,
    riskLevel,
    arguments: sanitizeArguments(arguments_),
    permissionResult,
    execution,
  };

  auditLog.push(record);

  // Prevent unbounded memory growth
  if (auditLog.length > MAX_AUDIT_RECORDS) {
    auditLog.shift();
  }

  // Log to console in development
  if (process.env.NODE_ENV === "development") {
    console.log(`[AUDIT] ${toolName} (${riskLevel})`, {
      allowed: permissionResult.allowed,
      success: execution.success,
      duration: execution.duration,
    });
  }
}

/**
 * Sanitize arguments to prevent logging sensitive data
 * Removes/masks common sensitive fields
 */
function sanitizeArguments(args: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  const sensitiveFields = new Set([
    "password",
    "token",
    "secret",
    "apikey",
    "key",
    "credential",
    "passwd",
    "pwd",
  ]);

  for (const [key, value] of Object.entries(args)) {
    if (sensitiveFields.has(key.toLowerCase())) {
      sanitized[key] = "[REDACTED]";
    } else if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      sanitized[key] = sanitizeArguments(value as Record<string, unknown>);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Get all audit records (for admin/debug purposes)
 */
export function getAuditLog(): AuditRecord[] {
  return [...auditLog];
}

/**
 * Get audit records for a specific tool
 */
export function getAuditLogForTool(toolName: string): AuditRecord[] {
  return auditLog.filter((record) => record.toolName === toolName);
}

/**
 * Clear audit log
 */
export function clearAuditLog(): void {
  auditLog.length = 0;
}

/**
 * Get audit statistics
 */
export function getAuditStats(): {
  totalRecords: number;
  permissionsAllowed: number;
  permissionsDenied: number;
  executionSuccessful: number;
  executionFailed: number;
  byTool: Record<string, { allowed: number; denied: number; successful: number; failed: number }>;
} {
  const stats = {
    totalRecords: auditLog.length,
    permissionsAllowed: 0,
    permissionsDenied: 0,
    executionSuccessful: 0,
    executionFailed: 0,
    byTool: {} as Record<string, { allowed: number; denied: number; successful: number; failed: number }>,
  };

  for (const record of auditLog) {
    if (record.permissionResult.allowed) {
      stats.permissionsAllowed++;
    } else {
      stats.permissionsDenied++;
    }

    if (record.execution.attempted) {
      if (record.execution.success) {
        stats.executionSuccessful++;
      } else {
        stats.executionFailed++;
      }
    }

    if (!stats.byTool[record.toolName]) {
      stats.byTool[record.toolName] = {
        allowed: 0,
        denied: 0,
        successful: 0,
        failed: 0,
      };
    }

    if (record.permissionResult.allowed) {
      stats.byTool[record.toolName].allowed++;
    } else {
      stats.byTool[record.toolName].denied++;
    }

    if (record.execution.success) {
      stats.byTool[record.toolName].successful++;
    } else if (record.execution.attempted) {
      stats.byTool[record.toolName].failed++;
    }
  }

  return stats;
}
