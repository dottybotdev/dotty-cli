/**
 * WebSocket connection to dotty API
 * Handles authentication, reconnection, and message routing
 */

import WebSocket from 'ws';
import { randomUUID } from 'crypto';
import { loadConfig, getPlatform } from './config';
import type {
  AgentMessage,
  AuthPayload,
  AuthResultPayload,
  CommandPayload,
  CommandResultPayload,
  HeartbeatPayload,
  SessionEventPayload,
} from './protocol';

// ============================================
// TYPES
// ============================================

type CommandHandler = (args: Record<string, unknown>) => Promise<unknown>;

interface ConnectionOptions {
  onConnected?: () => void;
  onDisconnected?: (reason: string) => void;
  onAuthenticated?: (userId: string) => void;
  onAuthFailed?: (error: string) => void;
  onCommand?: (command: string, args: Record<string, unknown>) => Promise<unknown>;
}

// ============================================
// CONNECTION CLASS
// ============================================

export class AgentConnection {
  private ws: WebSocket | null = null;
  private authenticated = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 1000;  // Start with 1s, exponential backoff
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private commandHandlers: Map<string, CommandHandler> = new Map();
  private pendingRequests: Map<string, { resolve: Function; reject: Function; timeout: ReturnType<typeof setTimeout> }> = new Map();
  private startTime = Date.now();
  private options: ConnectionOptions;

  constructor(options: ConnectionOptions = {}) {
    this.options = options;
  }

  // ============================================
  // PUBLIC API
  // ============================================

  async connect(): Promise<void> {
    const config = loadConfig();

    if (!config.token) {
      throw new Error('Not authenticated. Run: dotty');
    }

    return new Promise((resolve, reject) => {
      console.log(`Connecting to ${config.apiUrl}...`);

      this.ws = new WebSocket(config.apiUrl);

      this.ws.on('open', () => {
        console.log('Connected, authenticating...');
        this.authenticate();
      });

      this.ws.on('message', (data) => {
        this.handleMessage(data.toString());
      });

      this.ws.on('close', (code, reason) => {
        const reasonStr = reason?.toString() || `code ${code}`;
        console.log(`Disconnected: ${reasonStr}`);
        this.authenticated = false;
        this.stopHeartbeat();
        this.options.onDisconnected?.(reasonStr);
        this.scheduleReconnect();
      });

      this.ws.on('error', (error) => {
        console.error('WebSocket error:', error.message);
        if (!this.authenticated) {
          reject(error);
        }
      });

      // Wait for auth result
      const authTimeout = setTimeout(() => {
        reject(new Error('Authentication timeout'));
      }, 10000);

      const originalOnAuth = this.options.onAuthenticated;
      this.options.onAuthenticated = (userId) => {
        clearTimeout(authTimeout);
        originalOnAuth?.(userId);
        resolve();
      };

      const originalOnAuthFailed = this.options.onAuthFailed;
      this.options.onAuthFailed = (error) => {
        clearTimeout(authTimeout);
        originalOnAuthFailed?.(error);
        reject(new Error(error));
      };
    });
  }

  disconnect(): void {
    this.stopHeartbeat();
    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }
  }

  registerCommand(command: string, handler: CommandHandler): void {
    this.commandHandlers.set(command, handler);
  }

  async sendEvent(event: SessionEventPayload): Promise<void> {
    this.send('session_event', event);
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN && this.authenticated;
  }

  // ============================================
  // PRIVATE METHODS
  // ============================================

  private authenticate(): void {
    const config = loadConfig();

    const payload: AuthPayload = {
      token: config.token!,
      agentVersion: '0.1.0',  // TODO: Read from package.json
      machineId: config.machineId,
      machineLabel: config.machineLabel,
      platform: getPlatform(),
      capabilities: config.capabilities,
    };

    this.send('auth', payload);
  }

  private handleMessage(raw: string): void {
    let message: AgentMessage;

    try {
      message = JSON.parse(raw);
    } catch {
      console.error('Invalid message:', raw.slice(0, 100));
      return;
    }

    switch (message.type) {
      case 'auth_result':
        this.handleAuthResult(message.payload as AuthResultPayload);
        break;

      case 'command':
        this.handleCommand(message.id, message.payload as CommandPayload);
        break;

      case 'ping':
        this.send('heartbeat', this.buildHeartbeat());
        break;

      default:
        console.warn('Unknown message type:', message.type);
    }
  }

  private handleAuthResult(result: AuthResultPayload): void {
    if (result.success) {
      console.log('Authenticated successfully');
      this.authenticated = true;
      this.reconnectAttempts = 0;
      this.startHeartbeat();
      this.options.onAuthenticated?.(result.userId!);
      this.options.onConnected?.();
    } else {
      console.error('Authentication failed:', result.error);
      this.options.onAuthFailed?.(result.error || 'Unknown error');
      this.disconnect();
    }
  }

  private async handleCommand(requestId: string, payload: CommandPayload): Promise<void> {
    const startTime = Date.now();
    const handler = this.commandHandlers.get(payload.command);

    if (!handler) {
      // Try the generic onCommand callback
      if (this.options.onCommand) {
        try {
          const result = await this.options.onCommand(payload.command, payload.args);
          this.sendCommandResult(requestId, true, result, Date.now() - startTime);
        } catch (error) {
          this.sendCommandResult(requestId, false, null, Date.now() - startTime, (error as Error).message);
        }
        return;
      }

      this.sendCommandResult(requestId, false, null, 0, `Unknown command: ${payload.command}`);
      return;
    }

    try {
      const result = await handler(payload.args);
      this.sendCommandResult(requestId, true, result, Date.now() - startTime);
    } catch (error) {
      this.sendCommandResult(requestId, false, null, Date.now() - startTime, (error as Error).message);
    }
  }

  private sendCommandResult(requestId: string, success: boolean, data: unknown, durationMs: number, error?: string): void {
    const payload: CommandResultPayload = {
      requestId,
      success,
      data,
      durationMs,
      error,
    };
    this.send('command_result', payload);
  }

  private send(type: string, payload: unknown): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('Cannot send, not connected');
      return;
    }

    const message: AgentMessage = {
      id: randomUUID(),
      type: type as AgentMessage['type'],
      payload,
      timestamp: Date.now(),
    };

    this.ws.send(JSON.stringify(message));
  }

  private buildHeartbeat(): HeartbeatPayload {
    return {
      activeSessions: 0,  // TODO: Get from session tracker
      uptime: Date.now() - this.startTime,
    };
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      this.send('heartbeat', this.buildHeartbeat());
    }, 30000);  // Every 30 seconds
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached, giving up');
      return;
    }

    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts);
    this.reconnectAttempts++;

    console.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);

    setTimeout(() => {
      this.connect().catch((error) => {
        console.error('Reconnection failed:', error.message);
      });
    }, delay);
  }
}
