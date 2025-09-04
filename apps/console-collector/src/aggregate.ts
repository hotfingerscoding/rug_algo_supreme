import { v4 as uuidv4 } from 'uuid';
import { ConsoleEvent, SideBetEvt, TradeEvt, PnlEvt, RugRoyaleEvt, RoundAggregate, RoundState } from './types';
import { Storage } from './storage';

export class RoundAggregator {
  private storage: Storage;
  private currentRound: RoundState | null = null;
  private preRoundBuffer: ConsoleEvent[] = [];
  private roundCounter = 0;

  constructor(storage: Storage) {
    this.storage = storage;
  }

  processEvent(event: ConsoleEvent) {
    // Store every event for full fidelity
    this.storage.storeEvent(event);

    // Handle PnL events for round management
    if (event.type === 'pnl') {
      this.handlePnlEvent(event);
      return;
    }

    // Buffer events that arrive before first round starts
    if (!this.currentRound) {
      this.preRoundBuffer.push(event);
      return;
    }

    // Add event to current round
    this.addEventToCurrentRound(event);
  }

  private handlePnlEvent(event: PnlEvt) {
    // Round ends: active=false and wasActive=true
    if (!event.active && event.wasActive) {
      this.endCurrentRound();
    }
    
    // Round starts: active=true and wasActive=false
    if (event.active && !event.wasActive) {
      this.startNewRound();
    }
  }

  private startNewRound() {
    // If we have a pre-round buffer, assign those events to this round
    const startTime = new Date().toISOString();
    
    this.currentRound = {
      roundId: `round_${++this.roundCounter}_${Date.now()}`,
      startAt: startTime,
      endAt: null,
      trades: [],
      sideBets: [],
      playerIds: new Set<string>(),
      gameIds: new Set<string>(),
      tickIndices: [],
      lastStatus: null
    };

    // Process pre-round buffer events
    for (const bufferedEvent of this.preRoundBuffer) {
      this.addEventToCurrentRound(bufferedEvent);
    }
    this.preRoundBuffer = [];

    console.log(`Round #${this.roundCounter} started at ${startTime}`);
  }

  private endCurrentRound() {
    if (!this.currentRound) {
      // Create synthetic round if we see an end without a start
      const endTime = new Date().toISOString();
      const startTime = new Date(Date.now() - 15000).toISOString(); // 15 seconds ago
      
      this.currentRound = {
        roundId: `synthetic_${++this.roundCounter}_${Date.now()}`,
        startAt: startTime,
        endAt: endTime,
        trades: [],
        sideBets: [],
        playerIds: new Set<string>(),
        gameIds: new Set<string>(),
        tickIndices: [],
        lastStatus: null
      };
    }

    this.currentRound.endAt = new Date().toISOString();
    
    // Aggregate the round
    const aggregate = this.createRoundAggregate();
    this.storage.storeRound(aggregate);
    
    // Clear current round
    this.currentRound = null;
  }

  private addEventToCurrentRound(event: ConsoleEvent) {
    if (!this.currentRound) return;

    switch (event.type) {
      case 'trade':
        this.currentRound.trades.push(event as TradeEvt);
        this.currentRound.gameIds.add(event.gameId);
        this.currentRound.tickIndices.push(event.tickIndex);
        break;
        
      case 'sideBet':
        this.currentRound.sideBets.push(event as SideBetEvt);
        this.currentRound.playerIds.add(event.playerId);
        this.currentRound.gameIds.add(event.gameId);
        break;
        
      case 'rugRoyale':
        this.currentRound.lastStatus = event.status;
        break;
    }
  }

  private createRoundAggregate(): RoundAggregate {
    if (!this.currentRound) {
      throw new Error('No current round to aggregate');
    }

    const trades = this.currentRound.trades;
    const sideBets = this.currentRound.sideBets;

    // Calculate trade totals
    let totalBuyQty = 0;
    let totalSellQty = 0;
    
    for (const trade of trades) {
      if (trade.qty > 0) {
        totalBuyQty += trade.qty;
      } else {
        totalSellQty += Math.abs(trade.qty);
      }
    }

    // Calculate side bet totals
    let totalSideBetAmount = 0;
    let totalSideBetPayout = 0;
    
    for (const sideBet of sideBets) {
      totalSideBetAmount += sideBet.betAmount;
      if (sideBet.payout) {
        totalSideBetPayout += sideBet.payout;
      }
    }

    // Calculate tick range
    const tickMin = this.currentRound.tickIndices.length > 0 ? Math.min(...this.currentRound.tickIndices) : null;
    const tickMax = this.currentRound.tickIndices.length > 0 ? Math.max(...this.currentRound.tickIndices) : null;

    return {
      roundId: this.currentRound.roundId,
      startAt: this.currentRound.startAt,
      endAt: this.currentRound.endAt!,
      counts: {
        trades: trades.length,
        sideBets: sideBets.length
      },
      sums: {
        totalBuyQty,
        totalSellQty,
        netQty: totalBuyQty - totalSellQty,
        totalSideBetAmount,
        totalSideBetPayout
      },
      uniquePlayers: this.currentRound.playerIds.size,
      lastStatus: this.currentRound.lastStatus,
      tickMin,
      tickMax,
      gameIds: Array.from(this.currentRound.gameIds)
    };
  }

  // Force end current round (for shutdown)
  forceEndRound() {
    if (this.currentRound && !this.currentRound.endAt) {
      this.endCurrentRound();
    }
  }

  getCurrentRoundStats() {
    if (!this.currentRound) return null;
    
    return {
      roundId: this.currentRound.roundId,
      startAt: this.currentRound.startAt,
      duration: this.currentRound.endAt 
        ? new Date(this.currentRound.endAt).getTime() - new Date(this.currentRound.startAt).getTime()
        : Date.now() - new Date(this.currentRound.startAt).getTime(),
      trades: this.currentRound.trades.length,
      sideBets: this.currentRound.sideBets.length,
      uniquePlayers: this.currentRound.playerIds.size,
      gameIds: this.currentRound.gameIds.size
    };
  }
}
