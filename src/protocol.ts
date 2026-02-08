/**
 * Protocol types for Agent <-> API communication
 * This file can be shared with the backend for type safety
 */

// ============================================
// MESSAGE ENVELOPE
// ============================================

export interface AgentMessage {
  id: string;           // Unique message ID for request/response matching
  type: MessageType;
  payload: unknown;
  timestamp: number;
}

export type MessageType =
  // Agent -> API
  | 'auth'
  | 'heartbeat'
  | 'command_result'
  | 'session_event'
  | 'error'
  // API -> Agent
  | 'auth_result'
  | 'command'
  | 'ping';

// ============================================
// AUTHENTICATION
// ============================================

export interface AuthPayload {
  token: string;
  agentVersion: string;
  machineId: string;       // Unique machine identifier
  machineLabel?: string;   // User-friendly name (e.g., "personal-vm")
  platform: 'darwin' | 'linux' | 'win32';
  capabilities: AgentCapability[];
}

export interface AuthResultPayload {
  success: boolean;
  userId?: string;
  error?: string;
  serverVersion?: string;
}

export type AgentCapability =
  | 'terminal'           // Can execute terminal commands
  | 'tmux'               // Can manage tmux sessions
  | 'claude_sessions'    // Can list/manage Claude Code sessions
  | 'file_read'          // Can read files
  | 'file_write'         // Can write files (requires user opt-in)
  | 'process_manage';    // Can kill/start processes

// ============================================
// COMMANDS (API -> Agent)
// ============================================

export interface CommandPayload {
  command: CommandType;
  args: Record<string, unknown>;
  timeout?: number;       // Max execution time in ms
}

export type CommandType =
  // Session management
  | 'list_claude_sessions'
  | 'get_session_details'
  | 'kill_session'
  | 'start_session'
  // Terminal
  | 'exec'                // Execute a command (restricted by default)
  | 'exec_safe'           // Execute a pre-approved safe command
  // Tmux
  | 'list_tmux_sessions'
  | 'tmux_send_keys'
  | 'tmux_capture_pane'
  // System
  | 'get_system_info'
  | 'get_resource_usage';

// ============================================
// COMMAND RESULTS (Agent -> API)
// ============================================

export interface CommandResultPayload {
  requestId: string;      // ID of the command message
  success: boolean;
  data?: unknown;
  error?: string;
  durationMs: number;
}

// ============================================
// SESSION EVENTS (Agent -> API)
// ============================================

export interface SessionEventPayload {
  eventType: SessionEventType;
  sessionId?: string;
  project?: string;
  message?: string;
  details?: Record<string, unknown>;
}

export type SessionEventType =
  | 'session_started'
  | 'session_ended'
  | 'session_blocked'
  | 'task_completed'
  | 'task_failed'
  | 'error';

// ============================================
// HEARTBEAT
// ============================================

export interface HeartbeatPayload {
  activeSessions: number;
  cpuUsage?: number;
  memoryUsage?: number;
  uptime: number;
}

// ============================================
// SAFE COMMANDS
// Pre-approved commands that don't require 'terminal' capability
// ============================================

export const SAFE_COMMANDS = [
  'whoami',
  'pwd',
  'hostname',
  'uptime',
  'df -h',
  'free -h',
  'ps aux | grep claude',
  'tmux list-sessions',
  'which claude',
  'claude --version',
] as const;

export type SafeCommand = typeof SAFE_COMMANDS[number];

export function isSafeCommand(cmd: string): cmd is SafeCommand {
  return SAFE_COMMANDS.includes(cmd as SafeCommand);
}
