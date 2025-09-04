#!/usr/bin/env node
/**
 * Job Runner for Rugs Research
 * Manages scheduled jobs using cron patterns
 */

import cron from 'node-cron';
import { schedule, jobDescriptions, jobTimeouts } from './schedule.config';
import { Logger, initializeAlertManager } from '@rugs-research/shared';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';

const execAsync = promisify(exec);

// Initialize logger
const logger = new Logger('jobs');

// Initialize alert manager
const alertManager = initializeAlertManager(
  logger,
  './logs/alerts.log',
  process.env.ALERT_WEBHOOK_URL,
  parseInt(process.env.ALERT_DEBOUNCE_MIN || '5')
);

interface JobResult {
  success: boolean;
  duration: number;
  output: string;
  error?: string;
}

class JobRunner {
  private jobs: Map<string, cron.ScheduledTask> = new Map();
  private isRunning = false;

  constructor() {
    // Ensure logs directory exists
    const logsDir = path.dirname('./logs/jobs.log');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
  }

  private logJob(message: string): void {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}\n`;
    
    // Write to jobs log
    fs.appendFileSync('./logs/jobs.log', logMessage);
    
    // Also log to console
    logger.info(message);
  }

  private async runJob(jobName: string): Promise<JobResult> {
    const startTime = Date.now();
    this.logJob(`Starting job: ${jobName} - ${jobDescriptions[jobName] || 'No description'}`);

    try {
      // Determine job script based on job name
      let command: string;
      switch (jobName) {
        case 'exportCSV':
          command = 'cd apps/analyzer && python ../scripts/export-csv.py';
          break;
        case 'trainDaily':
          command = 'cd apps/analyzer && python train.py';
          break;
        case 'driftCheck':
          command = 'cd apps/analyzer && python drift.py';
          break;
        case 'backupHourly':
          command = 'cd apps/analyzer && python -c "from jobs.backup import runBackup; runBackup()"';
          break;
        case 'rotateDaily':
          command = 'cd apps/analyzer && python -c "from jobs.rotate import runRotate; runRotate()"';
          break;
        default:
          throw new Error(`Unknown job: ${jobName}`);
      }

      const timeout = jobTimeouts[jobName] || 5 * 60 * 1000; // Default 5 minutes
      
      const { stdout, stderr } = await execAsync(command, {
        timeout,
        cwd: process.cwd()
      });

      const duration = Date.now() - startTime;
      const output = stdout.trim();
      const error = stderr.trim();

      if (error) {
        this.logJob(`Job ${jobName} completed with warnings in ${duration}ms`);
        this.logJob(`Warnings: ${error}`);
      } else {
        this.logJob(`Job ${jobName} completed successfully in ${duration}ms`);
      }

      if (output) {
        this.logJob(`Job ${jobName} output: ${output}`);
      }

      return {
        success: true,
        duration,
        output,
        error: error || undefined
      };

    } catch (error: any) {
      const duration = Date.now() - startTime;
      const errorMessage = error.message || 'Unknown error';
      
      this.logJob(`Job ${jobName} failed after ${duration}ms: ${errorMessage}`);
      
      // Send alert for job failure
      await alertManager.error(
        `Job Failed: ${jobName}`,
        `Job ${jobName} failed after ${duration}ms: ${errorMessage}`,
        { jobName, duration, error: errorMessage }
      );

      return {
        success: false,
        duration,
        output: '',
        error: errorMessage
      };
    }
  }

  private createJob(jobName: string, cronPattern: string): void {
    if (!cron.validate(cronPattern)) {
      logger.error(`Invalid cron pattern for job ${jobName}: ${cronPattern}`);
      return;
    }

    const task = cron.schedule(cronPattern, async () => {
      if (this.isRunning) {
        logger.warn(`Job ${jobName} skipped - another job is running`);
        return;
      }

      this.isRunning = true;
      try {
        await this.runJob(jobName);
      } finally {
        this.isRunning = false;
      }
    }, {
      scheduled: false,
      timezone: "UTC"
    });

    this.jobs.set(jobName, task);
    logger.info(`Scheduled job ${jobName} with pattern: ${cronPattern}`);
  }

  async start(): Promise<void> {
    logger.info('Starting job runner...');

    // Create all scheduled jobs
    for (const [jobName, cronPattern] of Object.entries(schedule)) {
      this.createJob(jobName, cronPattern);
    }

    // Start all jobs
    for (const [jobName, task] of this.jobs) {
      task.start();
      logger.info(`Started job: ${jobName}`);
    }

    logger.info(`Job runner started with ${this.jobs.size} jobs`);
    
    // Send startup alert
    await alertManager.info(
      'Job Runner Started',
      `Job runner started with ${this.jobs.size} scheduled jobs`,
      { jobCount: this.jobs.size, jobs: Array.from(this.jobs.keys()) }
    );
  }

  async stop(): Promise<void> {
    logger.info('Stopping job runner...');

    // Stop all jobs
    for (const [jobName, task] of this.jobs) {
      task.stop();
      logger.info(`Stopped job: ${jobName}`);
    }

    this.jobs.clear();
    logger.info('Job runner stopped');
  }

  async runJobNow(jobName: string): Promise<JobResult> {
    if (!this.jobs.has(jobName)) {
      throw new Error(`Job ${jobName} not found`);
    }

    logger.info(`Running job ${jobName} immediately`);
    return this.runJob(jobName);
  }

  getJobStatus(): { [key: string]: { scheduled: boolean; running: boolean } } {
    const status: { [key: string]: { scheduled: boolean; running: boolean } } = {};
    
    for (const [jobName, task] of this.jobs) {
      status[jobName] = {
        scheduled: task.getStatus() === 'scheduled',
        running: this.isRunning
      };
    }
    
    return status;
  }

  listJobs(): string[] {
    return Array.from(this.jobs.keys());
  }
}

// CLI handling
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const runner = new JobRunner();

  try {
    if (args.includes('--run') || args.includes('-r')) {
      // Run a specific job
      const jobName = args[args.indexOf('--run') + 1] || args[args.indexOf('-r') + 1];
      
      if (!jobName) {
        console.error('Usage: pnpm jobs:run <jobName>');
        console.error('Available jobs:', Object.keys(schedule).join(', '));
        process.exit(1);
      }

      if (!schedule[jobName as keyof typeof schedule]) {
        console.error(`Unknown job: ${jobName}`);
        console.error('Available jobs:', Object.keys(schedule).join(', '));
        process.exit(1);
      }

      const result = await runner.runJobNow(jobName);
      
      if (result.success) {
        console.log(`✅ Job ${jobName} completed successfully`);
        if (result.output) {
          console.log('Output:', result.output);
        }
      } else {
        console.error(`❌ Job ${jobName} failed:`, result.error);
        process.exit(1);
      }

    } else if (args.includes('--list') || args.includes('-l')) {
      // List all jobs
      console.log('Available jobs:');
      for (const [jobName, pattern] of Object.entries(schedule)) {
        console.log(`  ${jobName}: ${pattern} - ${jobDescriptions[jobName] || 'No description'}`);
      }

    } else if (args.includes('--status') || args.includes('-s')) {
      // Show job status
      await runner.start();
      const status = runner.getJobStatus();
      console.log('Job status:');
      for (const [jobName, jobStatus] of Object.entries(status)) {
        console.log(`  ${jobName}: ${jobStatus.scheduled ? 'Scheduled' : 'Stopped'} ${jobStatus.running ? '(Running)' : ''}`);
      }
      await runner.stop();

    } else {
      // Start the scheduler
      console.log('Starting job scheduler...');
      console.log('Press Ctrl+C to stop');
      
      await runner.start();

      // Keep the process running
      process.on('SIGINT', async () => {
        console.log('\nStopping job scheduler...');
        await runner.stop();
        process.exit(0);
      });

      process.on('SIGTERM', async () => {
        console.log('\nStopping job scheduler...');
        await runner.stop();
        process.exit(0);
      });
    }

  } catch (error) {
    console.error('Job runner error:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { JobRunner };
