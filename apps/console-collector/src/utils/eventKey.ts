import { createHash } from 'crypto';

/**
 * Generate a deterministic event key for deduplication
 * Format: event_type|gameId|playerId|tickIndex|isoTimestamp|payloadHash
 */
export function generateEventKey(
  eventType: string,
  gameId: string | null,
  playerId: string | null,
  tickIndex: number | null,
  timestamp: string,
  payload: any
): string {
  // Normalize values to prevent undefined/null issues
  const normalizedGameId = gameId || '';
  const normalizedPlayerId = playerId || '';
  const normalizedTickIndex = tickIndex !== null ? tickIndex.toString() : '';
  
  // Create a hash of the payload for uniqueness
  const payloadHash = createHash('md5')
    .update(JSON.stringify(payload))
    .digest('hex')
    .substring(0, 8);
  
  // Combine all components with pipe separator
  const key = [
    eventType,
    normalizedGameId,
    normalizedPlayerId,
    normalizedTickIndex,
    timestamp,
    payloadHash
  ].join('|');
  
  return key;
}

/**
 * Extract key components from different event types
 */
export function extractEventKeyComponents(event: any): {
  eventType: string;
  gameId: string | null;
  playerId: string | null;
  tickIndex: number | null;
} {
  switch (event.kind) {
    case 'trade':
      return {
        eventType: 'trade',
        gameId: event.payload?.gameId || null,
        playerId: event.payload?.playerId || null,
        tickIndex: event.payload?.tickIndex || null,
      };
    case 'sideBet':
      return {
        eventType: 'sideBet',
        gameId: event.payload?.gameId || null,
        playerId: event.payload?.playerId || null,
        tickIndex: null, // Side bets don't have tick index
      };
    case 'pnlDebug':
      return {
        eventType: 'pnlDebug',
        gameId: null,
        playerId: null,
        tickIndex: null,
      };
    case 'rugRoyaleUpdate':
      return {
        eventType: 'rugRoyaleUpdate',
        gameId: null,
        playerId: null,
        tickIndex: null,
      };
    default:
      return {
        eventType: event.kind || 'unknown',
        gameId: null,
        playerId: null,
        tickIndex: null,
      };
  }
}
