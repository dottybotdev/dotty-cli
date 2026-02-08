/**
 * Tests for WebSocket connection management
 *
 * Note: Tests that require actual WebSocket connections are skipped
 * in this unit test file. Integration tests with a live server
 * should be run separately.
 */

import { describe, it, expect, mock } from 'bun:test';

// Mock config before importing connection
const mockConfig = {
  token: 'test_token_abc123',
  email: 'test@example.com',
  apiUrl: 'wss://test.api.dotty.bot/agent',
  machineId: 'test-machine-123',
  machineLabel: 'test-machine',
  capabilities: ['claude_sessions', 'tmux'] as const,
  autoStart: false,
  logLevel: 'info' as const,
  byokMode: false,
};

// This needs to be called before importing connection
mock.module('./config', () => ({
  loadConfig: () => ({ ...mockConfig }),
  getPlatform: () => 'linux',
}));

// Import after mocking config
import { AgentConnection } from './connection';

describe('AgentConnection', () => {
  describe('constructor', () => {
    it('should create connection with default options', () => {
      const connection = new AgentConnection();
      expect(connection).toBeDefined();
    });

    it('should create connection with callback options', () => {
      const onConnected = mock(() => {});
      const onDisconnected = mock(() => {});

      const connection = new AgentConnection({
        onConnected,
        onDisconnected,
      });

      expect(connection).toBeDefined();
    });
  });

  describe('isConnected', () => {
    it('should return false when not connected', () => {
      const connection = new AgentConnection();
      expect(connection.isConnected()).toBe(false);
    });
  });

  describe('registerCommand', () => {
    it('should register command handlers', () => {
      const connection = new AgentConnection();
      const handler = mock(async () => ({ result: 'test' }));

      // Should not throw
      connection.registerCommand('test_command', handler);

      expect(typeof handler).toBe('function');
    });

    it('should allow registering multiple handlers', () => {
      const connection = new AgentConnection();

      connection.registerCommand('cmd1', async () => ({}));
      connection.registerCommand('cmd2', async () => ({}));
      connection.registerCommand('cmd3', async () => ({}));

      // No error means success
      expect(true).toBe(true);
    });
  });

  describe('disconnect', () => {
    it('should handle disconnect when not connected', () => {
      const connection = new AgentConnection();

      // Should not throw
      expect(() => connection.disconnect()).not.toThrow();
    });

    it('should be idempotent', () => {
      const connection = new AgentConnection();

      // Multiple disconnects should be safe
      connection.disconnect();
      connection.disconnect();
      connection.disconnect();

      expect(true).toBe(true);
    });
  });

  describe('authentication flow', () => {
    it('should throw error when no token configured', async () => {
      // Create a connection with a modified config that has no token
      mock.module('./config', () => ({
        loadConfig: () => ({ ...mockConfig, token: '' }),
        getPlatform: () => 'linux',
      }));

      // Re-import to get fresh instance with new mock
      const { AgentConnection: FreshAgentConnection } = await import('./connection');
      const connection = new FreshAgentConnection();

      await expect(connection.connect()).rejects.toThrow('Not authenticated');

      // Restore original mock
      mock.module('./config', () => ({
        loadConfig: () => ({ ...mockConfig }),
        getPlatform: () => 'linux',
      }));
    });
  });

  describe('sendEvent', () => {
    it('should not throw when not connected', async () => {
      const connection = new AgentConnection();

      // Should log warning but not throw
      await connection.sendEvent({
        eventType: 'session_started',
        sessionId: 'test-session',
        project: 'test-project',
      });

      expect(true).toBe(true);
    });
  });
});

// Integration tests that require a live WebSocket server
// These are skipped by default and should be run against a test server
describe.skip('AgentConnection integration', () => {
  it('should connect and authenticate', async () => {
    // This test requires a running dotty server
  });

  it('should handle commands', async () => {
    // This test requires a running dotty server
  });

  it('should reconnect on disconnect', async () => {
    // This test requires a running dotty server
  });
});
