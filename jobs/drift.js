#!/usr/bin/env node
"use strict";
/**
 * Drift Check Job for Rugs Research
 * Runs drift detection and sends alerts
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.runDriftCheck = runDriftCheck;
const child_process_1 = require("child_process");
const util_1 = require("util");
const shared_1 = require("@rugs-research/shared");
const execAsync = (0, util_1.promisify)(child_process_1.exec);
const logger = new shared_1.Logger('drift-job');
async function runDriftCheck() {
    logger.info('Starting drift check');
    try {
        // Run the drift detection script
        const { stdout, stderr } = await execAsync('cd apps/analyzer && python drift.py', {
            cwd: process.cwd(),
            timeout: 10 * 60 * 1000 // 10 minutes
        });
        if (stderr) {
            logger.warn(`Drift check warnings: ${stderr}`);
        }
        // Check exit code to determine if drift was detected
        // The drift.py script should return exit code 2 if drift is detected
        const exitCode = process.exitCode || 0;
        if (exitCode === 2) {
            logger.warn('Drift detected by drift.py');
            // Send drift alert
            await (0, shared_1.sendDriftAlert)('Analyzer Drift', 'Recent distribution diverged > threshold. Suggest retrain.', {
                thresholdPct: process.env.DRIFT_THRESHOLD_PCT || '20',
                recentRounds: '200', // Default from drift.py
                drift_output: stdout
            });
            // Exit with code 2 to indicate drift
            process.exit(2);
        }
        else if (exitCode === 0) {
            logger.info('No drift detected');
            // Send info alert for successful check
            await (0, shared_1.sendInfoAlert)('Drift Check Completed', 'No drift detected in recent data', {
                thresholdPct: process.env.DRIFT_THRESHOLD_PCT || '20',
                recentRounds: '200',
                check_output: stdout
            });
        }
        else {
            logger.error(`Drift check failed with exit code ${exitCode}`);
            throw new Error(`Drift check failed with exit code ${exitCode}`);
        }
    }
    catch (error) {
        const errorMessage = error.message || 'Unknown error';
        logger.error(`Drift check failed: ${errorMessage}`);
        // Send error alert
        await (0, shared_1.sendInfoAlert)('Drift Check Failed', `Drift check failed: ${errorMessage}`, { error: errorMessage });
        throw error;
    }
}
// Run if called directly
if (require.main === module) {
    runDriftCheck().catch(error => {
        console.error('Drift check job failed:', error);
        process.exit(1);
    });
}
//# sourceMappingURL=drift.js.map