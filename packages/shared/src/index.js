"use strict";
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
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = exports.logger = exports.Config = exports.SQLiteHelper = exports.timeUtils = exports.Logger = void 0;
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const dotenv_1 = __importDefault(require("dotenv"));
// Load environment variables
dotenv_1.default.config();
// Logger utility
class Logger {
    logFile;
    level;
    enableFileLogging;
    constructor(logFile, level = 'info') {
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
    log(level, message, ...args) {
        const timestamp = new Date().toISOString();
        const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message} ${args.length > 0 ? JSON.stringify(args) : ''}`;
        // Always log to console
        console.log(logMessage);
        // Log to file if enabled
        if (this.enableFileLogging && this.logFile) {
            try {
                fs.appendFileSync(this.logFile, logMessage + '\n');
            }
            catch (error) {
                console.error('Failed to write to log file:', error);
            }
        }
    }
    info(message, ...args) {
        this.log('info', message, ...args);
    }
    warn(message, ...args) {
        this.log('warn', message, ...args);
    }
    error(message, ...args) {
        this.log('error', message, ...args);
    }
    debug(message, ...args) {
        if (this.level === 'debug') {
            this.log('debug', message, ...args);
        }
    }
    // Special method for drift warnings
    drift(message, ...args) {
        const driftMessage = `[DRIFT] ${message}`;
        this.warn(driftMessage, ...args);
    }
    // Log drift warnings with special formatting
    driftWarning(message, ...args) {
        const driftMessage = `⚠️  ${message}`;
        this.drift(driftMessage, ...args);
    }
}
exports.Logger = Logger;
// Time utilities
exports.timeUtils = {
    now() {
        return Date.now();
    },
    nowSeconds() {
        return Math.floor(Date.now() / 1000);
    },
    msToSeconds(ms) {
        return ms / 1000;
    },
    secondsToMs(seconds) {
        return seconds * 1000;
    },
    formatDuration(ms) {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        if (hours > 0) {
            return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
        }
        else if (minutes > 0) {
            return `${minutes}m ${seconds % 60}s`;
        }
        else {
            return `${seconds}s`;
        }
    }
};
// SQLite helper
class SQLiteHelper {
    db;
    logger;
    constructor(dbPath, logger) {
        this.db = new better_sqlite3_1.default(dbPath);
        this.logger = logger || new Logger();
    }
    async setupTables() {
        // Import migrations here to avoid circular dependency
        const { runMigrations } = await Promise.resolve().then(() => __importStar(require('./migrations')));
        await runMigrations(this.db, this.logger);
    }
    insertRound(round) {
        const stmt = this.db.prepare(`
      INSERT INTO rounds (started_at, ended_at, max_x, min_x, avg_x, rug_time_s, rug_x, players, total_wager)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
        const result = stmt.run(round.started_at, round.ended_at, round.max_x, round.min_x, round.avg_x, round.rug_time_s, round.rug_x, round.players, round.total_wager);
        return result.lastInsertRowid;
    }
    insertTick(tick) {
        const stmt = this.db.prepare(`
      INSERT INTO ticks (round_id, ts, phase, x, timer, players, totalWager, source)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
        stmt.run(tick.round_id, tick.ts, tick.phase, tick.x, tick.timer, tick.players, tick.totalWager, tick.source || 'dom');
    }
    insertWSFrame(frame) {
        const stmt = this.db.prepare(`
      INSERT INTO ws (ts, dir, data)
      VALUES (?, ?, ?)
    `);
        stmt.run(frame.ts, frame.dir, frame.data);
    }
    insertEvent(event) {
        const stmt = this.db.prepare(`
      INSERT INTO events (ts, type, round_key, x, timer, players, wager, raw_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
        stmt.run(event.ts, event.type, event.round_key, event.x, event.timer, event.players, event.wager, event.raw_json);
    }
    insertSidebetWindows(roundId, windows) {
        const stmt = this.db.prepare(`
      INSERT INTO sidebet_windows (round_id, window_idx, start_s, end_s, rug_in_window)
      VALUES (?, ?, ?, ?, ?)
    `);
        for (const window of windows) {
            stmt.run(roundId, window.window_idx, window.start_s, window.end_s, window.rug_in_window ? 1 : 0);
        }
    }
    updateRound(roundId, updates) {
        const fields = Object.keys(updates).filter(key => key !== 'id');
        const setClause = fields.map(field => `${field} = ?`).join(', ');
        const values = fields.map(field => updates[field]);
        const stmt = this.db.prepare(`
      UPDATE rounds SET ${setClause} WHERE id = ?
    `);
        stmt.run(...values, roundId);
    }
    getRounds() {
        return this.db.prepare('SELECT * FROM rounds ORDER BY started_at').all();
    }
    getTicks(roundId) {
        if (roundId) {
            return this.db.prepare('SELECT * FROM ticks WHERE round_id = ? ORDER BY ts').all(roundId);
        }
        return this.db.prepare('SELECT * FROM ticks ORDER BY ts').all();
    }
    getWSFrames() {
        return this.db.prepare('SELECT * FROM ws ORDER BY ts').all();
    }
    getEvents() {
        return this.db.prepare('SELECT * FROM events ORDER BY ts').all();
    }
    getSidebetWindows() {
        return this.db.prepare('SELECT * FROM sidebet_windows ORDER BY round_id, window_idx').all();
    }
    close() {
        this.db.close();
    }
}
exports.SQLiteHelper = SQLiteHelper;
// Config loader
class Config {
    static instance;
    config;
    constructor() {
        this.config = {
            HEADLESS: process.env.HEADLESS === 'true',
            POLL_MS: parseInt(process.env.POLL_MS || '200'),
            TARGET_URL: process.env.TARGET_URL || 'https://rugs.fun',
            DB_PATH: process.env.DB_PATH || './data/rugs.sqlite',
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
    static getInstance() {
        if (!Config.instance) {
            Config.instance = new Config();
        }
        return Config.instance;
    }
    get(key) {
        return this.config[key];
    }
    getAll() {
        return { ...this.config };
    }
}
exports.Config = Config;
// Export migrations
__exportStar(require("./migrations"), exports);
// Export alert system
__exportStar(require("./alert"), exports);
// Export default instances
exports.logger = new Logger();
exports.config = Config.getInstance();
//# sourceMappingURL=index.js.map