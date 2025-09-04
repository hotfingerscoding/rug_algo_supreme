export interface SideBetEvt {
  type: 'sideBet';
  playerId: string;
  gameId: string;
  username: string | null;
  betAmount: number;
  xPayout?: number;
  payout?: number;
  timestamp: string;
}

export interface TradeEvt {
  type: 'trade';
  id: string;
  qty: number;
  tickIndex: number;
  gameId: string;
  timestamp: string;
}

export interface PnlEvt {
  type: 'pnl';
  active: boolean;
  wasActive: boolean;
  timestamp: string;
}

export interface RugRoyaleEvt {
  type: 'rugRoyale';
  status: string;
  timestamp: string;
}

export interface UnknownEvt {
  type: 'unknown';
  raw: string;
  timestamp: string;
}

export type ConsoleEvent = SideBetEvt | TradeEvt | PnlEvt | RugRoyaleEvt | UnknownEvt;

export interface RoundAggregate {
  roundId: string;
  startAt: string;
  endAt: string;
  counts: {
    trades: number;
    sideBets: number;
  };
  sums: {
    totalBuyQty: number;
    totalSellQty: number;
    netQty: number;
    totalSideBetAmount: number;
    totalSideBetPayout: number;
  };
  uniquePlayers: number;
  lastStatus: string | null;
  tickMin: number | null;
  tickMax: number | null;
  gameIds: string[];
}

export interface RoundState {
  roundId: string;
  startAt: string;
  endAt: string | null;
  trades: TradeEvt[];
  sideBets: SideBetEvt[];
  playerIds: Set<string>;
  gameIds: Set<string>;
  tickIndices: number[];
  lastStatus: string | null;
}
