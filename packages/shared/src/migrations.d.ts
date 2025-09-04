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
export declare function runMigrations(db: Database.Database, logger?: Logger): Promise<void>;
/**
 * Get current schema version
 */
export declare function getSchemaVersion(db: Database.Database): string;
/**
 * Check if migration is needed
 */
export declare function needsMigration(db: Database.Database): boolean;
//# sourceMappingURL=migrations.d.ts.map