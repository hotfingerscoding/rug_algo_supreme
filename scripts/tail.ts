#!/usr/bin/env node
/**
 * Log Tail Script
 * Tails logs/collector.log and logs/alerts.log with pretty formatting
 */

import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';

interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  source: string;
}

class LogTailer {
  private collectorLogPath: string;
  private alertsLogPath: string;
  private isRunning: boolean = false;
  private filters: string[] = [];
  
  constructor() {
    this.collectorLogPath = path.join(process.cwd(), 'logs', 'collector.log');
    this.alertsLogPath = path.join(process.cwd(), 'logs', 'alerts.log');
  }

  start() {
    console.log('📋 Rugs Research Log Tailer');
    console.log('=' .repeat(50));
    
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

  private parseArguments() {
    const args = process.argv.slice(2);
    
    for (const arg of args) {
      if (arg.startsWith('--')) {
        const filter = arg.substring(2);
        this.filters.push(filter);
      } else if (arg.startsWith('-')) {
        const filter = arg.substring(1);
        this.filters.push(filter);
      }
    }
    
    if (this.filters.length > 0) {
      console.log(`🔍 Filtering logs for: ${this.filters.join(', ')}`);
    }
  }

  private checkLogFiles() {
    const files = [
      { path: this.collectorLogPath, name: 'collector.log' },
      { path: this.alertsLogPath, name: 'alerts.log' }
    ];
    
    for (const file of files) {
      if (!fs.existsSync(file.path)) {
        console.warn(`⚠️  ${file.name} not found at: ${file.path}`);
        console.warn(`   Create the file or start the collector to see logs`);
      } else {
        console.log(`✅ ${file.name} found`);
      }
    }
    console.log('');
  }

  private tailFile(filePath: string, source: string) {
    if (!fs.existsSync(filePath)) {
      return;
    }
    
    try {
      // Use tail -f command for real-time following
      const tail = spawn('tail', ['-f', filePath]);
      
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
      
    } catch (error) {
      console.error(`❌ Error starting tail for ${source}: ${error}`);
    }
  }

  private processLogLine(line: string, source: string) {
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
      
    } catch (error) {
      // If parsing fails, display as raw line
      this.displayRawLine(line, source);
    }
  }

  private parseCollectorLog(line: string): LogEntry | null {
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

  private displayLogEntry(entry: LogEntry, source: string) {
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

  private displayAlert(alertData: any) {
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

  private displayRawLine(line: string, source: string) {
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

  private formatTimestamp(timestamp: string): string {
    try {
      const date = new Date(timestamp);
      return date.toLocaleTimeString('en-US', { 
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        fractionalSecondDigits: 3
      });
    } catch {
      return timestamp;
    }
  }

  private getLevelInfo(level: string): { symbol: string; color: string } {
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
