"use strict";
/**
 * Job Schedule Configuration
 * Cron patterns can be overridden by environment variables
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.jobDependencies = exports.jobTimeouts = exports.jobDescriptions = exports.schedule = void 0;
exports.schedule = {
    // Export CSV data every 15 minutes
    exportCSV: process.env.JOB_EXPORT_CSV || "*/15 * * * *",
    // Train models daily at 03:05
    trainDaily: process.env.JOB_TRAIN_DAILY || "5 3 * * *",
    // Check for drift every 30 minutes
    driftCheck: process.env.JOB_DRIFT_CHECK || "*/30 * * * *",
    // Backup database hourly
    backupHourly: process.env.JOB_BACKUP_HOURLY || "0 * * * *",
    // Rotate old files daily at 03:10
    rotateDaily: process.env.JOB_ROTATE_DAILY || "10 3 * * *",
};
// Job descriptions for logging
exports.jobDescriptions = {
    exportCSV: "Export CSV data from database",
    trainDaily: "Train new models on collected data",
    driftCheck: "Check for model drift",
    backupHourly: "Create database backup",
    rotateDaily: "Rotate old backups and exports",
};
// Job timeouts (in milliseconds)
exports.jobTimeouts = {
    exportCSV: 5 * 60 * 1000, // 5 minutes
    trainDaily: 30 * 60 * 1000, // 30 minutes
    driftCheck: 10 * 60 * 1000, // 10 minutes
    backupHourly: 5 * 60 * 1000, // 5 minutes
    rotateDaily: 2 * 60 * 1000, // 2 minutes
};
// Job dependencies (jobs that should run before others)
exports.jobDependencies = {
    trainDaily: [], // No dependencies
    driftCheck: [], // No dependencies
    exportCSV: [], // No dependencies
    backupHourly: [], // No dependencies
    rotateDaily: [], // No dependencies
};
//# sourceMappingURL=schedule.config.js.map