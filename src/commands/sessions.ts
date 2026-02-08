/**
 * Claude Code session management commands
 * Discovers and manages running Claude Code sessions
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const execAsync = promisify(exec);

// ============================================
// TYPES
// ============================================

export interface ClaudeSession {
  pid: number;
  sessionId?: string;
  project?: string;
  cwd?: string;
  startedAt?: Date;
  cpuPercent?: number;
  memPercent?: number;
  tmuxSession?: string;
  tmuxWindow?: string;
}

// ============================================
// SESSION DISCOVERY
// ============================================

/**
 * List all running Claude Code sessions
 */
export async function listClaudeSessions(): Promise<ClaudeSession[]> {
  const sessions: ClaudeSession[] = [];

  try {
    // Find Claude Code processes
    const { stdout } = await execAsync(
      'ps aux | grep -E "[c]laude|[c]ode.*claude" | grep -v grep',
      { timeout: 5000 }
    );

    const lines = stdout.trim().split('\n').filter(Boolean);

    for (const line of lines) {
      const parts = line.split(/\s+/);
      if (parts.length < 11) continue;

      const pid = parseInt(parts[1], 10);
      const cpuPercent = parseFloat(parts[2]);
      const memPercent = parseFloat(parts[3]);
      const command = parts.slice(10).join(' ');

      // Skip if not a Claude Code process
      if (!command.includes('claude')) continue;

      const session: ClaudeSession = {
        pid,
        cpuPercent,
        memPercent,
      };

      // Try to get more details
      try {
        const cwd = await getProcessCwd(pid);
        session.cwd = cwd;
        session.project = cwd?.split('/').pop();

        // Check if running in tmux
        const tmuxInfo = await getTmuxInfo(pid);
        if (tmuxInfo) {
          session.tmuxSession = tmuxInfo.session;
          session.tmuxWindow = tmuxInfo.window;
        }
      } catch {
        // Ignore errors getting details
      }

      sessions.push(session);
    }
  } catch (error) {
    // No Claude sessions found or ps failed
    if ((error as NodeJS.ErrnoException).code !== 1) {
      console.error('Error listing sessions:', error);
    }
  }

  return sessions;
}

/**
 * Get details about a specific session
 */
export async function getSessionDetails(pid: number): Promise<ClaudeSession | null> {
  const sessions = await listClaudeSessions();
  return sessions.find(s => s.pid === pid) || null;
}

/**
 * Kill a Claude Code session
 */
export async function killSession(pid: number): Promise<boolean> {
  try {
    // First try graceful termination
    process.kill(pid, 'SIGTERM');

    // Wait a bit
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Check if still running
    try {
      process.kill(pid, 0);  // Just check, doesn't actually kill
      // Still running, force kill
      process.kill(pid, 'SIGKILL');
    } catch {
      // Process already gone, good
    }

    return true;
  } catch (error) {
    console.error('Failed to kill session:', error);
    return false;
  }
}

/**
 * Start a new Claude Code session
 */
export async function startSession(options: {
  cwd?: string;
  task?: string;
  tmuxSession?: string;
}): Promise<{ pid?: number; error?: string }> {
  const { cwd = process.cwd(), task, tmuxSession } = options;

  try {
    let command = 'claude';
    if (task) {
      command += ` "${task.replace(/"/g, '\\"')}"`;
    }

    if (tmuxSession) {
      // Start in a new tmux window
      const tmuxCmd = `tmux new-window -t ${tmuxSession} -n claude '${command}'`;
      await execAsync(tmuxCmd, { cwd });
      return { pid: undefined };  // Can't easily get PID from tmux
    } else {
      // Start detached
      const { stdout } = await execAsync(`nohup ${command} > /dev/null 2>&1 & echo $!`, { cwd });
      const pid = parseInt(stdout.trim(), 10);
      return { pid };
    }
  } catch (error) {
    return { error: (error as Error).message };
  }
}

// ============================================
// HELPERS
// ============================================

async function getProcessCwd(pid: number): Promise<string | undefined> {
  try {
    // Linux
    const linkPath = `/proc/${pid}/cwd`;
    if (existsSync(linkPath)) {
      const { stdout } = await execAsync(`readlink ${linkPath}`);
      return stdout.trim();
    }

    // macOS
    const { stdout } = await execAsync(`lsof -p ${pid} | grep cwd | awk '{print $9}'`);
    return stdout.trim() || undefined;
  } catch {
    return undefined;
  }
}

async function getTmuxInfo(pid: number): Promise<{ session: string; window: string } | null> {
  try {
    // Check if process is running inside tmux
    const { stdout } = await execAsync(
      `tmux list-panes -a -F "#{pane_pid} #{session_name} #{window_name}" | grep "^${pid} "`
    );

    const parts = stdout.trim().split(' ');
    if (parts.length >= 3) {
      return {
        session: parts[1],
        window: parts[2],
      };
    }
  } catch {
    // Not in tmux or tmux not available
  }

  return null;
}

// ============================================
// COMMAND HANDLERS
// ============================================

export const sessionCommands = {
  list_claude_sessions: async () => {
    const sessions = await listClaudeSessions();
    return { sessions, count: sessions.length };
  },

  get_session_details: async (args: { pid: number }) => {
    const session = await getSessionDetails(args.pid);
    if (!session) {
      throw new Error(`Session with PID ${args.pid} not found`);
    }
    return session;
  },

  kill_session: async (args: { pid: number }) => {
    const success = await killSession(args.pid);
    if (!success) {
      throw new Error(`Failed to kill session ${args.pid}`);
    }
    return { success: true, pid: args.pid };
  },

  start_session: async (args: { cwd?: string; task?: string; tmuxSession?: string }) => {
    const result = await startSession(args);
    if (result.error) {
      throw new Error(result.error);
    }
    return { success: true, pid: result.pid };
  },
};
