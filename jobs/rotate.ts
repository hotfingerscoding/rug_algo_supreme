#!/usr/bin/env node
/**
 * Rotation Job for Rugs Research
 * Manages retention policies for backups, models, and exports
 */

import fs from 'fs';
import path from 'path';
import { Logger, sendInfoAlert, sendWarnAlert } from '@rugs-research/shared';

const logger = new Logger('rotate-job');

interface RetentionConfig {
  backups: { keep: number };
  models: { keep: number };
  exports: { keep: number };
}

function loadRetentionConfig(): RetentionConfig {
  const configPath = path.join('config', 'retention.json');
  
  if (fs.existsSync(configPath)) {
    try {
      const configContent = fs.readFileSync(configPath, 'utf8');
      return JSON.parse(configContent);
    } catch (error) {
      logger.warn(`Could not load retention config: ${error}. Using defaults.`);
    }
  }
  
  // Default retention policy
  return {
    backups: { keep: 30 },
    models: { keep: 20 },
    exports: { keep: 14 }
  };
}

function getFileAge(filePath: string): number {
  const stats = fs.statSync(filePath);
  return Date.now() - stats.mtime.getTime();
}

function sortFilesByAge(directory: string, pattern: RegExp): Array<{name: string, age: number, path: string}> {
  if (!fs.existsSync(directory)) {
    return [];
  }

  const files = fs.readdirSync(directory)
    .filter(file => pattern.test(file))
    .map(file => {
      const filePath = path.join(directory, file);
      return {
        name: file,
        age: getFileAge(filePath),
        path: filePath
      };
    })
    .sort((a, b) => b.age - a.age); // Sort by age, oldest first

  return files;
}

function deleteOldFiles(
  directory: string, 
  pattern: RegExp, 
  keepCount: number, 
  type: string
): { deleted: number, kept: number } {
  const files = sortFilesByAge(directory, pattern);
  
  if (files.length <= keepCount) {
    logger.info(`No ${type} files to delete (${files.length} <= ${keepCount})`);
    return { deleted: 0, kept: files.length };
  }

  const toDelete = files.slice(keepCount);
  const toKeep = files.slice(0, keepCount);

  let deletedCount = 0;
  for (const file of toDelete) {
    try {
      fs.unlinkSync(file.path);
      logger.info(`Deleted old ${type}: ${file.name}`);
      deletedCount++;
    } catch (error) {
      logger.error(`Failed to delete ${type} ${file.name}: ${error}`);
    }
  }

  logger.info(`Rotation complete for ${type}: deleted ${deletedCount}, kept ${toKeep.length}`);
  return { deleted: deletedCount, kept: toKeep.length };
}

async function runRotate(): Promise<void> {
  logger.info('Starting file rotation');

  try {
    const config = loadRetentionConfig();
    logger.info(`Retention config: backups=${config.backups.keep}, models=${config.models.keep}, exports=${config.exports.keep}`);

    const results = {
      backups: { deleted: 0, kept: 0 },
      models: { deleted: 0, kept: 0 },
      exports: { deleted: 0, kept: 0 }
    };

    // Rotate backups
    results.backups = deleteOldFiles(
      'backups',
      /^rugs-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.sqlite$/,
      config.backups.keep,
      'backup'
    );

    // Rotate models
    results.models = deleteOldFiles(
      'models',
      /^model-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.json$/,
      config.models.keep,
      'model'
    );

    // Also clean up metrics files
    const metricsResults = deleteOldFiles(
      'models',
      /^metrics-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.json$/,
      config.models.keep,
      'metrics'
    );

    // Also clean up training metadata
    const trainingResults = deleteOldFiles(
      'models',
      /^training-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.json$/,
      config.models.keep,
      'training metadata'
    );

    // Rotate exports (daily directories)
    results.exports = deleteOldFiles(
      'data/exports',
      /^\d{4}-\d{2}-\d{2}$/,
      config.exports.keep,
      'export directory'
    );

    // Calculate totals
    const totalDeleted = results.backups.deleted + results.models.deleted + results.exports.deleted;
    const totalKept = results.backups.kept + results.models.kept + results.exports.kept;

    logger.info(`Rotation completed: deleted ${totalDeleted} files, kept ${totalKept} files`);

    // Send summary alert
    if (totalDeleted > 0) {
      await sendInfoAlert(
        'File Rotation Completed',
        `Cleaned up ${totalDeleted} old files, kept ${totalKept} files`,
        {
          backups_deleted: results.backups.deleted,
          backups_kept: results.backups.kept,
          models_deleted: results.models.deleted,
          models_kept: results.models.kept,
          exports_deleted: results.exports.deleted,
          exports_kept: results.exports.kept,
          total_deleted: totalDeleted,
          total_kept: totalKept
        }
      );
    } else {
      await sendInfoAlert(
        'File Rotation Completed',
        'No files needed rotation',
        {
          backups_kept: results.backups.kept,
          models_kept: results.models.kept,
          exports_kept: results.exports.kept,
          total_kept: totalKept
        }
      );
    }

  } catch (error: any) {
    const errorMessage = error.message || 'Unknown error';
    logger.error(`Rotation failed: ${errorMessage}`);
    
    // Send error alert
    await sendWarnAlert(
      'File Rotation Failed',
      `Rotation failed: ${errorMessage}`,
      { error: errorMessage }
    );
    
    throw error;
  }
}

// Run if called directly
if (require.main === module) {
  runRotate().catch(error => {
    console.error('Rotation job failed:', error);
    process.exit(1);
  });
}

export { runRotate };
