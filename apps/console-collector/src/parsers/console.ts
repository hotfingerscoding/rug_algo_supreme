export type ParsedEvent =
  | { kind: 'sideBet'; t: string; payload: any; }
  | { kind: 'trade'; t: string; payload: any; }
  | { kind: 'rugRoyaleUpdate'; t: string; payload: any; }
  | { kind: 'pnlDebug'; t: string; payload: { active: boolean; wasActive: boolean; autobuysEnabled?: boolean; pendingDisableAutobets?: boolean; autoRoundsCompleted?: number; pnl?: number; raw: string; }; }
  | { kind: 'console'; t: string; raw: string }
  | { kind: 'unknown'; raw: string };

export function parseConsoleLine(line: string, t = new Date().toISOString()): ParsedEvent | { kind: 'unknown'; raw: string } | null {
  const trimmed = line.trim();

  // PnL debug
  if (trimmed.includes('PnL Tracking Debug')) {
    // Expect "active=false, wasActive=true, ..."
    const m = trimmed.match(/active\s*=\s*(\w+).*?wasActive\s*=\s*(\w+).*?autobuysEnabled\s*=\s*(\w+).*?pendingDisableAutobets\s*=\s*(\w+).*?autoRoundsCompleted\s*=\s*([-\d]+).*?pnl\s*=\s*([-\d.]+)/i);
    const bool = (v?: string) => String(v).toLowerCase() === 'true';
    const num = (v?: string) => (v == null ? undefined : Number(v));
    return {
      kind: 'pnlDebug',
      t,
      payload: {
        active: bool(m?.[1]),
        wasActive: bool(m?.[2]),
        autobuysEnabled: bool(m?.[3]),
        pendingDisableAutobets: bool(m?.[4]),
        autoRoundsCompleted: num(m?.[5]),
        pnl: num(m?.[6]),
        raw: trimmed,
      },
    };
  }

  // Try to grab valid JSON
  const jsonBlock = extractJsonish(trimmed);
  if (jsonBlock) {
    try {
      const obj = JSON.parse(jsonBlock);
      
      // Side bet
      if (/\[SOCKET\]\s*newSideBet received:/i.test(trimmed)) {
        return { kind: 'sideBet', t, payload: obj };
      }

      // Trade
      if (/New trade received:/i.test(trimmed)) {
        return { kind: 'trade', t, payload: obj };
      }

      // RugRoyaleUpdate
      if (/\[SOCKET\]\s*rugRoyaleUpdate received:/i.test(trimmed)) {
        return { kind: 'rugRoyaleUpdate', t, payload: obj };
      }
      
      // If we have JSON but don't recognize the type, return as console event
      return { kind: 'console', t, raw: trimmed };
      
    } catch (err) {
      // fall through to non-JSON handlers
    }
  }

  // Non-JSON handlers - no JSON found, use PnL/unknown fallback
  console.debug('Parser: no JSON found, using PnL/unknown fallback', { sample: trimmed.slice(0, 160) });
  
  // If it matches PnL debug -> return { kind: 'pnlDebug', ... } (already handled above)
  // Otherwise:
  return { kind: 'unknown', raw: trimmed };
}

// Returns the rightmost balanced {...} JSON block, or null if none found
function getRightmostJsonObject(line: string): string | null {
  let depth = 0;
  let start = -1;
  let bestStart = -1;
  let bestEnd = -1;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === '}') {
      if (depth > 0) {
        depth--;
        if (depth === 0 && start !== -1) {
          bestStart = start;
          bestEnd = i;
        }
      }
    }
  }

  if (bestStart >= 0 && bestEnd >= bestStart) {
    return line.slice(bestStart, bestEnd + 1);
  }
  return null;
}

function extractJsonish(line: string): string | null {
  // Prefer JSON immediately following known labels
  const labelPatterns = [
    /New trade received:\s*(\{.*)$/s,
    /\[SOCKET\]\s*newSideBet received:\s*(\{.*)$/s,
    /\[SOCKET\]\s*rugRoyaleUpdate received:\s*(\{.*)$/s,
  ];

  for (const re of labelPatterns) {
    const m = line.match(re);
    if (m && m[1]) {
      const rightmost = getRightmostJsonObject(m[1]);
      if (rightmost) return rightmost;
    }
  }

  // Fallback: take the rightmost balanced JSON object from the entire line
  return getRightmostJsonObject(line);
}


