/**
 * Local configuration management
 *
 * ~/.dotty/ structure:
 *   config.json  - Machine-specific settings (token, capabilities, BYOK)
 *   logs/        - Local session logs
 *   rules/       - Custom agent behavior rules
 *   cache/       - Temporary data
 *
 * Server-side (synced from dashboard):
 *   - Account settings (email, phone)
 *   - Notification preferences
 *   - Subscription/billing
 */

import { homedir, hostname, platform } from 'os';
import { join } from 'path';
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'fs';
import { randomBytes } from 'crypto';
import type { AgentCapability } from './protocol';

// ============================================
// TYPES
// ============================================

export interface AgentConfig {
  // Auth (local credential)
  token?: string;

  // Machine identification (local)
  machineId: string;
  machineLabel?: string;

  // Capabilities (local - what this machine can do)
  capabilities: AgentCapability[];

  // Connection (local)
  apiUrl: string;
  autoStart: boolean;
  logLevel: 'debug' | 'info' | 'warn' | 'error';

  // BYOK mode (local - privacy sensitive)
  byokMode: boolean;
  elevenLabsKey?: string;

  // Cached from server (read-only, updated on auth/sync)
  _cached?: {
    email?: string;
    phone?: string;
    tier?: string;
    twilioNumber?: string;
  };
}

const DEFAULT_CONFIG: AgentConfig = {
  apiUrl: 'wss://api.dotty.bot/agent',
  machineId: '',  // Generated on first run
  capabilities: ['claude_sessions', 'tmux'],  // Safe defaults
  autoStart: false,
  logLevel: 'info',
  byokMode: false,
};

// ============================================
// DIRECTORY PATHS
// ============================================

const CONFIG_DIR = join(homedir(), '.dotty');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');
const LOGS_DIR = join(CONFIG_DIR, 'logs');
const RULES_DIR = join(CONFIG_DIR, 'rules');
const CACHE_DIR = join(CONFIG_DIR, 'cache');

// ============================================
// DIRECTORY MANAGEMENT
// ============================================

function ensureDir(dir: string, mode = 0o700): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true, mode });
  }
}

function ensureConfigDir(): void {
  ensureDir(CONFIG_DIR);
}

/**
 * Ensure all dotty directories exist
 * Called on startup to create the full structure
 */
export function ensureDottyDirs(): void {
  ensureDir(CONFIG_DIR);
  ensureDir(LOGS_DIR);
  ensureDir(RULES_DIR);
  ensureDir(CACHE_DIR);
}

// ============================================
// PATH GETTERS
// ============================================

export function getConfigDir(): string {
  return CONFIG_DIR;
}

export function getConfigPath(): string {
  return CONFIG_FILE;
}

export function getLogsDir(): string {
  ensureDir(LOGS_DIR);
  return LOGS_DIR;
}

export function getRulesDir(): string {
  ensureDir(RULES_DIR);
  return RULES_DIR;
}

export function getCacheDir(): string {
  ensureDir(CACHE_DIR);
  return CACHE_DIR;
}

// ============================================
// MACHINE ID
// ============================================

function generateMachineId(): string {
  // Combine hostname with random bytes for uniqueness
  const hostPart = hostname().slice(0, 8).toLowerCase().replace(/[^a-z0-9]/g, '');
  const randomPart = randomBytes(4).toString('hex');
  return `${hostPart}-${randomPart}`;
}

// ============================================
// CONFIG LOAD/SAVE
// ============================================

export function loadConfig(): AgentConfig {
  ensureConfigDir();

  if (!existsSync(CONFIG_FILE)) {
    // Create default config with generated machine ID
    const config = {
      ...DEFAULT_CONFIG,
      machineId: generateMachineId(),
    };
    saveConfig(config);
    return config;
  }

  try {
    const raw = readFileSync(CONFIG_FILE, 'utf-8');
    const loaded = JSON.parse(raw) as Partial<AgentConfig>;
    return { ...DEFAULT_CONFIG, ...loaded };
  } catch (error) {
    console.error('Failed to load config, using defaults:', error);
    return { ...DEFAULT_CONFIG, machineId: generateMachineId() };
  }
}

export function saveConfig(config: AgentConfig): void {
  ensureConfigDir();
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), { mode: 0o600 });
}

/**
 * Update cached server data (email, phone, tier)
 * Called after authentication or sync
 */
export function updateCachedServerData(data: {
  email?: string;
  phone?: string;
  tier?: string;
  twilioNumber?: string;
}): void {
  const config = loadConfig();
  config._cached = {
    ...config._cached,
    ...data,
  };
  saveConfig(config);
}

/**
 * Get cached email (read-only, from server)
 */
export function getCachedEmail(): string | undefined {
  const config = loadConfig();
  return config._cached?.email;
}

/**
 * Get cached tier (read-only, from server)
 */
export function getCachedTier(): string | undefined {
  const config = loadConfig();
  return config._cached?.tier;
}

/**
 * Clear auth and cached data (logout)
 */
export function clearAuth(): void {
  const config = loadConfig();
  delete config.token;
  delete config._cached;
  saveConfig(config);
}

// ============================================
// MACHINE SETTINGS
// ============================================

export function setMachineLabel(label: string): void {
  const config = loadConfig();
  config.machineLabel = label;
  saveConfig(config);
}

export function getMachineInfo(): { machineId: string; machineLabel?: string; platform: string } {
  const config = loadConfig();
  return {
    machineId: config.machineId,
    machineLabel: config.machineLabel,
    platform: getPlatform(),
  };
}

// ============================================
// CAPABILITIES
// ============================================

export function setCapabilities(capabilities: AgentCapability[]): void {
  const config = loadConfig();
  config.capabilities = capabilities;
  saveConfig(config);
}

export function enableCapability(cap: AgentCapability): void {
  const config = loadConfig();
  if (!config.capabilities.includes(cap)) {
    config.capabilities.push(cap);
    saveConfig(config);
  }
}

export function disableCapability(cap: AgentCapability): void {
  const config = loadConfig();
  config.capabilities = config.capabilities.filter(c => c !== cap);
  saveConfig(config);
}

// ============================================
// BYOK MODE
// ============================================

export function setByokMode(enabled: boolean): void {
  const config = loadConfig();
  config.byokMode = enabled;
  saveConfig(config);
}

export function setElevenLabsKey(key: string | undefined): void {
  const config = loadConfig();
  config.elevenLabsKey = key;
  if (key) {
    // Auto-enable BYOK mode when key is set
    config.byokMode = true;
  }
  saveConfig(config);
}

export function isByokMode(): boolean {
  const config = loadConfig();
  return config.byokMode && !!config.elevenLabsKey;
}

// ============================================
// LOGGING
// ============================================

/**
 * Get log file path for today
 */
export function getLogFilePath(): string {
  const today = new Date().toISOString().split('T')[0];
  return join(getLogsDir(), `${today}.log`);
}

/**
 * Append to local log file
 */
export function appendLog(level: string, message: string, meta?: Record<string, unknown>): void {
  const timestamp = new Date().toISOString();
  const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
  const line = `[${timestamp}] ${level.toUpperCase()}: ${message}${metaStr}\n`;

  try {
    appendFileSync(getLogFilePath(), line);
  } catch {
    // Silently fail if can't write log
  }
}

// ============================================
// PLATFORM
// ============================================

export function getPlatform(): 'darwin' | 'linux' | 'win32' {
  const p = platform();
  if (p === 'darwin' || p === 'linux' || p === 'win32') {
    return p;
  }
  return 'linux';  // Default for other Unix-like systems
}
