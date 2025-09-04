#!/usr/bin/env node
"use strict";
/**
 * Export Job for Rugs Research
 * Exports CSV data with timestamped directories
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runExport = runExport;
const child_process_1 = require("child_process");
const util_1 = require("util");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const shared_1 = require("@rugs-research/shared");
const execAsync = (0, util_1.promisify)(child_process_1.exec);
const logger = new shared_1.Logger('export-job');
async function runExport() {
    const timestamp = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const exportDir = path_1.default.join('data', 'exports', timestamp);
    logger.info(`Starting CSV export to ${exportDir}`);
    try {
        // Create export directory
        if (!fs_1.default.existsSync(exportDir)) {
            fs_1.default.mkdirSync(exportDir, { recursive: true });
        }
        // Run the existing CSV export script
        const { stdout, stderr } = await execAsync('pnpm --filter collector export:csv', {
            cwd: process.cwd(),
            timeout: 5 * 60 * 1000 // 5 minutes
        });
        if (stderr) {
            logger.warn(`Export warnings: ${stderr}`);
        }
        // Move exported files to timestamped directory
        const sourceDir = path_1.default.join('data', 'exports');
        const files = fs_1.default.readdirSync(sourceDir).filter(file => file.endsWith('.csv'));
        for (const file of files) {
            const sourcePath = path_1.default.join(sourceDir, file);
            const destPath = path_1.default.join(exportDir, file);
            if (fs_1.default.existsSync(sourcePath)) {
                fs_1.default.renameSync(sourcePath, destPath);
                logger.info(`Moved ${file} to ${exportDir}`);
            }
        }
        // Create metadata file
        const metadata = {
            export_date: new Date().toISOString(),
            export_directory: exportDir,
            files_exported: files,
            source_database: 'data/rugs.sqlite',
            export_type: 'csv'
        };
        const metadataPath = path_1.default.join(exportDir, 'export-metadata.json');
        fs_1.default.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
        logger.info(`Export completed successfully. ${files.length} files exported to ${exportDir}`);
        // Send success alert
        await (0, shared_1.sendInfoAlert)('CSV Export Completed', `Exported ${files.length} CSV files to ${exportDir}`, {
            files_exported: files.length,
            export_directory: exportDir,
            files: files
        });
    }
    catch (error) {
        const errorMessage = error.message || 'Unknown error';
        logger.error(`Export failed: ${errorMessage}`);
        // Send error alert
        await (0, shared_1.sendInfoAlert)('CSV Export Failed', `Export failed: ${errorMessage}`, { error: errorMessage, export_directory: exportDir });
        throw error;
    }
}
// Run if called directly
if (require.main === module) {
    runExport().catch(error => {
        console.error('Export job failed:', error);
        process.exit(1);
    });
}
//# sourceMappingURL=export.js.map