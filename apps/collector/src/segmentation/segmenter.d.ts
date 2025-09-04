import { Event } from '../ws/types';
import { Logger } from '@rugs-research/shared';
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
export declare class RoundSegmenter {
    private state;
    private logger;
    private endGuardPolls;
    private liveConfirmPolls;
    constructor(logger: Logger, endGuardPolls?: number, liveConfirmPolls?: number);
    private getInitialState;
    private resetState;
    /**
     * Process a tick from DOM polling
     */
    processDOMTick(tick: TickData): {
        roundStarted: boolean;
        roundEnded: boolean;
        currentRound: RoundState | null;
    };
    /**
     * Process an event from WebSocket
     */
    processWSEvent(event: Event): {
        roundStarted: boolean;
        roundEnded: boolean;
        currentRound: RoundState | null;
    };
    private processTick;
    private handleRoundStart;
    private handleRoundEnd;
    private startRound;
    private endRound;
    /**
     * Get current round state
     */
    getCurrentState(): RoundState;
    /**
     * Reset to cooldown state (for new round)
     */
    reset(): void;
    /**
     * Generate sidebet windows for the round
     * Windows are 10-second intervals starting from round start
     */
    private generateSidebetWindows;
    /**
     * Force end current round if needed
     */
    forceEnd(ts: number): RoundState | null;
}
//# sourceMappingURL=segmenter.d.ts.map