/**
 * Tmux session management commands
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// ============================================
// TYPES
// ============================================

export interface TmuxSession {
  name: string;
  windows: number;
  created: Date;
  attached: boolean;
  currentWindow?: string;
}

export interface TmuxWindow {
  index: number;
  name: string;
  active: boolean;
  panes: number;
}

export interface TmuxPane {
  index: number;
  active: boolean;
  pid: number;
  currentCommand?: string;
  width: number;
  height: number;
}

// ============================================
// TMUX FUNCTIONS
// ============================================

/**
 * Check if tmux is available
 */
export async function isTmuxAvailable(): Promise<boolean> {
  try {
    await execAsync('which tmux');
    return true;
  } catch {
    return false;
  }
}

/**
 * List all tmux sessions
 */
export async function listTmuxSessions(): Promise<TmuxSession[]> {
  try {
    const { stdout } = await execAsync(
      'tmux list-sessions -F "#{session_name}|#{session_windows}|#{session_created}|#{session_attached}"'
    );

    return stdout.trim().split('\n').filter(Boolean).map(line => {
      const [name, windows, created, attached] = line.split('|');
      return {
        name,
        windows: parseInt(windows, 10),
        created: new Date(parseInt(created, 10) * 1000),
        attached: attached === '1',
      };
    });
  } catch (error) {
    // No tmux server running
    if ((error as Error).message.includes('no server running')) {
      return [];
    }
    throw error;
  }
}

/**
 * List windows in a session
 */
export async function listTmuxWindows(sessionName: string): Promise<TmuxWindow[]> {
  const { stdout } = await execAsync(
    `tmux list-windows -t "${sessionName}" -F "#{window_index}|#{window_name}|#{window_active}|#{window_panes}"`
  );

  return stdout.trim().split('\n').filter(Boolean).map(line => {
    const [index, name, active, panes] = line.split('|');
    return {
      index: parseInt(index, 10),
      name,
      active: active === '1',
      panes: parseInt(panes, 10),
    };
  });
}

/**
 * List panes in a window
 */
export async function listTmuxPanes(sessionName: string, windowIndex: number): Promise<TmuxPane[]> {
  const { stdout } = await execAsync(
    `tmux list-panes -t "${sessionName}:${windowIndex}" -F "#{pane_index}|#{pane_active}|#{pane_pid}|#{pane_current_command}|#{pane_width}|#{pane_height}"`
  );

  return stdout.trim().split('\n').filter(Boolean).map(line => {
    const [index, active, pid, command, width, height] = line.split('|');
    return {
      index: parseInt(index, 10),
      active: active === '1',
      pid: parseInt(pid, 10),
      currentCommand: command,
      width: parseInt(width, 10),
      height: parseInt(height, 10),
    };
  });
}

/**
 * Send keys to a tmux pane
 */
export async function sendKeys(
  target: string,  // "session:window.pane" or just "session"
  keys: string,
  options: { literal?: boolean; enter?: boolean } = {}
): Promise<void> {
  const { literal = false, enter = true } = options;

  let cmd = `tmux send-keys -t "${target}"`;
  if (literal) {
    cmd += ' -l';
  }
  cmd += ` "${keys.replace(/"/g, '\\"')}"`;

  if (enter) {
    cmd += ' Enter';
  }

  await execAsync(cmd);
}

/**
 * Capture pane content
 */
export async function capturePane(
  target: string,
  options: { lines?: number; start?: number; end?: number } = {}
): Promise<string> {
  const { lines = 100, start, end } = options;

  let cmd = `tmux capture-pane -t "${target}" -p`;

  if (start !== undefined) {
    cmd += ` -S ${start}`;
  } else {
    cmd += ` -S -${lines}`;
  }

  if (end !== undefined) {
    cmd += ` -E ${end}`;
  }

  const { stdout } = await execAsync(cmd);
  return stdout;
}

/**
 * Create a new tmux session
 */
export async function createSession(
  name: string,
  options: { window?: string; command?: string; cwd?: string } = {}
): Promise<void> {
  const { window, command, cwd } = options;

  let cmd = `tmux new-session -d -s "${name}"`;

  if (window) {
    cmd += ` -n "${window}"`;
  }

  if (cwd) {
    cmd += ` -c "${cwd}"`;
  }

  if (command) {
    cmd += ` "${command}"`;
  }

  await execAsync(cmd);
}

/**
 * Kill a tmux session
 */
export async function killTmuxSession(name: string): Promise<void> {
  await execAsync(`tmux kill-session -t "${name}"`);
}

// ============================================
// COMMAND HANDLERS
// ============================================

export const tmuxCommands = {
  list_tmux_sessions: async () => {
    const available = await isTmuxAvailable();
    if (!available) {
      return { available: false, sessions: [] };
    }

    const sessions = await listTmuxSessions();
    return { available: true, sessions, count: sessions.length };
  },

  tmux_send_keys: async (args: { target: string; keys: string; literal?: boolean; enter?: boolean }) => {
    await sendKeys(args.target, args.keys, {
      literal: args.literal,
      enter: args.enter ?? true,
    });
    return { success: true, target: args.target };
  },

  tmux_capture_pane: async (args: { target: string; lines?: number }) => {
    const content = await capturePane(args.target, { lines: args.lines ?? 50 });
    return { content, lines: content.split('\n').length };
  },

  tmux_create_session: async (args: { name: string; window?: string; command?: string; cwd?: string }) => {
    await createSession(args.name, args);
    return { success: true, session: args.name };
  },

  tmux_kill_session: async (args: { name: string }) => {
    await killTmuxSession(args.name);
    return { success: true, session: args.name };
  },

  tmux_list_windows: async (args: { session: string }) => {
    const windows = await listTmuxWindows(args.session);
    return { windows, count: windows.length };
  },
};
