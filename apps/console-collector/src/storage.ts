import Database from 'better-sqlite3';
import { writeFileSync, appendFileSync, existsSync, mkdirSync, statSync } from 'fs';
import { join } from 'path';
import { RoundAggregate, ConsoleEvent } from './types';
import config, { getDbPath, getJsonlPath, getJsonlRotatedPath } from './config';
import { generateEventKey, extractEventKeyComponents } from './utils/eventKey';

export class Storage {
  private db: Database.Database;
  private jsonlPath: string;
  private roundsInsertStmt!: Database.Statement;
  private eventsInsertStmt!: Database.Statement;
  private roundsUpsertStmt!: Database.Statement;
  private eventsInsertWithKeyStmt!: Database.Statement;
  
  // Metrics tracking
  private metrics = {
    eventsInserted: 0,
    eventsDuplicated: 0,
    eventsSourceWs: 0,
    eventsSourceConsole: 0,
  };

  constructor() {
    // Ensure data directory exists
    if (!existsSync(config.DATA_DIR)) {
      mkdirSync(config.DATA_DIR, { recursive: true });
    }

    // Initialize SQLite database
    const dbPath = getDbPath();
    this.db = new Database(dbPath);
    this.jsonlPath = getJsonlPath();

    this.initializeDatabase();
  }

  private initializeDatabase() {
    // Run migrations
    this.runMigrations();
    
    // Create tables if they don't exist
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS rounds (
        round_id TEXT PRIMARY KEY,
        start_at TEXT NOT NULL,
        end_at TEXT NOT NULL,
        trades INTEGER DEFAULT 0,
        side_bets INTEGER DEFAULT 0,
        total_buy_qty REAL DEFAULT 0,
        total_sell_qty REAL DEFAULT 0,
        net_qty REAL DEFAULT 0,
        total_side_bet_amount REAL DEFAULT 0,
        total_side_bet_payout REAL DEFAULT 0,
        unique_players INTEGER DEFAULT 0,
        last_status TEXT,
        tick_min INTEGER,
        tick_max INTEGER,
        game_ids TEXT
      );

      CREATE TABLE IF NOT EXISTS events (
        event_key TEXT UNIQUE,
        created_at TEXT NOT NULL,
        type TEXT NOT NULL,
        source TEXT NOT NULL,
        payload_json TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);
      CREATE INDEX IF NOT EXISTS idx_events_created_at ON events(created_at);
      CREATE INDEX IF NOT EXISTS idx_rounds_start ON rounds(start_at);
      
      CREATE TABLE IF NOT EXISTS round_features (
        id TEXT PRIMARY KEY,
        startAt TEXT NOT NULL,
        endAt TEXT NOT NULL,
        durationSec REAL,
        cooldownSec REAL,
        boundary_reason TEXT NOT NULL,
        gameIds TEXT,
        numTrades INTEGER,
        numSideBets INTEGER,
        uniquePlayers INTEGER,
        uniqueUsernames INTEGER,
        totalSideBet REAL,
        totalQtyBuy REAL,
        totalQtySell REAL,
        netQty REAL,
        tickMin INTEGER,
        tickMax INTEGER,
        avgBetSize REAL,
        maxWager REAL,
        tradeIntensity REAL,
        volatility REAL
      );
      
      CREATE INDEX IF NOT EXISTS idx_round_features_start ON round_features(startAt);
    `);

    // Prepare statements
    this.roundsInsertStmt = this.db.prepare(`
      INSERT INTO rounds (
        round_id, start_at, end_at, trades, side_bets, total_buy_qty, total_sell_qty,
        net_qty, total_side_bet_amount, total_side_bet_payout, unique_players,
        last_status, tick_min, tick_max, game_ids
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // Legacy statement for backward compatibility (will be removed in future)
    this.eventsInsertStmt = this.db.prepare(`
      INSERT INTO events (event_key, created_at, type, source, payload_json) 
      VALUES (?, ?, ?, ?, ?)
    `);

    this.eventsInsertWithKeyStmt = this.db.prepare(`
      INSERT OR IGNORE INTO events (event_key, created_at, type, source, payload_json) 
      VALUES (?, ?, ?, ?, ?)
    `);

    this.roundsUpsertStmt = this.db.prepare(`
      INSERT OR REPLACE INTO rounds (
        round_id, start_at, end_at, trades, side_bets, total_buy_qty, total_sell_qty,
        net_qty, total_side_bet_amount, total_side_bet_payout, unique_players,
        last_status, tick_min, tick_max, game_ids
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
  }

  /**
   * Run database migrations
   */
  private runMigrations() {
    try {
      // Check if we need to migrate from old schema
      const hasOldEventsTable = this.db.prepare(`
        SELECT name FROM sqlite_master WHERE type='table' AND name='events'
      `).get();
      
      if (hasOldEventsTable) {
        const hasOldSchema = this.db.prepare(`
          PRAGMA table_info(events)
        `).all().some((col: any) => col.name === 'ts');
        
        if (hasOldSchema) {
          console.log('🔄 Migrating events table to new schema...');
          
          // Create new table with new schema
          this.db.exec(`
            CREATE TABLE events_new (
              event_key TEXT UNIQUE,
              created_at TEXT NOT NULL,
              type TEXT NOT NULL,
              source TEXT NOT NULL,
              payload_json TEXT NOT NULL
            )
          `);
          
          // Copy data from old table
          this.db.exec(`
            INSERT INTO events_new (event_key, created_at, type, source, payload_json)
            SELECT 
              'legacy_' || ts || '_' || kind || '_' || hex(randomblob(4)) as event_key,
              ts as created_at,
              kind as type,
              'console' as source,
              payload as payload_json
            FROM events
          `);
          
          // Drop old table and rename new one
          this.db.exec('DROP TABLE events');
          this.db.exec('ALTER TABLE events_new RENAME TO events');
          
          // Create new indexes
          this.db.exec('CREATE INDEX IF NOT EXISTS idx_events_type ON events(type)');
          this.db.exec('CREATE INDEX IF NOT EXISTS idx_events_created_at ON events(created_at)');
          
          console.log('✅ Events table migration completed');
        }
      }
      
      // Check if round_features needs boundary_reason column
      const hasBoundaryReason = this.db.prepare(`
        PRAGMA table_info(round_features)
      `).all().some((col: any) => col.name === 'boundary_reason');
      
      if (!hasBoundaryReason) {
        console.log('🔄 Adding boundary_reason column to round_features...');
        this.db.exec('ALTER TABLE round_features ADD COLUMN boundary_reason TEXT DEFAULT "pnlDebug"');
        console.log('✅ boundary_reason column added');
      }
      
      // Check if round_features needs computed feature columns
      const hasComputedFeatures = this.db.prepare(`
        PRAGMA table_info(round_features)
      `).all().some((col: any) => col.name === 'avgBetSize');
      
      if (!hasComputedFeatures) {
        console.log('🔄 Adding computed feature columns to round_features...');
        this.db.exec('ALTER TABLE round_features ADD COLUMN avgBetSize REAL DEFAULT 0');
        this.db.exec('ALTER TABLE round_features ADD COLUMN maxWager REAL DEFAULT 0');
        this.db.exec('ALTER TABLE round_features ADD COLUMN tradeIntensity REAL DEFAULT 0');
        this.db.exec('ALTER TABLE round_features ADD COLUMN volatility REAL DEFAULT 0');
        console.log('✅ Computed feature columns added');
      }
      
    } catch (error) {
      console.error('❌ Migration failed:', error);
      throw error;
    }
  }

  /**
   * Store event with deduplication using event key
   */
  insertEventWithDedup(timestamp: string, kind: string, payload: string, source: 'ws' | 'console') {
    try {
      // Parse payload to extract components for event key
      let eventKey: string;
      try {
        const parsedPayload = JSON.parse(payload);
        const components = extractEventKeyComponents(parsedPayload);
        eventKey = generateEventKey(
          components.eventType,
          components.gameId,
          components.playerId,
          components.tickIndex,
          timestamp,
          parsedPayload
        );
      } catch {
        // Fallback for unparseable payloads
        eventKey = generateEventKey(kind, null, null, null, timestamp, payload);
      }
      
      // Try to insert with deduplication
      const result = this.eventsInsertWithKeyStmt.run(
        eventKey,
        timestamp,
        kind,
        source,
        payload
      );
      
      if (result.changes > 0) {
        this.metrics.eventsInserted++;
        if (source === 'ws') this.metrics.eventsSourceWs++;
        else this.metrics.eventsSourceConsole++;
        
        // Check if JSONL rotation is needed
        this.rotateJsonlIfNeeded();
      } else {
        this.metrics.eventsDuplicated++;
      }
      
    } catch (error) {
      console.error('Failed to insert event with dedup:', error);
    }
  }

  /**
   * Legacy method for backward compatibility
   */
  storeEvent(event: ConsoleEvent) {
    try {
      this.eventsInsertStmt.run(
        event.timestamp,
        event.type,
        JSON.stringify(event)
      );
    } catch (error) {
      console.error('Failed to store event:', error);
    }
  }

  storeRound(round: RoundAggregate) {
    try {
      // Store in SQLite
      this.roundsUpsertStmt.run(
        round.roundId,
        round.startAt,
        round.endAt,
        round.counts.trades,
        round.counts.sideBets,
        round.sums.totalBuyQty,
        round.sums.totalSellQty,
        round.sums.netQty,
        round.sums.totalSideBetAmount,
        round.sums.totalSideBetPayout,
        round.uniquePlayers,
        round.lastStatus,
        round.tickMin,
        round.tickMax,
        JSON.stringify(round.gameIds)
      );

      // Append to JSONL
      const jsonlLine = JSON.stringify(round) + '\n';
      appendFileSync(this.jsonlPath, jsonlLine, 'utf8');

      console.log(`Round ${round.roundId} stored: trades=${round.counts.trades}, sideBets=${round.counts.sideBets}, players=${round.uniquePlayers}, netQty=${round.sums.netQty.toFixed(2)}, tickRange=[${round.tickMin},${round.tickMax}]`);
    } catch (error) {
      console.error('Failed to store round:', error);
    }
  }

  getRoundCount(): number {
    try {
      const result = this.db.prepare('SELECT COUNT(*) as count FROM rounds').get() as { count: number };
      return result.count;
    } catch (error) {
      console.error('Failed to get round count:', error);
      return 0;
    }
  }

  getLastRound(): RoundAggregate | null {
    try {
      const result = this.db.prepare(`
        SELECT * FROM rounds 
        ORDER BY start_at DESC 
        LIMIT 1
      `).get() as any;

      if (!result) return null;

      return {
        roundId: result.round_id,
        startAt: result.start_at,
        endAt: result.end_at,
        counts: {
          trades: result.trades,
          sideBets: result.side_bets
        },
        sums: {
          totalBuyQty: result.total_buy_qty,
          totalSellQty: result.total_sell_qty,
          netQty: result.net_qty,
          totalSideBetAmount: result.total_side_bet_amount,
          totalSideBetPayout: result.total_side_bet_payout
        },
        uniquePlayers: result.unique_players,
        lastStatus: result.last_status,
        tickMin: result.tick_min,
        tickMax: result.tick_max,
        gameIds: JSON.parse(result.game_ids || '[]')
      };
    } catch (error) {
      console.error('Failed to get last round:', error);
      return null;
    }
  }

  /**
   * Rotate JSONL file if it exceeds size limit
   */
  private rotateJsonlIfNeeded() {
    try {
      if (!existsSync(this.jsonlPath)) return;
      
      const stats = statSync(this.jsonlPath);
      const sizeMB = stats.size / (1024 * 1024);
      
      if (sizeMB > config.MAX_JSONL_MB) {
        const date = new Date().toISOString().split('T')[0];
        let increment = 1;
        let rotatedPath: string;
        
        // Find next available increment
        do {
          rotatedPath = getJsonlRotatedPath(date, increment);
          increment++;
        } while (existsSync(rotatedPath));
        
        // Rename current file
        const fs = require('fs');
        fs.renameSync(this.jsonlPath, rotatedPath);
        
        console.log(`📁 Rotated JSONL: ${this.jsonlPath} → ${rotatedPath} (${sizeMB.toFixed(1)}MB)`);
        
        // Create new empty file
        fs.writeFileSync(this.jsonlPath, '');
      }
    } catch (error) {
      console.error('Failed to rotate JSONL:', error);
    }
  }

  /**
   * Clean up old events based on retention policy
   */
  pruneOldEvents() {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - config.RETENTION_DAYS);
      const cutoffISO = cutoffDate.toISOString();
      
      // Count events to be deleted
      const countResult = this.db.prepare(`
        SELECT COUNT(*) as count FROM events WHERE created_at < ?
      `).get(cutoffISO) as { count: number };
      
      // Delete old events
      const deleteResult = this.db.prepare(`
        DELETE FROM events WHERE created_at < ?
      `).run(cutoffISO);
      
      // VACUUM to reclaim space
      this.db.exec('VACUUM');
      
      console.log(`🧹 Pruned ${deleteResult.changes} events older than ${cutoffISO} (retention: ${config.RETENTION_DAYS} days)`);
      
      return {
        eventsDeleted: deleteResult.changes,
        eventsRemaining: countResult.count - deleteResult.changes,
        cutoffDate: cutoffISO
      };
    } catch (error) {
      console.error('Failed to prune old events:', error);
      return null;
    }
  }

  /**
   * Get storage statistics
   */
  getStorageStats() {
    try {
      const dbPath = getDbPath();
      const dbStats = existsSync(dbPath) ? statSync(dbPath) : null;
      const jsonlStats = existsSync(this.jsonlPath) ? statSync(this.jsonlPath) : null;
      
      return {
        database: {
          path: dbPath,
          size: dbStats ? (dbStats.size / (1024 * 1024)).toFixed(2) + 'MB' : 'N/A',
          exists: !!dbStats
        },
        jsonl: {
          path: this.jsonlPath,
          size: jsonlStats ? (jsonlStats.size / (1024 * 1024)).toFixed(2) + 'MB' : 'N/A',
          exists: !!jsonlStats
        },
        metrics: { ...this.metrics },
        retention: {
          days: config.RETENTION_DAYS,
          maxJsonlMB: config.MAX_JSONL_MB
        }
      };
    } catch (error) {
      console.error('Failed to get storage stats:', error);
      return null;
    }
  }

  clearRounds() {
    try {
      this.db.exec('DELETE FROM rounds');
      this.db.exec('DELETE FROM round_features');
      console.log('Rounds and round_features tables cleared');
    } catch (error) {
      console.error('Failed to clear rounds:', error);
    }
  }

  insertEvent(t: string, kind: string, payload: string) {
    try {
      this.eventsInsertStmt.run(t, kind, payload);
    } catch (error) {
      console.error('Failed to insert event:', error);
    }
  }

  insertRoundFeature(f: any) {
    try {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO round_features
        (id,startAt,endAt,durationSec,cooldownSec,boundary_reason,gameIds,numTrades,numSideBets,uniquePlayers,uniqueUsernames,totalSideBet,totalQtyBuy,totalQtySell,netQty,tickMin,tickMax,avgBetSize,maxWager,tradeIntensity,volatility)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `);
      stmt.run(
        f.id, f.startAt, f.endAt, f.durationSec, f.cooldownSec, f.boundary_reason || 'pnlDebug',
        JSON.stringify(f.gameIds),
        f.numTrades, f.numSideBets, f.uniquePlayers, f.uniqueUsernames,
        f.totalSideBet, f.totalQtyBuy, f.totalQtySell, f.netQty,
        f.tickMin, f.tickMax,
        f.avgBetSize || 0, f.maxWager || 0, f.tradeIntensity || 0, f.volatility || 0
      );
    } catch (error) {
      console.error('Failed to insert round feature:', error);
    }
  }

  getRoundFeatures() {
    try {
      return this.db.prepare(`SELECT * FROM round_features ORDER BY startAt`).all() as any[];
    } catch (error) {
      console.error('Failed to get round features:', error);
      return [];
    }
  }

  close() {
    this.db.close();
  }
}
