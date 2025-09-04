/**
 * Alert System for Rugs Research
 * Sends alerts to console, file, and webhooks
 */
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
declare class AlertManager {
    private logger;
    private alertLogPath;
    private webhookUrl?;
    private debounceMinutes;
    private lastAlerts;
    constructor(logger: Logger, alertLogPath?: string, webhookUrl?: string, debounceMinutes?: number);
    private getAlertKey;
    private isDebounced;
    private updateDebounce;
    private getLevelColor;
    private getLevelEmoji;
    private formatConsoleMessage;
    private formatFileMessage;
    private createWebhookPayload;
    private sendWebhook;
    private writeToFile;
    sendAlert(params: {
        level: AlertLevel;
        title: string;
        message: string;
        context?: AlertContext;
    }): Promise<void>;
    info(title: string, message: string, context?: AlertContext): Promise<void>;
    warn(title: string, message: string, context?: AlertContext): Promise<void>;
    error(title: string, message: string, context?: AlertContext): Promise<void>;
    drift(title: string, message: string, context?: AlertContext): Promise<void>;
    getRecentAlerts(minutes?: number): AlertPayload[];
    hasRecentWarnings(minutes?: number): boolean;
}
export declare function initializeAlertManager(logger: Logger, alertLogPath?: string, webhookUrl?: string, debounceMinutes?: number): AlertManager;
export declare function getAlertManager(): AlertManager;
export declare function sendAlert(params: {
    level: AlertLevel;
    title: string;
    message: string;
    context?: AlertContext;
}): Promise<void>;
export declare function sendInfoAlert(title: string, message: string, context?: AlertContext): Promise<void>;
export declare function sendWarnAlert(title: string, message: string, context?: AlertContext): Promise<void>;
export declare function sendErrorAlert(title: string, message: string, context?: AlertContext): Promise<void>;
export declare function sendDriftAlert(title: string, message: string, context?: AlertContext): Promise<void>;
export {};
//# sourceMappingURL=alert.d.ts.map