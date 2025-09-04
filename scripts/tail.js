#!/usr/bin/env node
"use strict";
/**
 * Log Tail Script
 * Tails logs/collector.log and logs/alerts.log with pretty formatting
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const child_process_1 = require("child_process");
class LogTailer {
    collectorLogPath;
    alertsLogPath;
    isRunning = false;
    filters = [];
    constructor() {
        this.collectorLogPath = path.join(process.cwd(), 'logs', 'collector.log');
        this.alertsLogPath = path.join(process.cwd(), 'logs', 'alerts.log');
    }
    start() {
        console.log('📋 Rugs Research Log Tailer');
        console.log('='.repeat(50));
        // Parse command line arguments
        this.parseArguments();
        // Check if log files exist
        this.checkLogFiles();
        // Start tailing
        this.isRunning = true;
        console.log('🔄 Starting log tail...');
        console.log('Press Ctrl+C to stop\n');
        // Tail collector logs
        this.tailFile(this.collectorLogPath, 'COLLECTOR');
        // Tail alerts logs
        this.tailFile(this.alertsLogPath, 'ALERTS');
        // Handle shutdown
        process.on('SIGINT', () => {
            console.log('\n🛑 Stopping log tail...');
            this.isRunning = false;
            process.exit(0);
        });
        process.on('SIGTERM', () => {
            console.log('\n🛑 Stopping log tail...');
            this.isRunning = false;
            process.exit(0);
        });
    }
    parseArguments() {
        const args = process.argv.slice(2);
        for (const arg of args) {
            if (arg.startsWith('--')) {
                const filter = arg.substring(2);
                this.filters.push(filter);
            }
            else if (arg.startsWith('-')) {
                const filter = arg.substring(1);
                this.filters.push(filter);
            }
        }
        if (this.filters.length > 0) {
            console.log(`🔍 Filtering logs for: ${this.filters.join(', ')}`);
        }
    }
    checkLogFiles() {
        const files = [
            { path: this.collectorLogPath, name: 'collector.log' },
            { path: this.alertsLogPath, name: 'alerts.log' }
        ];
        for (const file of files) {
            if (!fs.existsSync(file.path)) {
                console.warn(`⚠️  ${file.name} not found at: ${file.path}`);
                console.warn(`   Create the file or start the collector to see logs`);
            }
            else {
                console.log(`✅ ${file.name} found`);
            }
        }
        console.log('');
    }
    tailFile(filePath, source) {
        if (!fs.existsSync(filePath)) {
            return;
        }
        try {
            // Use tail -f command for real-time following
            const tail = (0, child_process_1.spawn)('tail', ['-f', filePath]);
            tail.stdout.on('data', (data) => {
                const lines = data.toString().split('\n').filter(line => line.trim());
                for (const line of lines) {
                    this.processLogLine(line, source);
                }
            });
            tail.stderr.on('data', (data) => {
                console.error(`❌ Tail error for ${source}: ${data}`);
            });
            tail.on('close', (code) => {
                if (this.isRunning) {
                    console.log(`🔄 Tail process for ${source} closed with code ${code}`);
                    // Restart tail after a short delay
                    setTimeout(() => {
                        if (this.isRunning) {
                            this.tailFile(filePath, source);
                        }
                    }, 1000);
                }
            });
        }
        catch (error) {
            console.error(`❌ Error starting tail for ${source}: ${error}`);
        }
    }
    processLogLine(line, source) {
        try {
            // Try to parse as JSON (alerts log)
            if (source === 'ALERTS') {
                const alertData = JSON.parse(line);
                this.displayAlert(alertData);
                return;
            }
            // Parse collector log line
            const logEntry = this.parseCollectorLog(line);
            if (logEntry) {
                this.displayLogEntry(logEntry, source);
            }
        }
        catch (error) {
            // If parsing fails, display as raw line
            this.displayRawLine(line, source);
        }
    }
    parseCollectorLog(line) {
        // Try to parse different log formats
        // Format: [timestamp] LEVEL message
        const timestampMatch = line.match(/^\[([^\]]+)\]\s+(\w+)\s+(.+)$/);
        if (timestampMatch) {
            return {
                timestamp: timestampMatch[1],
                level: timestampMatch[2],
                message: timestampMatch[3],
                source: 'collector'
            };
        }
        // Format: timestamp LEVEL message
        const spaceMatch = line.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)\s+(\w+)\s+(.+)$/);
        if (spaceMatch) {
            return {
                timestamp: spaceMatch[1],
                level: spaceMatch[2],
                message: spaceMatch[3],
                source: 'collector'
            };
        }
        // Format: LEVEL: message
        const colonMatch = line.match(/^(\w+):\s+(.+)$/);
        if (colonMatch) {
            return {
                timestamp: new Date().toISOString(),
                level: colonMatch[1],
                message: colonMatch[2],
                source: 'collector'
            };
        }
        return null;
    }
    displayLogEntry(entry, source) {
        // Apply filters
        if (this.filters.length > 0) {
            const shouldShow = this.filters.some(filter => {
                const filterLower = filter.toLowerCase();
                return entry.level.toLowerCase().includes(filterLower) ||
                    entry.message.toLowerCase().includes(filterLower) ||
                    source.toLowerCase().includes(filterLower);
            });
            if (!shouldShow) {
                return;
            }
        }
        // Format timestamp
        const timestamp = this.formatTimestamp(entry.timestamp);
        // Get level symbol and color
        const levelInfo = this.getLevelInfo(entry.level);
        // Format the output
        const output = `${timestamp} ${levelInfo.symbol} [${source.toUpperCase()}] ${entry.message}`;
        console.log(output);
    }
    displayAlert(alertData) {
        // Apply filters
        if (this.filters.length > 0) {
            const shouldShow = this.filters.some(filter => {
                const filterLower = filter.toLowerCase();
                return alertData.level?.toLowerCase().includes(filterLower) ||
                    alertData.title?.toLowerCase().includes(filterLower) ||
                    alertData.message?.toLowerCase().includes(filterLower);
            });
            if (!shouldShow) {
                return;
            }
        }
        // Format timestamp
        const timestamp = this.formatTimestamp(alertData.timestamp);
        // Get level symbol and color
        const levelInfo = this.getLevelInfo(alertData.level);
        // Format the output
        const output = `${timestamp} ${levelInfo.symbol} [ALERT] ${alertData.title}: ${alertData.message}`;
        console.log(output);
        // Show context if available
        if (alertData.context && Object.keys(alertData.context).length > 0) {
            const contextStr = Object.entries(alertData.context)
                .map(([key, value]) => `${key}=${value}`)
                .join(', ');
            console.log(`   Context: ${contextStr}`);
        }
    }
    displayRawLine(line, source) {
        // Apply filters
        if (this.filters.length > 0) {
            const shouldShow = this.filters.some(filter => {
                const filterLower = filter.toLowerCase();
                return line.toLowerCase().includes(filterLower) ||
                    source.toLowerCase().includes(filterLower);
            });
            if (!shouldShow) {
                return;
            }
        }
        const timestamp = this.formatTimestamp(new Date().toISOString());
        console.log(`${timestamp} 📝 [${source.toUpperCase()}] ${line}`);
    }
    formatTimestamp(timestamp) {
        try {
            const date = new Date(timestamp);
            return date.toLocaleTimeString('en-US', {
                hour12: false,
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                fractionalSecondDigits: 3
            });
        }
        catch {
            return timestamp;
        }
    }
    getLevelInfo(level) {
        const levelUpper = level.toUpperCase();
        switch (levelUpper) {
            case 'DRIFT':
                return { symbol: '⚠️', color: 'yellow' };
            case 'ERROR':
                return { symbol: '❌', color: 'red' };
            case 'WARN':
            case 'WARNING':
                return { symbol: '⚠️', color: 'yellow' };
            case 'INFO':
                return { symbol: 'ℹ️', color: 'blue' };
            case 'DEBUG':
                return { symbol: '🔍', color: 'gray' };
            case 'SUCCESS':
                return { symbol: '✅', color: 'green' };
            default:
                return { symbol: '📝', color: 'white' };
        }
    }
}
// Main execution
function main() {
    const tailer = new LogTailer();
    tailer.start();
}
if (require.main === module) {
    main();
}
//# sourceMappingURL=tail.js.map