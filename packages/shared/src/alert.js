"use strict";
/**
 * Alert System for Rugs Research
 * Sends alerts to console, file, and webhooks
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initializeAlertManager = initializeAlertManager;
exports.getAlertManager = getAlertManager;
exports.sendAlert = sendAlert;
exports.sendInfoAlert = sendInfoAlert;
exports.sendWarnAlert = sendWarnAlert;
exports.sendErrorAlert = sendErrorAlert;
exports.sendDriftAlert = sendDriftAlert;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
class AlertManager {
    logger;
    alertLogPath;
    webhookUrl;
    debounceMinutes;
    lastAlerts = new Map();
    constructor(logger, alertLogPath = './logs/alerts.log', webhookUrl, debounceMinutes = 5) {
        this.logger = logger;
        this.alertLogPath = alertLogPath;
        this.webhookUrl = webhookUrl;
        this.debounceMinutes = debounceMinutes;
        // Ensure alert log directory exists
        const alertLogDir = path_1.default.dirname(alertLogPath);
        if (!fs_1.default.existsSync(alertLogDir)) {
            fs_1.default.mkdirSync(alertLogDir, { recursive: true });
        }
    }
    getAlertKey(level, title) {
        return `${level}:${title}`;
    }
    isDebounced(level, title) {
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
    updateDebounce(level, title) {
        const key = this.getAlertKey(level, title);
        this.lastAlerts.set(key, Date.now());
    }
    getLevelColor(level) {
        switch (level) {
            case 'INFO': return 0x00ff00; // Green
            case 'WARN': return 0xffa500; // Orange
            case 'ERROR': return 0xff0000; // Red
            case 'DRIFT': return 0xff6b6b; // Light red
            default: return 0x808080; // Gray
        }
    }
    getLevelEmoji(level) {
        switch (level) {
            case 'INFO': return 'ℹ️';
            case 'WARN': return '⚠️';
            case 'ERROR': return '❌';
            case 'DRIFT': return '📊';
            default: return '❓';
        }
    }
    formatConsoleMessage(payload) {
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
    formatFileMessage(payload) {
        return JSON.stringify({
            timestamp: payload.timestamp,
            level: payload.level,
            title: payload.title,
            message: payload.message,
            context: payload.context,
            source: payload.source
        });
    }
    createWebhookPayload(payload) {
        const color = this.getLevelColor(payload.level);
        const emoji = this.getLevelEmoji(payload.level);
        const embed = {
            title: `${emoji} ${payload.title}`,
            description: payload.message,
            color: color,
            timestamp: payload.timestamp,
            fields: []
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
    async sendWebhook(payload) {
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
            }
            else {
                this.logger.info('Webhook alert sent successfully');
            }
        }
        catch (error) {
            this.logger.error(`Failed to send webhook alert: ${error}`);
        }
    }
    writeToFile(payload) {
        try {
            const message = this.formatFileMessage(payload) + '\n';
            fs_1.default.appendFileSync(this.alertLogPath, message);
        }
        catch (error) {
            this.logger.error(`Failed to write alert to file: ${error}`);
        }
    }
    async sendAlert(params) {
        const { level, title, message, context } = params;
        // Check debounce
        if (this.isDebounced(level, title)) {
            this.logger.debug(`Alert debounced: ${level}:${title}`);
            return;
        }
        // Create payload
        const payload = {
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
    async info(title, message, context) {
        return this.sendAlert({ level: 'INFO', title, message, context });
    }
    async warn(title, message, context) {
        return this.sendAlert({ level: 'WARN', title, message, context });
    }
    async error(title, message, context) {
        return this.sendAlert({ level: 'ERROR', title, message, context });
    }
    async drift(title, message, context) {
        return this.sendAlert({ level: 'DRIFT', title, message, context });
    }
    // Get recent alerts from log file
    getRecentAlerts(minutes = 10) {
        try {
            if (!fs_1.default.existsSync(this.alertLogPath)) {
                return [];
            }
            const content = fs_1.default.readFileSync(this.alertLogPath, 'utf8');
            const lines = content.trim().split('\n').filter(line => line.trim());
            const cutoffTime = Date.now() - (minutes * 60 * 1000);
            const recentAlerts = [];
            for (const line of lines) {
                try {
                    const alert = JSON.parse(line);
                    const alertTime = new Date(alert.timestamp).getTime();
                    if (alertTime >= cutoffTime) {
                        recentAlerts.push(alert);
                    }
                }
                catch (error) {
                    // Skip malformed lines
                    continue;
                }
            }
            return recentAlerts;
        }
        catch (error) {
            this.logger.error(`Failed to read recent alerts: ${error}`);
            return [];
        }
    }
    // Check if there are recent WARN/DRIFT alerts
    hasRecentWarnings(minutes = 10) {
        const recentAlerts = this.getRecentAlerts(minutes);
        return recentAlerts.some(alert => alert.level === 'WARN' || alert.level === 'DRIFT');
    }
}
// Global alert manager instance
let globalAlertManager = null;
function initializeAlertManager(logger, alertLogPath, webhookUrl, debounceMinutes) {
    globalAlertManager = new AlertManager(logger, alertLogPath, webhookUrl, debounceMinutes);
    return globalAlertManager;
}
function getAlertManager() {
    if (!globalAlertManager) {
        throw new Error('Alert manager not initialized. Call initializeAlertManager first.');
    }
    return globalAlertManager;
}
// Convenience functions
async function sendAlert(params) {
    const manager = getAlertManager();
    return manager.sendAlert(params);
}
async function sendInfoAlert(title, message, context) {
    const manager = getAlertManager();
    return manager.info(title, message, context);
}
async function sendWarnAlert(title, message, context) {
    const manager = getAlertManager();
    return manager.warn(title, message, context);
}
async function sendErrorAlert(title, message, context) {
    const manager = getAlertManager();
    return manager.error(title, message, context);
}
async function sendDriftAlert(title, message, context) {
    const manager = getAlertManager();
    return manager.drift(title, message, context);
}
//# sourceMappingURL=alert.js.map