import { RoundTracker } from './roundTracker';
import type { ParsedEvent } from '../parsers/console';

export class Aggregator {
  private round: RoundTracker;
  
  constructor(private storage: any) {
    this.round = new RoundTracker(storage);
  }
  
  ingest(evt: ParsedEvent) {
    this.round.ingest(evt);
  }

  // Force end current round (for shutdown)
  forceEndRound() {
    this.round.forceEndRound();
  }

  // Get current round stats
  getCurrentRoundStats() {
    return this.round.getCurrentRoundStats();
  }
}

