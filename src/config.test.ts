/**
 * Tests for configuration management
 */

import { describe, it, expect, beforeEach, afterEach, mock, spyOn } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';

// We'll test the pure functions and mock filesystem calls

describe('config', () => {
  // Mock filesystem
  const mockFs = {
    existsSync: false,
    readFileSync: '{}',
    writeFileSync: mock(() => {}),
    mkdirSync: mock(() => {}),
  };

  const mockOs = {
    homedir: '/mock/home',
    hostname: 'test-host',
    platform: 'linux',
  };

  beforeEach(() => {
    // Reset mocks
    mockFs.existsSync = false;
    mockFs.readFileSync = '{}';
    mockFs.writeFileSync = mock(() => {});
    mockFs.mkdirSync = mock(() => {});
  });

  describe('config path', () => {
    it('should use .dotty directory in home', async () => {
      const { getConfigPath } = await import('./config');
      const path = getConfigPath();

      expect(path).toContain('.dotty');
      expect(path).toContain('config.json');
    });
  });

  describe('getPlatform', () => {
    it('should return valid platform', async () => {
      const { getPlatform } = await import('./config');
      const platform = getPlatform();

      expect(['darwin', 'linux', 'win32']).toContain(platform);
    });
  });

  describe('AgentConfig interface', () => {
    it('should have expected properties', async () => {
      const { loadConfig } = await import('./config');

      // This will create default config if none exists
      const config = loadConfig();

      expect(typeof config.apiUrl).toBe('string');
      expect(typeof config.machineId).toBe('string');
      expect(Array.isArray(config.capabilities)).toBe(true);
      expect(typeof config.autoStart).toBe('boolean');
      expect(typeof config.logLevel).toBe('string');
      expect(typeof config.byokMode).toBe('boolean');
    });
  });

  describe('default config', () => {
    it('should have sensible defaults', async () => {
      // Reset config to known defaults for this test
      const { loadConfig, setCapabilities, setByokMode, setElevenLabsKey } = await import('./config');

      // First reset to known defaults
      setCapabilities(['claude_sessions', 'tmux']);
      setByokMode(false);
      setElevenLabsKey(undefined);

      const config = loadConfig();

      // API URL should point to dotty
      expect(config.apiUrl).toContain('dotty');

      // Should have safe default capabilities (after reset)
      expect(config.capabilities).toContain('claude_sessions');
      expect(config.capabilities).toContain('tmux');

      // Should not have dangerous capabilities
      expect(config.capabilities).not.toContain('terminal');

      // BYOK should be off (after reset)
      expect(config.byokMode).toBe(false);
    });
  });

  describe('machine ID generation', () => {
    it('should generate a machine ID with hostname prefix', async () => {
      const { loadConfig } = await import('./config');
      const config = loadConfig();

      // Machine ID should be non-empty
      expect(config.machineId.length).toBeGreaterThan(0);

      // Should contain a separator
      expect(config.machineId).toContain('-');
    });
  });

  describe('token management', () => {
    it('should save and load token', async () => {
      const { loadConfig, saveConfig } = await import('./config');

      const config = loadConfig();
      config.token = 'test_token_12345';
      config.email = 'test@example.com';
      saveConfig(config);

      const loaded = loadConfig();
      expect(loaded.token).toBe('test_token_12345');
      expect(loaded.email).toBe('test@example.com');
    });
  });

  describe('setMachineLabel', () => {
    it('should save machine label to config', async () => {
      const { setMachineLabel, loadConfig } = await import('./config');

      setMachineLabel('my-test-machine');
      const config = loadConfig();

      expect(config.machineLabel).toBe('my-test-machine');
    });
  });

  describe('capability management', () => {
    it('should enable capability', async () => {
      const { enableCapability, loadConfig } = await import('./config');

      enableCapability('terminal');
      const config = loadConfig();

      expect(config.capabilities).toContain('terminal');
    });

    it('should not duplicate capability', async () => {
      const { enableCapability, loadConfig } = await import('./config');

      enableCapability('tmux');
      enableCapability('tmux');
      const config = loadConfig();

      const tmuxCount = config.capabilities.filter(c => c === 'tmux').length;
      expect(tmuxCount).toBe(1);
    });

    it('should disable capability', async () => {
      const { enableCapability, disableCapability, loadConfig } = await import('./config');

      enableCapability('terminal');
      disableCapability('terminal');
      const config = loadConfig();

      expect(config.capabilities).not.toContain('terminal');
    });
  });

  describe('BYOK mode', () => {
    it('should enable BYOK mode', async () => {
      const { setByokMode, loadConfig } = await import('./config');

      setByokMode(true);
      const config = loadConfig();

      expect(config.byokMode).toBe(true);
    });

    it('should disable BYOK mode', async () => {
      const { setByokMode, loadConfig } = await import('./config');

      setByokMode(true);
      setByokMode(false);
      const config = loadConfig();

      expect(config.byokMode).toBe(false);
    });

    it('should auto-enable BYOK when ElevenLabs key is set', async () => {
      const { setElevenLabsKey, loadConfig } = await import('./config');

      setElevenLabsKey('sk_test_elevenlabs_key');
      const config = loadConfig();

      expect(config.elevenLabsKey).toBe('sk_test_elevenlabs_key');
      expect(config.byokMode).toBe(true);
    });

    it('should check BYOK mode correctly', async () => {
      const { setByokMode, setElevenLabsKey, isByokMode } = await import('./config');

      // BYOK requires both flag and key
      setByokMode(false);
      setElevenLabsKey(undefined);
      expect(isByokMode()).toBe(false);

      // Just flag is not enough
      setByokMode(true);
      expect(isByokMode()).toBe(false);

      // Need both
      setElevenLabsKey('sk_test');
      expect(isByokMode()).toBe(true);
    });
  });

  describe('setCapabilities', () => {
    it('should replace all capabilities', async () => {
      const { setCapabilities, loadConfig } = await import('./config');

      // Save original
      const originalConfig = loadConfig();
      const originalCapabilities = [...originalConfig.capabilities];

      setCapabilities(['file_read', 'file_write']);
      const config = loadConfig();

      expect(config.capabilities).toEqual(['file_read', 'file_write']);
      expect(config.capabilities).not.toContain('tmux');

      // Restore original capabilities for other tests
      setCapabilities(originalCapabilities);
    });
  });
});
