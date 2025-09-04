#!/usr/bin/env node
"use strict";
/**
 * Training Job for Rugs Research
 * Runs model training and manages model versioning
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runTraining = runTraining;
const child_process_1 = require("child_process");
const util_1 = require("util");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const shared_1 = require("@rugs-research/shared");
const execAsync = (0, util_1.promisify)(child_process_1.exec);
const logger = new shared_1.Logger('train-job');
async function runTraining() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19); // YYYY-MM-DDTHH-MM-SS
    const modelName = `model-${timestamp}.json`;
    const metricsName = `metrics-${timestamp}.json`;
    logger.info(`Starting model training - ${modelName}`);
    try {
        // Ensure models directory exists
        const modelsDir = path_1.default.join('models');
        if (!fs_1.default.existsSync(modelsDir)) {
            fs_1.default.mkdirSync(modelsDir, { recursive: true });
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
        const modelPath = path_1.default.join('data', 'model.json');
        const metricsPath = path_1.default.join('data', 'metrics.json');
        if (!fs_1.default.existsSync(modelPath)) {
            throw new Error('Training failed - model.json not found');
        }
        if (!fs_1.default.existsSync(metricsPath)) {
            throw new Error('Training failed - metrics.json not found');
        }
        // Move files to models directory with timestamp
        const newModelPath = path_1.default.join(modelsDir, modelName);
        const newMetricsPath = path_1.default.join(modelsDir, metricsName);
        fs_1.default.copyFileSync(modelPath, newModelPath);
        fs_1.default.copyFileSync(metricsPath, newMetricsPath);
        logger.info(`Model files copied to ${newModelPath} and ${newMetricsPath}`);
        // Read model metrics for alert
        let modelMetrics = {};
        try {
            const metricsContent = fs_1.default.readFileSync(newMetricsPath, 'utf8');
            modelMetrics = JSON.parse(metricsContent);
        }
        catch (error) {
            logger.warn('Could not read model metrics for alert');
        }
        // Update current.json symlink/copy
        const currentPath = path_1.default.join(modelsDir, 'current.json');
        try {
            // Remove existing symlink/file
            if (fs_1.default.existsSync(currentPath)) {
                fs_1.default.unlinkSync(currentPath);
            }
            // Create symlink (or copy on Windows)
            if (process.platform === 'win32') {
                fs_1.default.copyFileSync(newModelPath, currentPath);
            }
            else {
                fs_1.default.symlinkSync(modelName, currentPath);
            }
            logger.info(`Updated current.json to point to ${modelName}`);
        }
        catch (error) {
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
        const metadataPath = path_1.default.join(modelsDir, `training-${timestamp}.json`);
        fs_1.default.writeFileSync(metadataPath, JSON.stringify(trainingMetadata, null, 2));
        logger.info(`Training completed successfully. Model saved as ${modelName}`);
        // Send success alert with model metrics
        const metricsSummary = modelMetrics.models ? {
            '5s_auc': modelMetrics.models['5s']?.roc_auc,
            '10s_auc': modelMetrics.models['10s']?.roc_auc,
            'rounds_used': modelMetrics.rounds_count,
            'training_date': modelMetrics.training_date
        } : {};
        await (0, shared_1.sendInfoAlert)('Model Training Completed', `New model trained successfully: ${modelName}`, {
            model_file: modelName,
            metrics_file: metricsName,
            ...metricsSummary
        });
    }
    catch (error) {
        const errorMessage = error.message || 'Unknown error';
        logger.error(`Training failed: ${errorMessage}`);
        // Send error alert
        await (0, shared_1.sendErrorAlert)('Model Training Failed', `Training failed: ${errorMessage}`, { error: errorMessage, model_name: modelName });
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
//# sourceMappingURL=train.js.map