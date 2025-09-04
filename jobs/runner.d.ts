#!/usr/bin/env node
/**
 * Job Runner for Rugs Research
 * Manages scheduled jobs using cron patterns
 */
interface JobResult {
    success: boolean;
    duration: number;
    output: string;
    error?: string;
}
declare class JobRunner {
    private jobs;
    private isRunning;
    constructor();
    private logJob;
    private runJob;
    private createJob;
    start(): Promise<void>;
    stop(): Promise<void>;
    runJobNow(jobName: string): Promise<JobResult>;
    getJobStatus(): {
        [key: string]: {
            scheduled: boolean;
            running: boolean;
        };
    };
    listJobs(): string[];
}
export { JobRunner };
//# sourceMappingURL=runner.d.ts.map