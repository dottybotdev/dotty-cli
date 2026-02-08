#!/usr/bin/env bun
/**
 * dotty CLI
 * Connect your machine to dotty - voice control for Claude
 *
 * Usage: dotty [--logout]
 */

import chalk from 'chalk';
import { AgentConnection } from './connection';
import {
  loadConfig,
  saveConfig,
  clearAuth,
  updateCachedServerData,
  getCachedEmail,
  ensureDottyDirs,
  appendLog,
} from './config';
import { sessionCommands } from './commands/sessions';
import { tmuxCommands } from './commands/tmux';
import { terminalCommands } from './commands/terminal';

const API_URL = process.env.DOTTY_API_URL || 'https://api.dotty.bot';

// ============================================
// DEVICE AUTH FLOW
// ============================================

interface DeviceAuthResponse {
  code: string;
  verification_url: string;
  expires_in: number;
}

interface PollResponse {
  status: 'pending' | 'approved';
  token?: string;
  user?: {
    email: string;
    phone_number?: string;
    tier: string;
  };
}

async function startDeviceAuth(): Promise<{ token: string; email: string; phoneNumber?: string; tier?: string }> {
  // Request device code
  const res = await fetch(`${API_URL}/api/auth/device`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!res.ok) {
    throw new Error('Failed to start authentication');
  }

  const data: DeviceAuthResponse = await res.json();

  console.log();
  console.log(chalk.blue('  To authenticate, open this URL in any browser:'));
  console.log();
  console.log(`  ${chalk.cyan(data.verification_url)}`);
  console.log();
  console.log(chalk.gray(`  Code: ${data.code}`));
  console.log();

  // Poll for approval
  process.stdout.write(chalk.gray('  Waiting for authorization...'));

  const startTime = Date.now();
  const timeoutMs = data.expires_in * 1000;

  while (Date.now() - startTime < timeoutMs) {
    await sleep(2000);

    const pollRes = await fetch(`${API_URL}/api/auth/device/poll?code=${data.code}`);

    if (!pollRes.ok) {
      const error = await pollRes.json();
      if (error.error === 'code_expired') {
        console.log(chalk.red(' expired'));
        throw new Error('Authorization code expired. Please try again.');
      }
      continue;
    }

    const pollData: PollResponse = await pollRes.json();

    if (pollData.status === 'approved' && pollData.token) {
      console.log(chalk.green(' authorized!'));
      return {
        token: pollData.token,
        email: pollData.user?.email || 'unknown',
        phoneNumber: pollData.user?.phone_number,
        tier: pollData.user?.tier,
      };
    }

    // Show progress dot
    process.stdout.write('.');
  }

  console.log(chalk.red(' timed out'));
  throw new Error('Authorization timed out. Please try again.');
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================
// MAIN
// ============================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // Ensure ~/.dotty directories exist
  ensureDottyDirs();

  // Handle --logout
  if (args.includes('--logout')) {
    clearAuth();
    console.log(chalk.green('Logged out'));
    appendLog('info', 'User logged out');
    process.exit(0);
  }

  // Handle --help
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
${chalk.blue('dotty')} - voice control for Claude

${chalk.gray('Usage:')}
  dotty              Start the agent (authenticates if needed)
  dotty --logout     Remove saved credentials
  dotty --help       Show this help

${chalk.gray('Local files:')} ~/.dotty/
  config.json        Machine settings and auth
  logs/              Session logs
  rules/             Custom agent rules

${chalk.gray('More info:')} https://dotty.bot
`);
    process.exit(0);
  }

  // Load config
  let config = loadConfig();

  // Check if we need to authenticate
  if (!config.token) {
    console.log(chalk.blue('dotty'));
    console.log();

    try {
      const auth = await startDeviceAuth();

      // Save token locally
      config.token = auth.token;
      saveConfig(config);

      // Cache server data (email, tier) - read-only locally
      updateCachedServerData({
        email: auth.email,
        tier: auth.tier,
      });

      appendLog('info', 'User authenticated', { email: auth.email });

      console.log();
      console.log(chalk.green(`  Logged in as ${auth.email}`));
      if (auth.phoneNumber) {
        console.log(chalk.gray(`  Phone: ${auth.phoneNumber}`));
      }
      console.log();
    } catch (error) {
      appendLog('error', 'Authentication failed', { error: (error as Error).message });
      console.error(chalk.red(`\n  ${(error as Error).message}`));
      process.exit(1);
    }
  }

  // Reload config to get cached data
  config = loadConfig();
  const email = getCachedEmail();

  // Start agent
  console.log(chalk.blue('dotty') + chalk.gray(` connected`));
  console.log(chalk.gray(`  Machine: ${config.machineId}`));
  if (email) {
    console.log(chalk.gray(`  Account: ${email}`));
  }
  console.log();
  console.log(chalk.gray('  Listening for Claude Code activity...'));
  console.log(chalk.gray('  Press Ctrl+C to stop'));
  console.log();

  appendLog('info', 'Agent starting', { machineId: config.machineId });

  // Track if we're handling a re-auth (to prevent exit on expected auth failure)
  let reAuthInProgress = false;
  let reAuthSucceeded = false;

  const connection = new AgentConnection({
    onConnected: () => {
      appendLog('info', 'Connected to server');
    },
    onDisconnected: (reason) => {
      appendLog('warn', 'Disconnected from server', { reason });
      console.log(chalk.yellow(`\n  Disconnected: ${reason}`));
    },
    onAuthenticated: () => {
      appendLog('info', 'WebSocket authenticated');
    },
    onAuthFailed: async (error) => {
      appendLog('error', 'WebSocket auth failed', { error });

      if (error.includes('invalid') || error.includes('expired')) {
        console.error(chalk.red(`\n  Session expired. Please re-authenticate.`));
        clearAuth();
        console.log();

        reAuthInProgress = true;
        try {
          const auth = await startDeviceAuth();
          config.token = auth.token;
          saveConfig(config);
          updateCachedServerData({
            email: auth.email,
            tier: auth.tier,
          });
          reAuthSucceeded = true;
          appendLog('info', 'Re-authentication successful', { email: auth.email });
        } catch (reAuthError) {
          appendLog('error', 'Re-authentication failed', { error: (reAuthError as Error).message });
          reAuthSucceeded = false;
          process.exit(1);
        }
      } else {
        console.error(chalk.red(`\n  Authentication failed: ${error}`));
        process.exit(1);
      }
    },
  });

  // Register command handlers
  registerCommands(connection);

  // Handle shutdown signals (register early)
  process.on('SIGINT', () => {
    console.log(chalk.gray('\n  Shutting down...'));
    appendLog('info', 'Agent shutdown (SIGINT)');
    connection.disconnect();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    appendLog('info', 'Agent shutdown (SIGTERM)');
    connection.disconnect();
    process.exit(0);
  });

  // Connect with retry loop for re-auth scenarios
  async function connectWithRetry(): Promise<void> {
    while (true) {
      reAuthInProgress = false;
      reAuthSucceeded = false;

      try {
        await connection.connect();
        // Successfully connected, keep alive
        await new Promise(() => {});
      } catch (error) {
        // If re-auth happened and succeeded, retry connection
        if (reAuthInProgress && reAuthSucceeded) {
          appendLog('info', 'Reconnecting after re-authentication');
          console.log(chalk.gray('  Reconnecting with new credentials...'));
          // Small delay before retry
          await sleep(500);
          continue;
        }

        // Otherwise, it's a real failure
        appendLog('error', 'Failed to connect', { error: (error as Error).message });
        console.error(chalk.red(`\n  Failed to connect: ${(error as Error).message}`));
        process.exit(1);
      }
    }
  }

  await connectWithRetry();
}

// ============================================
// COMMAND REGISTRATION
// ============================================

function registerCommands(connection: AgentConnection): void {
  // Session commands
  for (const [name, handler] of Object.entries(sessionCommands)) {
    connection.registerCommand(name, handler as (args: Record<string, unknown>) => Promise<unknown>);
  }

  // Tmux commands
  for (const [name, handler] of Object.entries(tmuxCommands)) {
    connection.registerCommand(name, handler as (args: Record<string, unknown>) => Promise<unknown>);
  }

  // Terminal commands
  for (const [name, handler] of Object.entries(terminalCommands)) {
    connection.registerCommand(name, handler as (args: Record<string, unknown>) => Promise<unknown>);
  }
}

// Run
main().catch((error) => {
  appendLog('error', 'Uncaught error', { error: error.message });
  console.error(chalk.red(`Error: ${error.message}`));
  process.exit(1);
});
