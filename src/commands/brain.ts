/**
 * Brain Commands
 * Handles local brain capability checks and configuration
 *
 * When "local brain" mode is enabled, dotty uses the user's own
 * Anthropic API key (or Claude Code Max auth) to process voice prompts.
 * dotty handles voice/phone infrastructure; user's account handles AI.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { loadConfig } from '../config';

const execAsync = promisify(exec);

// ============================================
// TYPES
// ============================================

export interface BrainStatus {
  enabled: boolean;
  hasApiKey: boolean;
  claudeCodeAvailable: boolean;
  message: string;
}

// ============================================
// BRAIN STATUS
// ============================================

/**
 * Check if local brain mode is available and configured
 */
export async function checkBrainStatus(): Promise<BrainStatus> {
  const config = loadConfig();
  const hasCapability = config.capabilities.includes('claude_brain');

  // Check for Anthropic API key in environment or config
  const hasApiKey = !!(
    process.env.ANTHROPIC_API_KEY ||
    config.anthropicApiKey
  );

  // Check if Claude Code CLI is available (for auth via Max plan)
  let claudeCodeAvailable = false;
  try {
    await execAsync('which claude');
    claudeCodeAvailable = true;
  } catch {
    // Not available
  }

  let message: string;
  if (!hasCapability) {
    message = 'Local brain mode is not enabled.';
  } else if (hasApiKey) {
    message = 'Local brain mode is ready. Using your Anthropic API key.';
  } else if (claudeCodeAvailable) {
    message = 'Local brain mode is ready. Using Claude Code authentication.';
  } else {
    message = 'Local brain mode is enabled but no API key or Claude Code found.';
  }

  return {
    enabled: hasCapability,
    hasApiKey,
    claudeCodeAvailable,
    message,
  };
}

/**
 * Get the Anthropic API key to use (user's key if available)
 * Returns null if user should use server-side brain
 */
export function getUserAnthropicKey(): string | null {
  const config = loadConfig();

  // Check environment first
  if (process.env.ANTHROPIC_API_KEY) {
    return process.env.ANTHROPIC_API_KEY;
  }

  // Check config
  if (config.anthropicApiKey) {
    return config.anthropicApiKey;
  }

  return null;
}

// ============================================
// COMMAND HANDLERS
// ============================================

export const brainCommands = {
  /**
   * Check if local brain mode is available and configured
   */
  check_brain_status: async () => {
    return checkBrainStatus();
  },

  /**
   * Report whether user has their own API key configured
   * (Backend uses this to decide whether to use user's key or dotty's)
   */
  get_brain_config: async () => {
    const config = loadConfig();
    const hasUserKey = !!(process.env.ANTHROPIC_API_KEY || config.anthropicApiKey);

    return {
      hasUserKey,
      brainMode: hasUserKey ? 'local' : 'server',
      capabilities: config.capabilities,
    };
  },
};
