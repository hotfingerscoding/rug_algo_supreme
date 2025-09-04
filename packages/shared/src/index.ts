import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Logger utility
export class Logger {
  private logFile: string;
  private level: string;
  private enableFileLogging: boolean;

  constructor(logFile?: string, level: string = 'info') {
    this.logFile = logFile || process.env.LOG_PATH || './logs/collector.log';
    this.level = level;
    this.enableFileLogging = !!process.env.LOG_PATH || !!logFile;
    
    // Ensure log directory exists
    if (this.enableFileLogging) {
      const logDir = path.dirname(this.logFile);
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }
    }
  }

  private log(level: string, message: string, ...args: any[]): void {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message} ${args.length > 0 ? JSON.stringify(args) : ''}`;
    
    // Always log to console
    console.log(logMessage);
    
    // Log to file if enabled
    if (this.enableFileLogging && this.logFile) {
      try {
        fs.appendFileSync(this.logFile, logMessage + '\n');
      } catch (error) {
        console.error('Failed to write to log file:', error);
      }
    }
  }

  info(message: string, ...args: any[]): void {
    this.log('info', message, ...args);
  }

  warn(message: string, ...args: any[]): void {
    this.log('warn', message, ...args);
  }

  error(message: string, ...args: any[]): void {
    this.log('error', message, ...args);
  }

  debug(message: string, ...args: any[]): void {
    if (this.level === 'debug') {
      this.log('debug', message, ...args);
    }
  }

  // Special method for drift warnings
  drift(message: string, ...args: any[]): void {
    const driftMessage = `[DRIFT] ${message}`;
    this.warn(driftMessage, ...args);
  }

  // Log drift warnings with special formatting
  driftWarning(message: string, ...args: any[]): void {
    const driftMessage = `⚠️  ${message}`;
    this.drift(driftMessage, ...args);
  }
}

// Time utilities
export const timeUtils = {
  now(): number {
    return Date.now();
  },

  nowSeconds(): number {
    return Math.floor(Date.now() / 1000);
  },

  msToSeconds(ms: number): number {
    return ms / 1000;
  },

  secondsToMs(seconds: number): number {
    return seconds * 1000;
  },

  formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }
};

// SQLite helper
export class SQLiteHelper {
  private db: Database.Database;
  private logger: Logger;

  constructor(dbPath: string, logger?: Logger) {
    this.db = new Database(dbPath);
    this.logger = logger || new Logger();
  }

  async setupTables(): Promise<void> {
    // Import migrations here to avoid circular dependency
    const { runMigrations } = await import('./migrations');
    await runMigrations(this.db, this.logger);
  }

  insertRound(round: any): number {
    const stmt = this.db.prepare(`
      INSERT INTO rounds (started_at, ended_at, max_x, min_x, avg_x, rug_time_s, rug_x, players, total_wager)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    const result = stmt.run(
      round.started_at,
      round.ended_at,
      round.max_x,
      round.min_x,
      round.avg_x,
      round.rug_time_s,
      round.rug_x,
      round.players,
      round.total_wager
    );
    
    return result.lastInsertRowid as number;
  }

  insertTick(tick: any): void {
    const stmt = this.db.prepare(`
      INSERT INTO ticks (round_id, ts, phase, x, timer, players, totalWager, source)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      tick.round_id,
      tick.ts,
      tick.phase,
      tick.x,
      tick.timer,
      tick.players,
      tick.totalWager,
      tick.source || 'dom'
    );
  }

  insertWSFrame(frame: any): void {
    const stmt = this.db.prepare(`
      INSERT INTO ws (ts, dir, data)
      VALUES (?, ?, ?)
    `);
    
    stmt.run(frame.ts, frame.dir, frame.data);
  }

  insertEvent(event: any): void {
    const stmt = this.db.prepare(`
      INSERT INTO events (ts, type, round_key, x, timer, players, wager, raw_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      event.ts,
      event.type,
      event.round_key,
      event.x,
      event.timer,
      event.players,
      event.wager,
      event.raw_json
    );
  }

  insertSidebetWindows(roundId: number, windows: any[]): void {
    const stmt = this.db.prepare(`
      INSERT INTO sidebet_windows (round_id, window_idx, start_s, end_s, rug_in_window)
      VALUES (?, ?, ?, ?, ?)
    `);
    
    for (const window of windows) {
      stmt.run(
        roundId,
        window.window_idx,
        window.start_s,
        window.end_s,
        window.rug_in_window ? 1 : 0
      );
    }
  }

  updateRound(roundId: number, updates: any): void {
    const fields = Object.keys(updates).filter(key => key !== 'id');
    const setClause = fields.map(field => `${field} = ?`).join(', ');
    const values = fields.map(field => updates[field]);
    
    const stmt = this.db.prepare(`
      UPDATE rounds SET ${setClause} WHERE id = ?
    `);
    
    stmt.run(...values, roundId);
  }

  getRounds(): any[] {
    return this.db.prepare('SELECT * FROM rounds ORDER BY started_at').all();
  }

  getTicks(roundId?: number): any[] {
    if (roundId) {
      return this.db.prepare('SELECT * FROM ticks WHERE round_id = ? ORDER BY ts').all(roundId);
    }
    return this.db.prepare('SELECT * FROM ticks ORDER BY ts').all();
  }

  getWSFrames(): any[] {
    return this.db.prepare('SELECT * FROM ws ORDER BY ts').all();
  }

  getEvents(): any[] {
    return this.db.prepare('SELECT * FROM events ORDER BY ts').all();
  }

  getSidebetWindows(): any[] {
    return this.db.prepare('SELECT * FROM sidebet_windows ORDER BY round_id, window_idx').all();
  }

  close(): void {
    this.db.close();
  }
}

// Config loader
export class Config {
  private static instance: Config;
  private config: Record<string, any>;

  private constructor() {
    this.config = {
      HEADLESS: process.env.HEADLESS === 'true',
      POLL_MS: parseInt(process.env.POLL_MS || '200'),
      TARGET_URL: process.env.TARGET_URL || 'https://rugs.fun',
      DB_PATH: process.env.DB_PATH || '../../data/rugs.sqlite',
      MODEL_PATH: process.env.MODEL_PATH || './data/model.json',
      API_HOST: process.env.API_HOST || '0.0.0.0',
      API_PORT: parseInt(process.env.API_PORT || '8000'),
      LOG_LEVEL: process.env.LOG_LEVEL || 'info',
      LOG_PATH: process.env.LOG_PATH || './logs/collector.log',
      DRIFT_THRESHOLD: parseInt(process.env.DRIFT_THRESHOLD || '10'),
      END_GUARD_POLLS: parseInt(process.env.END_GUARD_POLLS || '1'),
      LIVE_CONFIRM_POLLS: parseInt(process.env.LIVE_CONFIRM_POLLS || '2'),
    };
  }

  static getInstance(): Config {
    if (!Config.instance) {
      Config.instance = new Config();
    }
    return Config.instance;
  }

  get(key: string): any {
    return this.config[key];
  }

  getAll(): Record<string, any> {
    return { ...this.config };
  }
}

// Export migrations
export * from './migrations';

// Export alert system
export * from './alert';

// Export default instances
export const logger = new Logger();
export const config = Config.getInstance();
