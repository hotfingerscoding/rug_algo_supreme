import Database from 'better-sqlite3';
import { Logger } from './index';

export interface Migration {
  version: string;
  description: string;
  up: (db: Database.Database) => void;
}

/**
 * Run database migrations
 */
export async function runMigrations(db: Database.Database, logger?: Logger): Promise<void> {
  const log = logger || new Logger();
  
  // Create migrations table if it doesn't exist
  db.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      key TEXT PRIMARY KEY,
      value TEXT
    )
  `);

  // Get current schema version
  const getVersionStmt = db.prepare('SELECT value FROM migrations WHERE key = ?');
  const versionResult = getVersionStmt.get('schema_version') as { value: string } | undefined;
  const currentVersion = versionResult?.value || '000';
  
  log.info(`Current schema version: ${currentVersion}`);

  // Define migrations
  const migrations: Migration[] = [
    {
      version: '001',
      description: 'Initial tables (rounds, ticks, ws)',
      up: (db) => {
        // Create rounds table
        db.exec(`
          CREATE TABLE IF NOT EXISTS rounds (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            started_at INTEGER NOT NULL,
            ended_at INTEGER,
            max_x REAL,
            min_x REAL,
            avg_x REAL,
            rug_time_s REAL,
            rug_x REAL,
            players INTEGER,
            total_wager REAL
          )
        `);

        // Create ticks table
        db.exec(`
          CREATE TABLE IF NOT EXISTS ticks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            round_id INTEGER,
            ts INTEGER NOT NULL,
            phase TEXT NOT NULL,
            x REAL,
            timer TEXT,
            players INTEGER,
            totalWager REAL,
            FOREIGN KEY (round_id) REFERENCES rounds (id)
          )
        `);

        // Create WebSocket frames table
        db.exec(`
          CREATE TABLE IF NOT EXISTS ws (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ts INTEGER NOT NULL,
            dir TEXT NOT NULL,
            data TEXT NOT NULL
          )
        `);
      }
    },
    {
      version: '002',
      description: 'Add events table',
      up: (db) => {
        db.exec(`
          CREATE TABLE IF NOT EXISTS events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ts INTEGER NOT NULL,
            type TEXT NOT NULL,
            round_key TEXT,
            x REAL,
            timer REAL,
            players INTEGER,
            wager REAL,
            raw_json TEXT
          )
        `);
      }
    },
    {
      version: '003',
      description: 'Add source column to ticks table',
      up: (db) => {
        // Check if source column already exists
        const tableInfo = db.prepare("PRAGMA table_info(ticks)").all();
        const hasSourceColumn = tableInfo.some((col: any) => col.name === 'source');
        
        if (!hasSourceColumn) {
          db.exec('ALTER TABLE ticks ADD COLUMN source TEXT DEFAULT "dom"');
          log.info('Added source column to ticks table');
        } else {
          log.info('Source column already exists in ticks table');
        }
      }
    },
    {
      version: '004',
      description: 'Add sidebet_windows table',
      up: (db) => {
        db.exec(`
          CREATE TABLE IF NOT EXISTS sidebet_windows(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            round_id INTEGER,
            window_idx INTEGER,
            start_s REAL,
            end_s REAL,
            rug_in_window INTEGER,
            UNIQUE(round_id, window_idx),
            FOREIGN KEY (round_id) REFERENCES rounds (id)
          )
        `);
        log.info('Added sidebet_windows table');
      }
    }
  ];

  // Apply migrations in order
  const insertVersionStmt = db.prepare('INSERT OR REPLACE INTO migrations (key, value) VALUES (?, ?)');
  
  for (const migration of migrations) {
    if (migration.version > currentVersion) {
      log.info(`Applying migration ${migration.version}: ${migration.description}`);
      
      try {
        migration.up(db);
        insertVersionStmt.run('schema_version', migration.version);
        log.info(`Migration ${migration.version} completed successfully`);
      } catch (error) {
        log.error(`Migration ${migration.version} failed:`, error);
        throw error;
      }
    }
  }

  // Get final version
  const finalVersionResult = getVersionStmt.get('schema_version') as { value: string } | undefined;
  const finalVersion = finalVersionResult?.value || '000';
  log.info(`Database schema up to date: version ${finalVersion}`);
}

/**
 * Get current schema version
 */
export function getSchemaVersion(db: Database.Database): string {
  const stmt = db.prepare('SELECT value FROM migrations WHERE key = ?');
  const result = stmt.get('schema_version') as { value: string } | undefined;
  return result?.value || '000';
}

/**
 * Check if migration is needed
 */
export function needsMigration(db: Database.Database): boolean {
  const currentVersion = getSchemaVersion(db);
  return currentVersion === '000';
}
