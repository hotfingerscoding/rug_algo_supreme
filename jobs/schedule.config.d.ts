/**
 * Job Schedule Configuration
 * Cron patterns can be overridden by environment variables
 */
export declare const schedule: {
    exportCSV: string;
    trainDaily: string;
    driftCheck: string;
    backupHourly: string;
    rotateDaily: string;
};
export declare const jobDescriptions: {
    exportCSV: string;
    trainDaily: string;
    driftCheck: string;
    backupHourly: string;
    rotateDaily: string;
};
export declare const jobTimeouts: {
    exportCSV: number;
    trainDaily: number;
    driftCheck: number;
    backupHourly: number;
    rotateDaily: number;
};
export declare const jobDependencies: {
    trainDaily: never[];
    driftCheck: never[];
    exportCSV: never[];
    backupHourly: never[];
    rotateDaily: never[];
};
//# sourceMappingURL=schedule.config.d.ts.map