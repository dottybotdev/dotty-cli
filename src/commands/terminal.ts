/**
 * Terminal command execution
 * Handles safe and full terminal access based on capabilities
 */

import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import { loadConfig } from '../config';
import { SAFE_COMMANDS, isSafeCommand } from '../protocol';

const execAsync = promisify(exec);

// ============================================
// TYPES
// ============================================

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
  truncated?: boolean;
}

export interface ExecOptions {
  cwd?: string;
  timeout?: number;      // ms
  maxOutput?: number;    // max characters
  env?: Record<string, string>;
}

// ============================================
// CONSTANTS
// ============================================

const DEFAULT_TIMEOUT = 30000;      // 30 seconds
const DEFAULT_MAX_OUTPUT = 100000;  // 100KB

// Commands that are always blocked (dangerous)
const BLOCKED_PATTERNS = [
  /^rm\s+(-rf?|--recursive).*\//,  // rm -rf /
  /^sudo\s/,                        // sudo anything
  /^chmod\s.*777/,                  // chmod 777
  /^mkfs\./,                        // format disk
  /^dd\s.*of=\/dev/,               // dd to device
  />\s*\/dev\/sd/,                  // write to raw device
  /^:(){ :|:& };:/,                 // fork bomb
];

// ============================================
// EXECUTION
// ============================================

/**
 * Execute a safe command (pre-approved list only)
 */
export async function execSafe(command: string, options: ExecOptions = {}): Promise<ExecResult> {
  if (!isSafeCommand(command)) {
    throw new Error(`Command not in safe list: ${command}`);
  }

  return execCommand(command, options);
}

/**
 * Execute any command (requires 'terminal' capability)
 */
export async function execFull(command: string, options: ExecOptions = {}): Promise<ExecResult> {
  const config = loadConfig();

  if (!config.capabilities.includes('terminal')) {
    throw new Error('Terminal capability not enabled. Run: dotty config --enable-terminal');
  }

  // Check for blocked patterns
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(command)) {
      throw new Error(`Command blocked for safety: ${command}`);
    }
  }

  return execCommand(command, options);
}

/**
 * Internal command execution
 */
async function execCommand(command: string, options: ExecOptions = {}): Promise<ExecResult> {
  const {
    cwd = process.cwd(),
    timeout = DEFAULT_TIMEOUT,
    maxOutput = DEFAULT_MAX_OUTPUT,
    env,
  } = options;

  const startTime = Date.now();

  return new Promise((resolve, reject) => {
    const child = spawn('sh', ['-c', command], {
      cwd,
      env: { ...process.env, ...env },
      timeout,
    });

    let stdout = '';
    let stderr = '';
    let truncated = false;

    child.stdout.on('data', (data) => {
      const chunk = data.toString();
      if (stdout.length + chunk.length <= maxOutput) {
        stdout += chunk;
      } else {
        stdout += chunk.slice(0, maxOutput - stdout.length);
        truncated = true;
      }
    });

    child.stderr.on('data', (data) => {
      const chunk = data.toString();
      if (stderr.length + chunk.length <= maxOutput) {
        stderr += chunk;
      } else {
        stderr += chunk.slice(0, maxOutput - stderr.length);
        truncated = true;
      }
    });

    child.on('error', (error) => {
      reject(error);
    });

    child.on('close', (exitCode) => {
      resolve({
        stdout,
        stderr,
        exitCode: exitCode ?? 0,
        durationMs: Date.now() - startTime,
        truncated: truncated || undefined,
      });
    });

    // Handle timeout
    setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`Command timed out after ${timeout}ms`));
    }, timeout);
  });
}

/**
 * Get system information
 */
export async function getSystemInfo(): Promise<Record<string, unknown>> {
  const results = await Promise.allSettled([
    execAsync('hostname'),
    execAsync('uname -a'),
    execAsync('uptime'),
    execAsync('whoami'),
    execAsync('pwd'),
  ]);

  const [hostname, uname, uptime, whoami, pwd] = results.map(r =>
    r.status === 'fulfilled' ? r.value.stdout.trim() : null
  );

  return {
    hostname,
    uname,
    uptime,
    user: whoami,
    cwd: pwd,
    platform: process.platform,
    nodeVersion: process.version,
    pid: process.pid,
  };
}

/**
 * Get resource usage
 */
export async function getResourceUsage(): Promise<Record<string, unknown>> {
  const results = await Promise.allSettled([
    execAsync('df -h /'),
    execAsync('free -h 2>/dev/null || vm_stat 2>/dev/null'),  // Linux or macOS
    execAsync('uptime'),
  ]);

  return {
    disk: results[0].status === 'fulfilled' ? results[0].value.stdout : null,
    memory: results[1].status === 'fulfilled' ? results[1].value.stdout : null,
    load: results[2].status === 'fulfilled' ? results[2].value.stdout : null,
    processMemory: process.memoryUsage(),
  };
}

// ============================================
// COMMAND HANDLERS
// ============================================

export const terminalCommands = {
  exec_safe: async (args: { command: string; cwd?: string; timeout?: number }) => {
    const result = await execSafe(args.command, {
      cwd: args.cwd,
      timeout: args.timeout,
    });
    return result;
  },

  exec: async (args: { command: string; cwd?: string; timeout?: number }) => {
    const result = await execFull(args.command, {
      cwd: args.cwd,
      timeout: args.timeout,
    });
    return result;
  },

  get_system_info: async () => {
    return getSystemInfo();
  },

  get_resource_usage: async () => {
    return getResourceUsage();
  },

  list_safe_commands: async () => {
    return { commands: SAFE_COMMANDS };
  },
};
