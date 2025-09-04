#!/usr/bin/env node
"use strict";
/**
 * Backup Job for Rugs Research
 * Creates SQLite database backups
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runBackup = runBackup;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const shared_1 = require("@rugs-research/shared");
const logger = new shared_1.Logger('backup-job');
async function runBackup() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19); // YYYY-MM-DDTHH-MM-SS
    const sourceDb = path_1.default.join('data', 'rugs.sqlite');
    const backupName = `rugs-${timestamp}.sqlite`;
    const backupPath = path_1.default.join('backups', backupName);
    logger.info(`Starting database backup - ${backupName}`);
    try {
        // Ensure backups directory exists
        const backupsDir = path_1.default.join('backups');
        if (!fs_1.default.existsSync(backupsDir)) {
            fs_1.default.mkdirSync(backupsDir, { recursive: true });
        }
        // Check if source database exists
        if (!fs_1.default.existsSync(sourceDb)) {
            throw new Error(`Source database not found: ${sourceDb}`);
        }
        // Get source database size
        const sourceStats = fs_1.default.statSync(sourceDb);
        const sourceSize = sourceStats.size;
        logger.info(`Source database size: ${(sourceSize / 1024 / 1024).toFixed(2)} MB`);
        // Create backup using file copy (with brief read pause for consistency)
        const startTime = Date.now();
        // Read source file
        const sourceData = fs_1.default.readFileSync(sourceDb);
        // Write to backup location
        fs_1.default.writeFileSync(backupPath, sourceData);
        const duration = Date.now() - startTime;
        // Verify backup
        const backupStats = fs_1.default.statSync(backupPath);
        const backupSize = backupStats.size;
        if (backupSize !== sourceSize) {
            throw new Error(`Backup size mismatch: source=${sourceSize}, backup=${backupSize}`);
        }
        // Create backup metadata
        const backupMetadata = {
            backup_date: new Date().toISOString(),
            backup_file: backupName,
            source_database: sourceDb,
            source_size_bytes: sourceSize,
            backup_size_bytes: backupSize,
            backup_duration_ms: duration,
            backup_type: 'file_copy'
        };
        const metadataPath = path_1.default.join('backups', `backup-${timestamp}.json`);
        fs_1.default.writeFileSync(metadataPath, JSON.stringify(backupMetadata, null, 2));
        logger.info(`Backup completed successfully in ${duration}ms. Size: ${(backupSize / 1024 / 1024).toFixed(2)} MB`);
        // Send success alert
        await (0, shared_1.sendInfoAlert)('Database Backup Completed', `Database backup created successfully: ${backupName}`, {
            backup_file: backupName,
            backup_size_mb: (backupSize / 1024 / 1024).toFixed(2),
            duration_ms: duration
        });
    }
    catch (error) {
        const errorMessage = error.message || 'Unknown error';
        logger.error(`Backup failed: ${errorMessage}`);
        // Send error alert
        await (0, shared_1.sendErrorAlert)('Database Backup Failed', `Backup failed: ${errorMessage}`, { error: errorMessage, backup_name: backupName });
        throw error;
    }
}
// Run if called directly
if (require.main === module) {
    runBackup().catch(error => {
        console.error('Backup job failed:', error);
        process.exit(1);
    });
}
//# sourceMappingURL=backup.js.map