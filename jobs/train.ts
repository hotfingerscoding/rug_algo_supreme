#!/usr/bin/env node
/**
 * Training Job for Rugs Research
 * Runs model training and manages model versioning
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { Logger, sendInfoAlert, sendErrorAlert } from '@rugs-research/shared';

const execAsync = promisify(exec);
const logger = new Logger('train-job');

async function runTraining(): Promise<void> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19); // YYYY-MM-DDTHH-MM-SS
  const modelName = `model-${timestamp}.json`;
  const metricsName = `metrics-${timestamp}.json`;
  
  logger.info(`Starting model training - ${modelName}`);

  try {
    // Ensure models directory exists
    const modelsDir = path.join('models');
    if (!fs.existsSync(modelsDir)) {
      fs.mkdirSync(modelsDir, { recursive: true });
    }

    // Run the training script
    const { stdout, stderr } = await execAsync('cd apps/analyzer && python train.py', {
      cwd: process.cwd(),
      timeout: 30 * 60 * 1000 // 30 minutes
    });

    if (stderr) {
      logger.warn(`Training warnings: ${stderr}`);
    }

    // Check if training was successful by looking for output files
    const modelPath = path.join('data', 'model.json');
    const metricsPath = path.join('data', 'metrics.json');

    if (!fs.existsSync(modelPath)) {
      throw new Error('Training failed - model.json not found');
    }

    if (!fs.existsSync(metricsPath)) {
      throw new Error('Training failed - metrics.json not found');
    }

    // Move files to models directory with timestamp
    const newModelPath = path.join(modelsDir, modelName);
    const newMetricsPath = path.join(modelsDir, metricsName);

    fs.copyFileSync(modelPath, newModelPath);
    fs.copyFileSync(metricsPath, newMetricsPath);

    logger.info(`Model files copied to ${newModelPath} and ${newMetricsPath}`);

    // Read model metrics for alert
    let modelMetrics = {};
    try {
      const metricsContent = fs.readFileSync(newMetricsPath, 'utf8');
      modelMetrics = JSON.parse(metricsContent);
    } catch (error) {
      logger.warn('Could not read model metrics for alert');
    }

    // Update current.json symlink/copy
    const currentPath = path.join(modelsDir, 'current.json');
    try {
      // Remove existing symlink/file
      if (fs.existsSync(currentPath)) {
        fs.unlinkSync(currentPath);
      }
      
      // Create symlink (or copy on Windows)
      if (process.platform === 'win32') {
        fs.copyFileSync(newModelPath, currentPath);
      } else {
        fs.symlinkSync(modelName, currentPath);
      }
      
      logger.info(`Updated current.json to point to ${modelName}`);
    } catch (error) {
      logger.warn(`Could not update current.json: ${error}`);
    }

    // Create training metadata
    const trainingMetadata = {
      training_date: new Date().toISOString(),
      model_file: modelName,
      metrics_file: metricsName,
      training_output: stdout,
      training_warnings: stderr || null,
      source_database: 'data/rugs.sqlite',
      training_script: 'apps/analyzer/train.py'
    };

    const metadataPath = path.join(modelsDir, `training-${timestamp}.json`);
    fs.writeFileSync(metadataPath, JSON.stringify(trainingMetadata, null, 2));

    logger.info(`Training completed successfully. Model saved as ${modelName}`);

    // Send success alert with model metrics
    const metricsSummary = modelMetrics.models ? {
      '5s_auc': modelMetrics.models['5s']?.roc_auc,
      '10s_auc': modelMetrics.models['10s']?.roc_auc,
      'rounds_used': modelMetrics.rounds_count,
      'training_date': modelMetrics.training_date
    } : {};

    await sendInfoAlert(
      'Model Training Completed',
      `New model trained successfully: ${modelName}`,
      { 
        model_file: modelName,
        metrics_file: metricsName,
        ...metricsSummary
      }
    );

  } catch (error: any) {
    const errorMessage = error.message || 'Unknown error';
    logger.error(`Training failed: ${errorMessage}`);
    
    // Send error alert
    await sendErrorAlert(
      'Model Training Failed',
      `Training failed: ${errorMessage}`,
      { error: errorMessage, model_name: modelName }
    );
    
    throw error;
  }
}

// Run if called directly
if (require.main === module) {
  runTraining().catch(error => {
    console.error('Training job failed:', error);
    process.exit(1);
  });
}

export { runTraining };
