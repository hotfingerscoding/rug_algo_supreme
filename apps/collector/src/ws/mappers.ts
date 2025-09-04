import { Event } from './types';
import { extractNumber, extractString } from './decoder';
import { timeUtils } from '@rugs-research/shared';

/**
 * Best-effort mapping of WebSocket objects to structured events
 * Uses heuristics to detect game-related fields
 */
export function mapToEvent(obj: any): Event {
  const ts = timeUtils.now();
  
  if (!obj || typeof obj !== 'object') {
    return { type: 'UNKNOWN', ts, raw: obj };
  }

  // Extract all keys for pattern matching
  const keys = Object.keys(obj).map(k => k.toLowerCase());
  const values = Object.values(obj);
  const stringValues = values.map(v => String(v).toLowerCase());

  // Look for multiplier/price patterns
  const multiplierKeys = keys.filter(k => /multiplier|x|price/i.test(k));
  const multiplierValue = multiplierKeys.length > 0 ? extractNumber(obj[multiplierKeys[0]]) : null;

  // Look for round/phase/state patterns
  const roundKeys = keys.filter(k => /round|phase|state/i.test(k));
  const roundValue = roundKeys.length > 0 ? obj[roundKeys[0]] : null;

  // Look for player/bettor patterns
  const playerKeys = keys.filter(k => /player|bett?ers/i.test(k));
  const playerValue = playerKeys.length > 0 ? extractNumber(obj[playerKeys[0]]) : null;

  // Look for wager/amount/pool patterns
  const wagerKeys = keys.filter(k => /wager|amount|pool/i.test(k));
  const wagerValue = wagerKeys.length > 0 ? extractNumber(obj[wagerKeys[0]]) : null;

  // Look for countdown/timer patterns
  const timerKeys = keys.filter(k => /countdown|timer/i.test(k));
  const timerValue = timerKeys.length > 0 ? extractNumber(obj[timerKeys[0]]) : null;

  // Look for round start signals
  const startSignals = stringValues.some(v => 
    /start|begin|new|init/i.test(v) || 
    /live|active|running/i.test(v)
  );

  // Look for round end signals
  const endSignals = stringValues.some(v => 
    /end|stop|finish|complete/i.test(v) || 
    /rug|crash|boom/i.test(v)
  );

  // Look for heartbeat/ping signals
  const heartbeatSignals = stringValues.some(v => 
    /ping|pong|heartbeat|keepalive/i.test(v)
  );

  // Determine event type based on detected patterns
  if (startSignals || (roundValue && /start|new/i.test(String(roundValue)))) {
    return {
      type: 'ROUND_START',
      ts,
      roundKey: roundValue
    };
  }

  if (endSignals || (roundValue && /end|stop/i.test(String(roundValue)))) {
    return {
      type: 'ROUND_END',
      ts,
      roundKey: roundValue,
      rugX: multiplierValue
    };
  }

  if (heartbeatSignals) {
    return {
      type: 'HEARTBEAT',
      ts
    };
  }

  // If we have game-related data, treat as TICK
  if (multiplierValue !== null || playerValue !== null || wagerValue !== null || timerValue !== null) {
    return {
      type: 'TICK',
      ts,
      x: multiplierValue,
      timer: timerValue,
      players: playerValue,
      wager: wagerValue
    };
  }

  // Fallback to UNKNOWN
  return {
    type: 'UNKNOWN',
    ts,
    raw: obj
  };
}

/**
 * Batch process multiple objects into events
 */
export function mapToEvents(objects: Array<unknown>): Event[] {
  return objects.map(obj => mapToEvent(obj));
}
