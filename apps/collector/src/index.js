"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const test_1 = require("@playwright/test");
const shared_1 = require("@rugs-research/shared");
const schema_1 = require("@rugs-research/schema");
const selectors_1 = require("./config/selectors");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
// Simple drift tracker for selector validation
class SelectorDriftTracker {
    missingCounts = new Map();
    driftThreshold;
    constructor(driftThreshold = 10) {
        this.driftThreshold = driftThreshold;
    }
    checkSelector(name, found) {
        if (!found) {
            const currentCount = this.missingCounts.get(name) || 0;
            const newCount = currentCount + 1;
            this.missingCounts.set(name, newCount);
            if (newCount === this.driftThreshold) {
                return `[DRIFT] Selector '${name}' missing for ${this.driftThreshold} consecutive polls`;
            }
        }
        else {
            this.missingCounts.delete(name);
        }
        return null;
    }
    getDriftStatus() {
        const status = {};
        for (const [name, count] of this.missingCounts.entries()) {
            status[name] = count;
        }
        return status;
    }
    reset() {
        this.missingCounts.clear();
    }
}
class RugsCollector {
    browser = null;
    page = null;
    db;
    logger;
    isRunning = false;
    currentRound = null;
    roundTicks = [];
    lastPhase = 'unknown';
    driftTracker;
    constructor() {
        this.logger = new shared_1.Logger(shared_1.config.get('LOG_PATH'), shared_1.config.get('LOG_LEVEL'));
        this.db = new shared_1.SQLiteHelper(shared_1.config.get('DB_PATH'), this.logger);
        this.driftTracker = new SelectorDriftTracker(shared_1.config.get('DRIFT_THRESHOLD'));
    }
    async start() {
        try {
            this.logger.info('Starting Rugs Collector...');
            // Ensure data directory exists
            const dataDir = path.dirname(shared_1.config.get('DB_PATH'));
            if (!fs.existsSync(dataDir)) {
                fs.mkdirSync(dataDir, { recursive: true });
            }
            // Check for resume pointers and auto-close unfinished rounds
            await this.handleResume();
            // Launch browser
            this.browser = await test_1.chromium.launch({
                headless: shared_1.config.get('HEADLESS'),
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
            await this.page.goto(shared_1.config.get('TARGET_URL'), { waitUntil: 'networkidle' });
            this.logger.info(`Navigated to ${shared_1.config.get('TARGET_URL')}`);
            // Validate selectors before starting data collection
            await this.validateSelectorsOnStartup();
            // Start data collection
            this.isRunning = true;
            await this.collectData();
        }
        catch (error) {
            this.logger.error('Failed to start collector:', error);
            await this.cleanup();
            throw error;
        }
    }
    async handleResume() {
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
        }
        catch (error) {
            this.logger.error('Error during resume handling:', error);
        }
    }
    async validateSelectorsOnStartup() {
        if (!this.page)
            return;
        this.logger.info('Validating selectors on startup...');
        try {
            // Simple validation - check if key selectors exist
            const multiplierEl = await this.page.$(selectors_1.selectors.multiplier.selector);
            const timerEl = await this.page.$(selectors_1.selectors.timer.selector);
            if (!multiplierEl || !timerEl) {
                this.logger.warn('Key selectors not found on startup - collector may not work properly');
            }
            else {
                this.logger.info('Key selectors validated successfully');
            }
        }
        catch (error) {
            this.logger.error('Error during selector validation:', error);
        }
    }
    handleWSFrame(direction, data) {
        try {
            const frame = {
                ts: shared_1.timeUtils.now(),
                dir: direction,
                data: data
            };
            this.db.insertWSFrame(frame);
        }
        catch (error) {
            this.logger.error('Failed to handle WebSocket frame:', error);
        }
    }
    async collectData() {
        const pollMs = shared_1.config.get('POLL_MS');
        while (this.isRunning) {
            try {
                await this.pollDOM();
                await new Promise(resolve => setTimeout(resolve, pollMs));
            }
            catch (error) {
                this.logger.error('Error during data collection:', error);
                await new Promise(resolve => setTimeout(resolve, 1000)); // Wait longer on error
            }
        }
    }
    async pollDOM() {
        if (!this.page)
            return;
        try {
            // Extract data from DOM with drift tracking
            const tickData = await this.page.evaluate((sel) => {
                const getElement = (selector) => {
                    const element = document.querySelector(selector);
                    return element ? element.textContent?.trim() : null;
                };
                const getNumber = (selector) => {
                    const text = getElement(selector);
                    if (!text)
                        return null;
                    const numericText = text.replace(/[^\d.]/g, '');
                    const parsed = parseFloat(numericText);
                    return isNaN(parsed) ? null : parsed;
                };
                // Try to determine phase
                let phase = 'unknown';
                if (document.querySelector(sel.gameStatus.selector)) {
                    const statusEl = document.querySelector(sel.gameStatus.selector);
                    if (statusEl && statusEl.textContent?.includes('LIVE')) {
                        phase = 'live';
                    }
                    else if (statusEl && statusEl.textContent?.includes('COOLDOWN')) {
                        phase = 'cooldown';
                    }
                }
                return {
                    multiplier: getNumber(sel.multiplier.selector),
                    timer: getElement(sel.timer.selector),
                    players: getNumber(sel.playerCount.selector),
                    totalWager: getNumber(sel.totalWager.selector),
                    phase: phase,
                    // Track which selectors were found for drift detection
                    selectorsFound: {
                        multiplier: !!document.querySelector(sel.multiplier.selector),
                        timer: !!document.querySelector(sel.timer.selector),
                        players: !!document.querySelector(sel.playerCount.selector),
                        totalWager: !!document.querySelector(sel.totalWager.selector),
                        gameStatus: !!document.querySelector(sel.gameStatus.selector)
                    }
                };
            }, selectors_1.selectors);
            // Check for drift warnings
            for (const [selectorName, found] of Object.entries(tickData.selectorsFound)) {
                const driftWarning = this.driftTracker.checkSelector(selectorName, found);
                if (driftWarning) {
                    this.logger.driftWarning(driftWarning);
                }
            }
            // Create tick object
            const tick = {
                ts: shared_1.timeUtils.now(),
                phase: tickData.phase,
                x: tickData.multiplier,
                timer: tickData.timer,
                players: tickData.players,
                totalWager: tickData.totalWager
            };
            // Validate tick data
            const validation = schema_1.TickSchema.safeParse(tick);
            if (!validation.success) {
                this.logger.warn('Invalid tick data:', validation.error);
                return;
            }
            // Handle round segmentation
            await this.handleRoundSegmentation(tick);
        }
        catch (error) {
            this.logger.error('Error polling DOM:', error);
        }
    }
    async handleRoundSegmentation(tick) {
        // Detect phase transitions
        if (this.lastPhase !== 'live' && tick.phase === 'live') {
            // Starting a new round
            this.startNewRound(tick);
        }
        else if (this.lastPhase === 'live' && tick.phase !== 'live') {
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
    startNewRound(tick) {
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
    async endCurrentRound(finalTick) {
        if (!this.currentRound || this.roundTicks.length === 0) {
            this.logger.warn('No current round to end');
            return;
        }
        // Calculate round statistics
        const xValues = this.roundTicks.map(t => t.x).filter(x => x !== null);
        const lastLiveTick = this.roundTicks.slice().reverse().find(t => t.phase === 'live');
        const roundData = {
            id: this.currentRound.id,
            started_at: this.currentRound.started_at,
            ended_at: finalTick.ts,
            max_x: xValues.length > 0 ? Math.max(...xValues) : null,
            min_x: xValues.length > 0 ? Math.min(...xValues) : null,
            avg_x: xValues.length > 0 ? xValues.reduce((a, b) => a + b, 0) / xValues.length : null,
            rug_time_s: lastLiveTick ? shared_1.timeUtils.msToSeconds(finalTick.ts - lastLiveTick.ts) : null,
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
            duration: shared_1.timeUtils.formatDuration(finalTick.ts - this.currentRound.started_at),
            max_x: roundData.max_x,
            rug_x: roundData.rug_x
        });
        // Reset for next round
        this.currentRound = null;
        this.roundTicks = [];
    }
    async stop() {
        this.logger.info('Stopping collector...');
        this.isRunning = false;
        // End current round if active
        if (this.currentRound) {
            const finalTick = {
                ts: shared_1.timeUtils.now(),
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
    async cleanup() {
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
        }
        catch (error) {
            this.logger.error('Error during cleanup:', error);
        }
    }
}
// Main execution
async function main() {
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
    }
    catch (error) {
        console.error('Failed to start collector:', error);
        process.exit(1);
    }
}
if (require.main === module) {
    main();
}
//# sourceMappingURL=index.js.map