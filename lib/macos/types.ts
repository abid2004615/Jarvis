/**
 * macOS System Integration Types
 * Type definitions for macOS operations and telemetry
 */

/**
 * Result of a macOS telemetry read
 */
export interface TelemetryResult {
  available: boolean;
  value?: number;
  unit?: string;
  error?: string;
  timestamp: number;
}

/**
 * CPU telemetry data
 */
export interface CPUTelemetry {
  available: boolean;
  percentUsed?: number;
  coreCount?: number;
  error?: string;
}

/**
 * Memory telemetry data
 */
export interface MemoryTelemetry {
  available: boolean;
  usedGB?: number;
  totalGB?: number;
  percentUsed?: number;
  error?: string;
}

/**
 * Disk telemetry data
 */
export interface DiskTelemetry {
  available: boolean;
  usedGB?: number;
  totalGB?: number;
  percentUsed?: number;
  error?: string;
}

/**
 * Battery telemetry data
 */
export interface BatteryTelemetry {
  available: boolean;
  percentCharged?: number;
  isCharging?: boolean;
  error?: string;
}

/**
 * Network telemetry data
 */
export interface NetworkTelemetry {
  available: boolean;
  bytesReceivedPerSecond?: number;
  bytesSentPerSecond?: number;
  megabitsPerSecondIn?: number;
  megabitsPerSecondOut?: number;
  error?: string;
}

/**
 * System uptime data
 */
export interface UptimeTelemetry {
  available: boolean;
  uptimeSeconds?: number;
  error?: string;
}

/**
 * Process summary data
 */
export interface ProcessSummary {
  available: boolean;
  topProcessesByCPU?: Array<{
    name: string;
    percentCPU: number;
  }>;
  topProcessesByMemory?: Array<{
    name: string;
    memoryMB: number;
  }>;
  totalProcessCount?: number;
  error?: string;
}

/**
 * Complete system telemetry snapshot
 */
export interface MacOSSystemTelemetry {
  timestamp: number;
  cpu: CPUTelemetry;
  memory: MemoryTelemetry;
  disk: DiskTelemetry;
  battery: BatteryTelemetry;
  network: NetworkTelemetry;
  uptime: UptimeTelemetry;
}

/**
 * Application launch result
 */
export interface AppLaunchResult {
  success: boolean;
  application: string;
  message: string;
  pid?: number;
}

/**
 * Application definition
 */
export interface ApplicationDefinition {
  name: string;
  bundleId?: string;
  path?: string;
  description: string;
  allowedRiskLevel: "safe" | "confirmation" | "restricted";
}

/**
 * System output volume status
 */
export interface VolumeStatus {
  available: boolean;
  volumePercent?: number;
  muted?: boolean;
  error?: string;
  timestamp: number;
}

/**
 * Screen brightness status
 */
export interface BrightnessStatus {
  available: boolean;
  brightnessPercent?: number;
  error?: string;
  timestamp: number;
}

/**
 * Application quit result
 */
export interface AppQuitResult {
  success: boolean;
  application: string;
  message: string;
}

/**
 * Folder open result
 */
export interface FolderOpenResult {
  success: boolean;
  folder: string;
  message: string;
  path?: string;
}

/**
 * Screenshot capture result
 */
export interface ScreenshotResult {
  success: boolean;
  message: string;
  path?: string;
  error?: string;
}

/**
 * Frontmost application result
 */
export interface FrontmostAppResult {
  available: boolean;
  name?: string;
  bundleId?: string;
  pid?: number;
  error?: string;
}

/**
 * A single running GUI application
 */
export interface RunningApplicationInfo {
  name: string;
}

/**
 * Running applications result
 */
export interface RunningApplicationsResult {
  available: boolean;
  applications: RunningApplicationInfo[];
  error?: string;
}

/**
 * Active window result
 */
export interface ActiveWindowResult {
  available: boolean;
  title?: string;
  error?: string;
}
