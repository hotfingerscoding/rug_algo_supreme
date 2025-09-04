import { chromium, Browser, Page } from '@playwright/test';
import { Logger, SQLiteHelper, config, timeUtils } from '@rugs-research/shared';
import { Tick, Round, WSFrame, TickSchema } from '@rugs-research/schema';
import { selectors } from './config/selectors';
import { inferMessages } from './ws/decoder';
import { mapToEvents } from './ws/mappers';
import { RoundSegmenter, TickData } from './segmentation/segmenter';
import { assertRecentActivity } from './health/sanity';
import * as fs from 'fs';
import * as path from 'path';

// Simple drift tracker for selector validation
class SelectorDriftTracker {
  private missingCounts: Map<string, number> = new Map();
  private driftThreshold: number;

  constructor(driftThreshold: number = 10) {
    this.driftThreshold = driftThreshold;
  }

  checkSelector(name: string, found: boolean): string | null {
    if (!found) {
      const currentCount = this.missingCounts.get(name) || 0;
      const newCount = currentCount + 1;
      this.missingCounts.set(name, newCount);

      if (newCount === this.driftThreshold) {
        return `[DRIFT] Selector '${name}' missing for ${this.driftThreshold} consecutive polls`;
      }
    } else {
      this.missingCounts.delete(name);
    }
    return null;
  }

  getDriftStatus(): { [key: string]: number } {
    const status: { [key: string]: number } = {};
    for (const [name, count] of this.missingCounts.entries()) {
      status[name] = count;
    }
    return status;
  }

  reset(): void {
    this.missingCounts.clear();
  }
}

class RugsCollector {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private db: SQLiteHelper;
  private logger: Logger;
  private isRunning = false;
  private currentRound: Partial<Round & { sidebet_windows?: any[] }> | null = null;
  private roundTicks: Tick[] = [];
  private lastPhase: string = 'unknown';
  private driftTracker: SelectorDriftTracker;

  constructor() {
    this.logger = new Logger(config.get('LOG_PATH'), config.get('LOG_LEVEL'));
    this.db = new SQLiteHelper(config.get('DB_PATH'), this.logger);
    this.driftTracker = new SelectorDriftTracker(config.get('DRIFT_THRESHOLD'));
  }

  private validateSelectors(): void {
    const requiredSelectors = ['multiplier', 'timer', 'players', 'wager', 'status'];
    const missingSelectors: string[] = [];
    
    for (const selector of requiredSelectors) {
      const selectorObj = selectors[selector as keyof typeof selectors];
      if (!selectorObj || !selectorObj.selector || selectorObj.selector.trim() === '') {
        missingSelectors.push(selector);
      }
    }
    
    if (missingSelectors.length > 0) {
      const message = `[SELECTORS] Missing or empty selectors for: ${missingSelectors.join(', ')}.\nRun: pnpm selector:start, click multiplier/timer/players/wager/status, Test ≥90%, then Save & Update.\nIf you already saved, run: pnpm selectors:apply-latest`;
      this.logger.error(message);
      console.error(`❌ ${message}`);
      process.exit(1);
    }
    
    this.logger.info('Selectors validated successfully');
  }

  async start(): Promise<void> {
    try {
      this.logger.info('Starting Rugs Collector...');
      
      // Validate selectors before proceeding
      this.validateSelectors();
      
      // Ensure data directory exists
      const dataDir = path.dirname(config.get('DB_PATH'));
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      // Setup database tables and run migrations
      await this.db.setupTables();
      this.logger.info('Database tables initialized');

      // Check for resume pointers and auto-close unfinished rounds
      await this.handleResume();

      // Launch browser
      this.browser = await chromium.launch({
        headless: config.get('HEADLESS'),
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });

      this.page = await this.browser.newPage();
      
      // Enable CDP for WebSocket monitoring
      const cdpSession = await this.page.context().newCDPSession(this.page);
      await cdpSession.send('Network.enable');
      
      // Listen for WebSocket frames
      cdpSession.on('Network.webSocketFrameReceived', (event) => {
        this.handleWSFrame('in', event.response.payloadData);
      });
      
      cdpSession.on('Network.webSocketFrameSent', (event) => {
        this.handleWSFrame('out', event.response.payloadData);
      });

      // Navigate to target URL
      await this.page.goto(config.get('TARGET_URL'), { waitUntil: 'networkidle' });
      this.logger.info(`Navigated to ${config.get('TARGET_URL')}`);

      // Validate selectors before starting data collection
      await this.validateSelectorsOnStartup();

      // Start data collection
      this.isRunning = true;
      await this.collectData();

    } catch (error) {
      this.logger.error('Failed to start collector:', error);
      await this.cleanup();
      throw error;
    }
  }

  private async handleResume(): Promise<void> {
    try {
      // Get resume pointers
      const lastRound = this.db.getRounds().pop();
      const lastTick = this.db.getTicks().pop();
      const lastWS = this.db.getWSFrames().pop();
      
      const resumePointers = {
        last_ws_ts: lastWS?.ts || 0,
        last_tick_ts: lastTick?.ts || 0,
        last_round_id: lastRound?.id || 0
      };
      
      // Log resume information
      this.logger.info('[RESUME] Starting with pointers', resumePointers);
      
      // Check for unfinished rounds and auto-close them
      if (lastRound && !lastRound.ended_at) {
        this.logger.info('Found unfinished round, auto-closing...');
        
        const finalTick = this.db.getTicks(lastRound.id).pop();
        if (finalTick) {
          const autoClosedRound = {
            ...lastRound,
            ended_at: finalTick.ts,
            rug_x: finalTick.x,
            notes: 'closed_on_restart'
          };
          
          // Update the round in database
          this.db.updateRound(lastRound.id, autoClosedRound);
          this.logger.info('Auto-closed unfinished round', { round_id: lastRound.id });
        }
      }
    } catch (error) {
      this.logger.error('Error during resume handling:', error);
    }
  }

  private async validateSelectorsOnStartup(): Promise<void> {
    if (!this.page) return;

    this.logger.info('Validating selectors on startup...');
    
    try {
      // Simple validation - check if key selectors exist
      const multiplierEl = await this.page.$(selectors.multiplier.selector);
      const timerEl = await this.page.$(selectors.timer.selector);
      
      if (!multiplierEl || !timerEl) {
        this.logger.warn('Key selectors not found on startup - collector may not work properly');
      } else {
        this.logger.info('Key selectors validated successfully');
      }
    } catch (error) {
      this.logger.error('Error during selector validation:', error);
    }
  }

  private handleWSFrame(direction: 'in' | 'out', data: string): void {
    try {
      const frame: WSFrame = {
        ts: timeUtils.now(),
        dir: direction,
        data: data
      };
      
      this.db.insertWSFrame(frame);
    } catch (error) {
      this.logger.error('Failed to handle WebSocket frame:', error);
    }
  }

  private async collectData(): Promise<void> {
    const pollMs = config.get('POLL_MS');
    
    while (this.isRunning) {
      try {
        await this.pollDOM();
        await new Promise(resolve => setTimeout(resolve, pollMs));
      } catch (error) {
        this.logger.error('Error during data collection:', error);
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait longer on error
      }
    }
  }

  private async pollDOM(): Promise<void> {
    if (!this.page) return;

    try {
      // Extract data from DOM with drift tracking
      const tickData = await this.page.evaluate((sel) => {
        const getElement = (selector: string) => {
          const element = document.querySelector(selector);
          return element ? element.textContent?.trim() : null;
        };

        const getNumber = (selector: string) => {
          const text = getElement(selector);
          if (!text) return null;
          const numericText = text.replace(/[^\d.]/g, '');
          const parsed = parseFloat(numericText);
          return isNaN(parsed) ? null : parsed;
        };

        // Try to determine phase
        let phase = 'unknown';
        if (document.querySelector(sel.status.selector)) {
          const statusEl = document.querySelector(sel.status.selector);
          if (statusEl && statusEl.textContent?.includes('LIVE')) {
            phase = 'live';
          } else if (statusEl && statusEl.textContent?.includes('COOLDOWN')) {
            phase = 'cooldown';
          }
        }

        return {
          multiplier: getNumber(sel.multiplier.selector),
          timer: getElement(sel.timer.selector),
          players: getNumber(sel.players.selector),
          totalWager: getNumber(sel.wager.selector),
          phase: phase,
          // Track which selectors were found for drift detection
          selectorsFound: {
            multiplier: !!document.querySelector(sel.multiplier.selector),
            timer: !!document.querySelector(sel.timer.selector),
            players: !!document.querySelector(sel.players.selector),
            totalWager: !!document.querySelector(sel.wager.selector),
            status: !!document.querySelector(sel.status.selector)
          }
        };
      }, selectors);

      // Check for drift warnings
      for (const [selectorName, found] of Object.entries(tickData.selectorsFound)) {
        const driftWarning = this.driftTracker.checkSelector(selectorName, found);
        if (driftWarning) {
          this.logger.driftWarning(driftWarning);
        }
      }

      // Create tick object
      const tick: Tick = {
        ts: timeUtils.now(),
        phase: tickData.phase as 'live' | 'cooldown' | 'unknown',
        x: tickData.multiplier,
        timer: tickData.timer,
        players: tickData.players,
        totalWager: tickData.totalWager
      };

      // Validate tick data
      const validation = TickSchema.safeParse(tick);
      if (!validation.success) {
        this.logger.warn('Invalid tick data:', validation.error);
        return;
      }

      // Handle round segmentation
      await this.handleRoundSegmentation(tick);

    } catch (error) {
      this.logger.error('Error polling DOM:', error);
    }
  }

  private async handleRoundSegmentation(tick: Tick): Promise<void> {
    // Detect phase transitions
    if (this.lastPhase !== 'live' && tick.phase === 'live') {
      // Starting a new round
      this.startNewRound(tick);
    } else if (this.lastPhase === 'live' && tick.phase !== 'live') {
      // Ending current round
      await this.endCurrentRound(tick);
    }

    // Update last phase
    this.lastPhase = tick.phase;

    // Add tick to current round if we have one
    if (this.currentRound) {
      this.roundTicks.push(tick);
      this.db.insertTick({
        ...tick,
        round_id: this.currentRound.id
      });
    }
  }

  private startNewRound(tick: Tick): void {
    this.currentRound = {
      started_at: tick.ts,
      max_x: tick.x,
      min_x: tick.x,
      avg_x: tick.x,
      players: tick.players,
      total_wager: tick.totalWager
    };

    this.roundTicks = [tick];
    this.logger.info('Started new round', { started_at: tick.ts, x: tick.x });
  }

  private async endCurrentRound(finalTick: Tick): Promise<void> {
    if (!this.currentRound || this.roundTicks.length === 0) {
      this.logger.warn('No current round to end');
      return;
    }

    // Calculate round statistics
    const xValues = this.roundTicks.map(t => t.x).filter(x => x !== null) as number[];
    const lastLiveTick = this.roundTicks.slice().reverse().find(t => t.phase === 'live');
    
    const roundData: Round = {
      id: this.currentRound.id!,
      started_at: this.currentRound.started_at!,
      ended_at: finalTick.ts,
      max_x: xValues.length > 0 ? Math.max(...xValues) : null,
      min_x: xValues.length > 0 ? Math.min(...xValues) : null,
      avg_x: xValues.length > 0 ? xValues.reduce((a, b) => a + b, 0) / xValues.length : null,
      rug_time_s: lastLiveTick ? timeUtils.msToSeconds(finalTick.ts - lastLiveTick.ts) : null,
      rug_x: lastLiveTick?.x || null,
      players: this.currentRound.players,
      total_wager: this.currentRound.total_wager
    };

    // Insert round into database
    const roundId = this.db.insertRound(roundData);
    
    // Insert sidebet windows if available
    if (this.currentRound.sidebet_windows && this.currentRound.sidebet_windows.length > 0) {
      this.db.insertSidebetWindows(roundId, this.currentRound.sidebet_windows);
      this.logger.info('Inserted sidebet windows', {
        round_id: roundId,
        window_count: this.currentRound.sidebet_windows.length
      });
    }
    
    this.logger.info('Ended round', {
      id: roundId,
      duration: timeUtils.formatDuration(finalTick.ts - this.currentRound.started_at!),
      max_x: roundData.max_x,
      rug_x: roundData.rug_x
    });

    // Reset for next round
    this.currentRound = null;
    this.roundTicks = [];
  }

  async stop(): Promise<void> {
    this.logger.info('Stopping collector...');
    this.isRunning = false;
    
    // End current round if active
    if (this.currentRound) {
      const finalTick: Tick = {
        ts: timeUtils.now(),
        phase: 'unknown',
        x: null,
        timer: null,
        players: null,
        totalWager: null
      };
      await this.endCurrentRound(finalTick);
    }

    // Log final drift status
    const driftStatus = this.driftTracker.getDriftStatus();
    if (Object.keys(driftStatus).length > 0) {
      this.logger.warn('Final drift status:', driftStatus);
    }

    await this.cleanup();
  }

  private async cleanup(): Promise<void> {
    try {
      if (this.page) {
        await this.page.close();
        this.page = null;
      }
      
      if (this.browser) {
        await this.browser.close();
        this.browser = null;
      }
      
      this.db.close();
      this.logger.info('Collector stopped and cleaned up');
    } catch (error) {
      this.logger.error('Error during cleanup:', error);
    }
  }
}

// Main execution
async function main(): Promise<void> {
  const collector = new RugsCollector();
  
  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\nReceived SIGINT, shutting down gracefully...');
    await collector.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('\nReceived SIGTERM, shutting down gracefully...');
    await collector.stop();
    process.exit(0);
  });

  try {
    await collector.start();
  } catch (error) {
    console.error('Failed to start collector:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
