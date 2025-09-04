import type { ParsedEvent } from '../parsers/console';
import config from '../config';

export type RoundFeature = {
  id: string;
  startAt: string;
  endAt: string;
  durationSec: number;
  cooldownSec: number | null;
  boundary_reason: string;
  gameIds: string[];
  numTrades: number;
  numSideBets: number;
  uniquePlayers: number;
  uniqueUsernames: number;
  totalSideBet: number;
  totalQtyBuy: number;
  totalQtySell: number;
  netQty: number;
  tickMin: number | null;
  tickMax: number | null;
  // New computed features
  avgBetSize: number;
  maxWager: number;
  tradeIntensity: number;
  volatility: number;
};

export class RoundTracker {
  private state: 'ACTIVE' | 'COOLDOWN' = 'COOLDOWN';
  private lastEndAt: string | null = null;
  private current: any = null;
  private lastActivityTime: number = Date.now();
  private inactivityTimer: NodeJS.Timeout | null = null;
  
  constructor(private storage: any) {}

  ingest(evt: ParsedEvent) {
    // Update activity timestamp for timeout detection
    this.lastActivityTime = Date.now();
    
    if (evt.kind === 'pnlDebug') {
      if (evt.payload.active === false && evt.payload.wasActive === true) {
        // END via PnL debug
        this.endRound(evt.t, 'pnlDebug');
        this.state = 'COOLDOWN';
        return;
      }
      if (evt.payload.active === true) {
        // START via PnL debug
        this.startRound(evt.t, 'pnlDebug');
        this.state = 'ACTIVE';
        return;
      }
    }

    if (evt.kind === 'rugRoyaleUpdate') {
      if (evt.payload?.status === 'INACTIVE') {
        // END via rugRoyale update
        this.endRound(evt.t, 'rugRoyaleUpdate');
        this.state = 'COOLDOWN';
        return;
      }
    }

    // Check for inferred round start (first trade after cooldown)
    if (this.state === 'COOLDOWN' && (evt.kind === 'trade' || evt.kind === 'sideBet')) {
      const timeSinceLastEnd = this.lastEndAt ? (Date.now() - Date.parse(this.lastEndAt)) / 1000 : 0;
      if (timeSinceLastEnd > 10) { // Assume cooldown is at least 10s
        this.startRound(evt.t, 'inferred');
        this.state = 'ACTIVE';
      }
    }

    // Accumulate when active
    if (this.state === 'ACTIVE' && this.current) {
      if (evt.kind === 'trade') this.addTrade(evt.payload);
      if (evt.kind === 'sideBet') this.addSideBet(evt.payload);
      
      // Reset inactivity timer
      this.resetInactivityTimer();
    }
  }

  private startRound(t: string, reason: string) {
    const cooldownSec = this.lastEndAt ? (Date.parse(t) - Date.parse(this.lastEndAt)) / 1000 : null;
    this.current = {
      startAt: t, 
      endAt: null, 
      cooldownSec,
      boundary_reason: reason,
      trades: [], 
      sideBets: [],
      players: new Set<string>(), 
      usernames: new Set<string>(),
      totalSideBet: 0, 
      totalQtyBuy: 0, 
      totalQtySell: 0,
      tickMin: null as number | null, 
      tickMax: null as number | null,
      gameIds: new Set<string>(),
      maxWager: 0,
    };
    
    console.log(`🔄 Round started at ${t} via ${reason}${cooldownSec ? ` (cooldown: ${cooldownSec.toFixed(1)}s)` : ''}`);
    
    // Start inactivity timer
    this.resetInactivityTimer();
  }

  private endRound(t: string, reason: string) {
    if (!this.current) { 
      this.lastEndAt = t; 
      return; 
    }
    
    // Clear inactivity timer
    if (this.inactivityTimer) {
      clearTimeout(this.inactivityTimer);
      this.inactivityTimer = null;
    }
    
    this.current.endAt = t;
    this.current.boundary_reason = reason;
    const f = this.toFeature(this.current);
    this.storage.insertRoundFeature(f);
    this.lastEndAt = t;
    
    console.log(`✅ Round ended via ${reason}: ${f.numTrades} trades, ${f.numSideBets} sideBets, ${f.uniquePlayers} players, netQty: ${f.netQty.toFixed(2)}, tickRange: [${f.tickMin}, ${f.tickMax}]`);
    
    this.current = null;
  }

  private addTrade(p: any) {
    this.current.trades.push(p);
    if (p.playerId) this.current.players.add(String(p.playerId));
    if (p.username) this.current.usernames.add(String(p.username));
    if (p.gameId) this.current.gameIds.add(String(p.gameId));
    if (typeof p.tickIndex === 'number') {
      this.current.tickMin = this.current.tickMin == null ? p.tickIndex : Math.min(this.current.tickMin, p.tickIndex);
      this.current.tickMax = this.current.tickMax == null ? p.tickIndex : Math.max(this.current.tickMax, p.tickIndex);
    }
    if (p.type === 'buy' && typeof p.qty === 'number') this.current.totalQtyBuy += p.qty;
    if (p.type === 'sell' && typeof p.tickIndex === 'number') {
      // qty isn't given on sells; just track tick range; leave totalQtySell if provided elsewhere
    }
    if (p.type === 'sell' && typeof p.qty === 'number') this.current.totalQtySell += p.qty;
  }

  private addSideBet(p: any) {
    this.current.sideBets.push(p);
    if (p.playerId) this.current.players.add(String(p.playerId));
    if (p.username) this.current.usernames.add(String(p.username));
    if (p.gameId) this.current.gameIds.add(String(p.gameId));
    if (typeof p.betAmount === 'number') {
      this.current.totalSideBet += p.betAmount;
      this.current.maxWager = Math.max(this.current.maxWager, p.betAmount);
    }
  }

  private toFeature(c: any): RoundFeature {
    const id = `${c.startAt}__${c.endAt}`;
    const durationSec = (Date.parse(c.endAt) - Date.parse(c.startAt)) / 1000;
    const netQty = c.totalQtyBuy - c.totalQtySell;
    
    // Compute new features with safe division
    const avgBetSize = c.sideBets.length > 0 ? c.totalSideBet / c.sideBets.length : 0;
    const tradeIntensity = durationSec > 0 ? c.trades.length / durationSec : 0;
    const volatility = durationSec > 0 && c.tickMin !== null && c.tickMax !== null 
      ? (c.tickMax - c.tickMin) / durationSec 
      : 0;
    
    return {
      id,
      startAt: c.startAt,
      endAt: c.endAt,
      durationSec,
      cooldownSec: c.cooldownSec,
      boundary_reason: c.boundary_reason || 'unknown',
      gameIds: Array.from(c.gameIds),
      numTrades: c.trades.length,
      numSideBets: c.sideBets.length,
      uniquePlayers: c.players.size,
      uniqueUsernames: c.usernames.size,
      totalSideBet: c.totalSideBet,
      totalQtyBuy: c.totalQtyBuy,
      totalQtySell: c.totalQtySell,
      netQty,
      tickMin: c.tickMin,
      tickMax: c.tickMax,
      avgBetSize: Math.round(avgBetSize * 1000000) / 1000000, // 6 decimal places
      maxWager: c.maxWager || 0,
      tradeIntensity: Math.round(tradeIntensity * 1000000) / 1000000,
      volatility: Math.round(volatility * 1000000) / 1000000,
    };
  }

  /**
   * Reset inactivity timer for timeout-based round ending
   */
  private resetInactivityTimer() {
    if (this.inactivityTimer) {
      clearTimeout(this.inactivityTimer);
    }
    
    this.inactivityTimer = setTimeout(() => {
      if (this.state === 'ACTIVE' && this.current) {
        const timeSinceActivity = (Date.now() - this.lastActivityTime) / 1000;
        if (timeSinceActivity >= config.ROUND_INACTIVITY_S) {
          console.log(`⏰ Round timeout after ${timeSinceActivity.toFixed(1)}s of inactivity`);
          this.endRound(new Date().toISOString(), 'timeout');
          this.state = 'COOLDOWN';
        }
      }
    }, config.ROUND_INACTIVITY_S * 1000);
  }

  // Force end current round (for shutdown)
  forceEndRound() {
    if (this.current && !this.current.endAt) {
      this.endRound(new Date().toISOString(), 'forced');
    }
  }

  getCurrentRoundStats() {
    if (!this.current) return null;
    
    return {
      state: this.state,
      startAt: this.current.startAt,
      duration: this.current.endAt 
        ? (Date.parse(this.current.endAt) - Date.parse(this.current.startAt)) / 1000
        : (Date.now() - Date.parse(this.current.startAt)) / 1000,
      trades: this.current.trades.length,
      sideBets: this.current.sideBets.length,
      uniquePlayers: this.current.players.size,
      gameIds: this.current.gameIds.size
    };
  }
}

