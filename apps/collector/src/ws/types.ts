// Event types for WebSocket message mapping
export type Event =
  | { type: 'ROUND_START'; ts: number; roundKey?: string | number }
  | { type: 'ROUND_END'; ts: number; roundKey?: string | number; rugX?: number | null }
  | { type: 'TICK'; ts: number; x?: number | null; timer?: number | null; players?: number | null; wager?: number | null }
  | { type: 'HEARTBEAT'; ts: number }
  | { type: 'UNKNOWN'; ts: number; raw: any };

// Raw WebSocket message structure
export interface WSMessage {
  raw: string;
  parsed?: any;
  timestamp: number;
}
