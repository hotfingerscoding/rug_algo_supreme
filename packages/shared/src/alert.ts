/**
 * Alert System for Rugs Research
 * Sends alerts to console, file, and webhooks
 */

import fs from 'fs';
import path from 'path';
import { Logger } from './index';

export type AlertLevel = 'INFO' | 'WARN' | 'ERROR' | 'DRIFT';

export interface AlertContext {
  [key: string]: any;
}

export interface AlertPayload {
  level: AlertLevel;
  title: string;
  message: string;
  context?: AlertContext;
  timestamp: string;
  source: string;
}

export interface WebhookPayload {
  text?: string;
  embeds?: Array<{
    title: string;
    description: string;
    color: number;
    fields?: Array<{
      name: string;
      value: string;
      inline?: boolean;
    }>;
    timestamp: string;
  }>;
}

class AlertManager {
  private logger: Logger;
  private alertLogPath: string;
  private webhookUrl?: string;
  private debounceMinutes: number;
  private lastAlerts: Map<string, number> = new Map();

  constructor(
    logger: Logger,
    alertLogPath: string = './logs/alerts.log',
    webhookUrl?: string,
    debounceMinutes: number = 5
  ) {
    this.logger = logger;
    this.alertLogPath = alertLogPath;
    this.webhookUrl = webhookUrl;
    this.debounceMinutes = debounceMinutes;
    
    // Ensure alert log directory exists
    const alertLogDir = path.dirname(alertLogPath);
    if (!fs.existsSync(alertLogDir)) {
      fs.mkdirSync(alertLogDir, { recursive: true });
    }
  }

  private getAlertKey(level: AlertLevel, title: string): string {
    return `${level}:${title}`;
  }

  private isDebounced(level: AlertLevel, title: string): boolean {
    const key = this.getAlertKey(level, title);
    const lastTime = this.lastAlerts.get(key);
    
    if (!lastTime) {
      return false;
    }
    
    const now = Date.now();
    const debounceMs = this.debounceMinutes * 60 * 1000;
    
    if (now - lastTime < debounceMs) {
      return true;
    }
    
    return false;
  }

  private updateDebounce(level: AlertLevel, title: string): void {
    const key = this.getAlertKey(level, title);
    this.lastAlerts.set(key, Date.now());
  }

  private getLevelColor(level: AlertLevel): number {
    switch (level) {
      case 'INFO': return 0x00ff00;  // Green
      case 'WARN': return 0xffa500;  // Orange
      case 'ERROR': return 0xff0000; // Red
      case 'DRIFT': return 0xff6b6b; // Light red
      default: return 0x808080;      // Gray
    }
  }

  private getLevelEmoji(level: AlertLevel): string {
    switch (level) {
      case 'INFO': return 'ℹ️';
      case 'WARN': return '⚠️';
      case 'ERROR': return '❌';
      case 'DRIFT': return '📊';
      default: return '❓';
    }
  }

  private formatConsoleMessage(payload: AlertPayload): string {
    const emoji = this.getLevelEmoji(payload.level);
    const timestamp = new Date(payload.timestamp).toISOString();
    
    let message = `[${timestamp}] ${emoji} [${payload.level}] ${payload.title}`;
    
    if (payload.message) {
      message += `: ${payload.message}`;
    }
    
    if (payload.context && Object.keys(payload.context).length > 0) {
      message += ` | Context: ${JSON.stringify(payload.context)}`;
    }
    
    return message;
  }

  private formatFileMessage(payload: AlertPayload): string {
    return JSON.stringify({
      timestamp: payload.timestamp,
      level: payload.level,
      title: payload.title,
      message: payload.message,
      context: payload.context,
      source: payload.source
    });
  }

  private createWebhookPayload(payload: AlertPayload): WebhookPayload {
    const color = this.getLevelColor(payload.level);
    const emoji = this.getLevelEmoji(payload.level);
    
    const embed = {
      title: `${emoji} ${payload.title}`,
      description: payload.message,
      color: color,
      timestamp: payload.timestamp,
      fields: [] as Array<{name: string, value: string, inline?: boolean}>
    };

    // Add context fields
    if (payload.context) {
      for (const [key, value] of Object.entries(payload.context)) {
        embed.fields.push({
          name: key,
          value: String(value),
          inline: true
        });
      }
    }

    // Add source field
    embed.fields.push({
      name: 'Source',
      value: payload.source,
      inline: false
    });

    return {
      embeds: [embed]
    };
  }

  private async sendWebhook(payload: AlertPayload): Promise<void> {
    if (!this.webhookUrl) {
      return;
    }

    try {
      const webhookPayload = this.createWebhookPayload(payload);
      
      const response = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(webhookPayload)
      });

      if (!response.ok) {
        this.logger.warn(`Webhook alert failed: ${response.status} ${response.statusText}`);
      } else {
        this.logger.info('Webhook alert sent successfully');
      }
    } catch (error) {
      this.logger.error(`Failed to send webhook alert: ${error}`);
    }
  }

  private writeToFile(payload: AlertPayload): void {
    try {
      const message = this.formatFileMessage(payload) + '\n';
      fs.appendFileSync(this.alertLogPath, message);
    } catch (error) {
      this.logger.error(`Failed to write alert to file: ${error}`);
    }
  }

  async sendAlert(params: {
    level: AlertLevel;
    title: string;
    message: string;
    context?: AlertContext;
  }): Promise<void> {
    const { level, title, message, context } = params;

    // Check debounce
    if (this.isDebounced(level, title)) {
      this.logger.debug(`Alert debounced: ${level}:${title}`);
      return;
    }

    // Create payload
    const payload: AlertPayload = {
      level,
      title,
      message,
      context,
      timestamp: new Date().toISOString(),
      source: 'rugs-research'
    };

    // Update debounce
    this.updateDebounce(level, title);

    // Send to console
    const consoleMessage = this.formatConsoleMessage(payload);
    switch (level) {
      case 'INFO':
        this.logger.info(consoleMessage);
        break;
      case 'WARN':
        this.logger.warn(consoleMessage);
        break;
      case 'ERROR':
        this.logger.error(consoleMessage);
        break;
      case 'DRIFT':
        this.logger.warn(consoleMessage);
        break;
    }

    // Write to file
    this.writeToFile(payload);

    // Send webhook (async, don't wait)
    this.sendWebhook(payload).catch(error => {
      this.logger.error(`Webhook alert failed: ${error}`);
    });
  }

  // Convenience methods
  async info(title: string, message: string, context?: AlertContext): Promise<void> {
    return this.sendAlert({ level: 'INFO', title, message, context });
  }

  async warn(title: string, message: string, context?: AlertContext): Promise<void> {
    return this.sendAlert({ level: 'WARN', title, message, context });
  }

  async error(title: string, message: string, context?: AlertContext): Promise<void> {
    return this.sendAlert({ level: 'ERROR', title, message, context });
  }

  async drift(title: string, message: string, context?: AlertContext): Promise<void> {
    return this.sendAlert({ level: 'DRIFT', title, message, context });
  }

  // Get recent alerts from log file
  getRecentAlerts(minutes: number = 10): AlertPayload[] {
    try {
      if (!fs.existsSync(this.alertLogPath)) {
        return [];
      }

      const content = fs.readFileSync(this.alertLogPath, 'utf8');
      const lines = content.trim().split('\n').filter(line => line.trim());
      
      const cutoffTime = Date.now() - (minutes * 60 * 1000);
      const recentAlerts: AlertPayload[] = [];

      for (const line of lines) {
        try {
          const alert = JSON.parse(line) as AlertPayload;
          const alertTime = new Date(alert.timestamp).getTime();
          
          if (alertTime >= cutoffTime) {
            recentAlerts.push(alert);
          }
        } catch (error) {
          // Skip malformed lines
          continue;
        }
      }

      return recentAlerts;
    } catch (error) {
      this.logger.error(`Failed to read recent alerts: ${error}`);
      return [];
    }
  }

  // Check if there are recent WARN/DRIFT alerts
  hasRecentWarnings(minutes: number = 10): boolean {
    const recentAlerts = this.getRecentAlerts(minutes);
    return recentAlerts.some(alert => alert.level === 'WARN' || alert.level === 'DRIFT');
  }
}

// Global alert manager instance
let globalAlertManager: AlertManager | null = null;

export function initializeAlertManager(
  logger: Logger,
  alertLogPath?: string,
  webhookUrl?: string,
  debounceMinutes?: number
): AlertManager {
  globalAlertManager = new AlertManager(logger, alertLogPath, webhookUrl, debounceMinutes);
  return globalAlertManager;
}

export function getAlertManager(): AlertManager {
  if (!globalAlertManager) {
    throw new Error('Alert manager not initialized. Call initializeAlertManager first.');
  }
  return globalAlertManager;
}

// Convenience functions
export async function sendAlert(params: {
  level: AlertLevel;
  title: string;
  message: string;
  context?: AlertContext;
}): Promise<void> {
  const manager = getAlertManager();
  return manager.sendAlert(params);
}

export async function sendInfoAlert(title: string, message: string, context?: AlertContext): Promise<void> {
  const manager = getAlertManager();
  return manager.info(title, message, context);
}

export async function sendWarnAlert(title: string, message: string, context?: AlertContext): Promise<void> {
  const manager = getAlertManager();
  return manager.warn(title, message, context);
}

export async function sendErrorAlert(title: string, message: string, context?: AlertContext): Promise<void> {
  const manager = getAlertManager();
  return manager.error(title, message, context);
}

export async function sendDriftAlert(title: string, message: string, context?: AlertContext): Promise<void> {
  const manager = getAlertManager();
  return manager.drift(title, message, context);
}
