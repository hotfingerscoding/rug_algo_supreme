#!/usr/bin/env node
/**
 * Export Job for Rugs Research
 * Exports CSV data with timestamped directories
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { Logger, sendInfoAlert } from '@rugs-research/shared';

const execAsync = promisify(exec);
const logger = new Logger('export-job');

async function runExport(): Promise<void> {
  const timestamp = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const exportDir = path.join('data', 'exports', timestamp);
  
  logger.info(`Starting CSV export to ${exportDir}`);

  try {
    // Create export directory
    if (!fs.existsSync(exportDir)) {
      fs.mkdirSync(exportDir, { recursive: true });
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
    const sourceDir = path.join('data', 'exports');
    const files = fs.readdirSync(sourceDir).filter(file => file.endsWith('.csv'));
    
    for (const file of files) {
      const sourcePath = path.join(sourceDir, file);
      const destPath = path.join(exportDir, file);
      
      if (fs.existsSync(sourcePath)) {
        fs.renameSync(sourcePath, destPath);
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

    const metadataPath = path.join(exportDir, 'export-metadata.json');
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

    logger.info(`Export completed successfully. ${files.length} files exported to ${exportDir}`);

    // Send success alert
    await sendInfoAlert(
      'CSV Export Completed',
      `Exported ${files.length} CSV files to ${exportDir}`,
      { 
        files_exported: files.length,
        export_directory: exportDir,
        files: files
      }
    );

  } catch (error: any) {
    const errorMessage = error.message || 'Unknown error';
    logger.error(`Export failed: ${errorMessage}`);
    
    // Send error alert
    await sendInfoAlert(
      'CSV Export Failed',
      `Export failed: ${errorMessage}`,
      { error: errorMessage, export_directory: exportDir }
    );
    
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

export { runExport };
