import { Event } from '../ws/types';
import { Logger, timeUtils } from '@rugs-research/shared';

export type RoundPhase = 'cooldown' | 'live' | 'ending';

export interface RoundState {
  phase: RoundPhase;
  started_at?: number;
  ended_at?: number;
  max_x: number | null;
  min_x: number | null;
  avg_x: number | null;
  rug_x: number | null;
  rug_time_s: number | null;
  players: number | null;
  total_wager: number | null;
  tick_count: number;
  last_live_tick_ts?: number;
  live_confirmation_count: number;
  ending_confirmation_count: number;
  sidebet_windows: SidebetWindow[];
}

export interface SidebetWindow {
  window_idx: number;
  start_s: number;
  end_s: number;
  rug_in_window: boolean;
}

export interface TickData {
  ts: number;
  x: number | null;
  timer: string | null;
  players: number | null;
  totalWager: number | null;
  phase: 'live' | 'cooldown' | 'unknown';
  source: 'ws' | 'dom' | 'merged';
}

export class RoundSegmenter {
  private state: RoundState;
  private logger: Logger;
  private endGuardPolls: number;
  private liveConfirmPolls: number;

  constructor(logger: Logger, endGuardPolls: number = 1, liveConfirmPolls: number = 2) {
    this.logger = logger;
    this.endGuardPolls = endGuardPolls;
    this.liveConfirmPolls = liveConfirmPolls;
    this.state = this.getInitialState();
  }

  private getInitialState(): RoundState {
    return {
      phase: 'cooldown',
      max_x: null,
      min_x: null,
      avg_x: null,
      rug_x: null,
      rug_time_s: null,
      players: null,
      total_wager: null,
      tick_count: 0,
      live_confirmation_count: 0,
      ending_confirmation_count: 0,
      sidebet_windows: []
    };
  }

  private resetState(): void {
    this.state = this.getInitialState();
  }

  /**
   * Process a tick from DOM polling
   */
  processDOMTick(tick: TickData): { roundStarted: boolean; roundEnded: boolean; currentRound: RoundState | null } {
    return this.processTick(tick);
  }

  /**
   * Process an event from WebSocket
   */
  processWSEvent(event: Event): { roundStarted: boolean; roundEnded: boolean; currentRound: RoundState | null } {
    switch (event.type) {
      case 'ROUND_START':
        return this.handleRoundStart(event.ts, event.roundKey);
      
      case 'ROUND_END':
        return this.handleRoundEnd(event.ts, event.roundKey, event.rugX);
      
      case 'TICK':
        const tick: TickData = {
          ts: event.ts,
          x: event.x || null,
          timer: event.timer ? String(event.timer) : null,
          players: event.players || null,
          totalWager: event.wager || null,
          phase: 'live', // WS ticks are typically live
          source: 'ws'
        };
        return this.processTick(tick);
      
      case 'HEARTBEAT':
        // Heartbeats don't affect round state
        return { roundStarted: false, roundEnded: false, currentRound: null };
      
      default:
        // Unknown events don't affect round state
        return { roundStarted: false, roundEnded: false, currentRound: null };
    }
  }

  private processTick(tick: TickData): { roundStarted: boolean; roundEnded: boolean; currentRound: RoundState | null } {
    let roundStarted = false;
    let roundEnded = false;

    // Update tick count
    this.state.tick_count++;

    // Update statistics
    if (tick.x !== null) {
      if (this.state.max_x === null || tick.x > this.state.max_x) {
        this.state.max_x = tick.x;
      }
      if (this.state.min_x === null || tick.x < this.state.min_x) {
        this.state.min_x = tick.x;
      }
      
      // Update average incrementally
      if (this.state.avg_x === null) {
        this.state.avg_x = tick.x;
      } else {
        this.state.avg_x = (this.state.avg_x * (this.state.tick_count - 1) + tick.x) / this.state.tick_count;
      }
    }

    // Update other fields (use most recent non-null values)
    if (tick.players !== null) this.state.players = tick.players;
    if (tick.totalWager !== null) this.state.total_wager = tick.totalWager;

    // Handle phase transitions
    switch (this.state.phase) {
      case 'cooldown':
        if (tick.phase === 'live') {
          this.state.live_confirmation_count++;
          if (this.state.live_confirmation_count >= this.liveConfirmPolls) {
            roundStarted = this.startRound(tick.ts);
          }
        } else {
          this.state.live_confirmation_count = 0;
        }
        break;

      case 'live':
        if (tick.phase === 'live') {
          this.state.live_confirmation_count = 0;
          this.state.ending_confirmation_count = 0;
          this.state.last_live_tick_ts = tick.ts;
        } else {
          this.state.ending_confirmation_count++;
          if (this.state.ending_confirmation_count >= this.endGuardPolls) {
            roundEnded = this.endRound(tick.ts, tick.x);
          }
        }
        break;

      case 'ending':
        // Already in ending phase, just wait for finalization
        break;
    }

    return {
      roundStarted,
      roundEnded,
      currentRound: roundEnded ? this.state : null
    };
  }

  private handleRoundStart(ts: number, roundKey?: string | number): { roundStarted: boolean; roundEnded: boolean; currentRound: RoundState | null } {
    if (this.state.phase === 'cooldown') {
      this.startRound(ts);
      return { roundStarted: true, roundEnded: false, currentRound: null };
    }
    return { roundStarted: false, roundEnded: false, currentRound: null };
  }

  private handleRoundEnd(ts: number, roundKey?: string | number, rugX?: number | null): { roundStarted: boolean; roundEnded: boolean; currentRound: RoundState | null } {
    if (this.state.phase === 'live' || this.state.phase === 'ending') {
      const ended = this.endRound(ts, rugX);
      return { roundStarted: false, roundEnded: ended, currentRound: ended ? this.state : null };
    }
    return { roundStarted: false, roundEnded: false, currentRound: null };
  }

  private startRound(ts: number): boolean {
    this.state.phase = 'live';
    this.state.started_at = ts;
    this.state.live_confirmation_count = 0;
    this.state.ending_confirmation_count = 0;
    this.state.sidebet_windows = [];
    
    this.logger.info('Round started', { started_at: ts });
    return true;
  }

  private endRound(ts: number, finalX?: number | null): boolean {
    this.state.phase = 'ending';
    this.state.ended_at = ts;
    
    // Set rug_x to the last known multiplier or the final X
    if (finalX !== null && finalX !== undefined) {
      this.state.rug_x = finalX;
    } else if (this.state.max_x !== null) {
      this.state.rug_x = this.state.max_x;
    }

    // Calculate rug_time_s if we have timing data
    if (this.state.last_live_tick_ts && this.state.started_at) {
      this.state.rug_time_s = timeUtils.msToSeconds(this.state.last_live_tick_ts - this.state.started_at);
    }

    // Generate sidebet windows
    this.generateSidebetWindows();

    this.logger.info('Round ended', {
      ended_at: ts,
      duration: this.state.started_at ? timeUtils.formatDuration(ts - this.state.started_at) : 'unknown',
      max_x: this.state.max_x,
      rug_x: this.state.rug_x,
      rug_time_s: this.state.rug_time_s,
      window_count: this.state.sidebet_windows.length
    });

    return true;
  }

  /**
   * Get current round state
   */
  getCurrentState(): RoundState {
    return { ...this.state };
  }

  /**
   * Reset to cooldown state (for new round)
   */
  reset(): void {
    this.resetState();
  }

  /**
   * Generate sidebet windows for the round
   * Windows are 10-second intervals starting from round start
   */
  private generateSidebetWindows(): void {
    if (!this.state.started_at || !this.state.ended_at) {
      return;
    }

    const roundDurationMs = this.state.ended_at - this.state.started_at;
    const roundDurationS = timeUtils.msToSeconds(roundDurationMs);
    const windowCount = Math.ceil(roundDurationS / 10);

    this.state.sidebet_windows = [];

    for (let i = 0; i < windowCount; i++) {
      const startS = i * 10;
      const endS = Math.min((i + 1) * 10, roundDurationS);
      
      // Check if rug occurred in this window
      let rugInWindow = false;
      if (this.state.rug_time_s !== null) {
        rugInWindow = this.state.rug_time_s >= startS && this.state.rug_time_s < endS;
      }

      this.state.sidebet_windows.push({
        window_idx: i,
        start_s: startS,
        end_s: endS,
        rug_in_window: rugInWindow
      });
    }

    this.logger.info('Generated sidebet windows', {
      round_duration_s: roundDurationS,
      window_count: windowCount,
      rug_time_s: this.state.rug_time_s
    });
  }

  /**
   * Force end current round if needed
   */
  forceEnd(ts: number): RoundState | null {
    if (this.state.phase === 'live' || this.state.phase === 'ending') {
      this.endRound(ts);
      return this.state;
    }
    return null;
  }
}
