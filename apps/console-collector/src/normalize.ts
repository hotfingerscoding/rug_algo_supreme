import { ConsoleEvent, SideBetEvt, TradeEvt, PnlEvt, RugRoyaleEvt, UnknownEvt } from './types';

export function normalizeConsoleMessage(message: string): ConsoleEvent {
  const timestamp = new Date().toISOString();
  
  // Strip index-*.js:* prefix if present
  const cleanMessage = message.replace(/^index-[^:]+:\s*/, '');
  
  // [SOCKET] newSideBet received: {...}
  if (cleanMessage.includes('[SOCKET] newSideBet received:')) {
    try {
      const jsonStart = cleanMessage.indexOf('{');
      if (jsonStart !== -1) {
        const jsonStr = cleanMessage.substring(jsonStart);
        const fixedJson = fixJsonString(jsonStr);
        const data = JSON.parse(fixedJson);
        
        return {
          type: 'sideBet',
          playerId: data.playerId || '',
          gameId: data.gameId || '',
          username: data.username || null,
          betAmount: data.betAmount || 0,
          xPayout: data.xPayout,
          payout: data.payout,
          timestamp
        } as SideBetEvt;
      }
    } catch (error) {
      console.warn('Failed to parse sideBet event:', cleanMessage, error);
    }
  }
  
  // New trade received: {...}
  if (cleanMessage.includes('New trade received:')) {
    try {
      const jsonStart = cleanMessage.indexOf('{');
      if (jsonStart !== -1) {
        const jsonStr = cleanMessage.substring(jsonStart);
        const fixedJson = fixJsonString(jsonStr);
        const data = JSON.parse(fixedJson);
        
        return {
          type: 'trade',
          id: data.id || '',
          qty: data.qty || 0,
          tickIndex: data.tickIndex || 0,
          gameId: data.gameId || '',
          timestamp
        } as TradeEvt;
      }
    } catch (error) {
      console.warn('Failed to parse trade event:', cleanMessage, error);
    }
  }
  
  // [SOCKET] rugRoyaleUpdate received: {...}
  if (cleanMessage.includes('[SOCKET] rugRoyaleUpdate received:')) {
    try {
      const jsonStart = cleanMessage.indexOf('{');
      if (jsonStart !== -1) {
        const jsonStr = cleanMessage.substring(jsonStart);
        const fixedJson = fixJsonString(jsonStr);
        const data = JSON.parse(fixedJson);
        
        return {
          type: 'rugRoyale',
          status: data.status || '',
          timestamp
        } as RugRoyaleEvt;
      }
    } catch (error) {
      console.warn('Failed to parse rugRoyale event:', cleanMessage, error);
    }
  }
  
  // 🔍 PnL Tracking Debug: active=false, wasActive=true, ...
  if (cleanMessage.includes('🔍 PnL Tracking Debug:')) {
    try {
      const debugPart = cleanMessage.split('🔍 PnL Tracking Debug:')[1]?.trim();
      if (debugPart) {
        const flags = parseDebugFlags(debugPart);
        
        return {
          type: 'pnl',
          active: flags.active || false,
          wasActive: flags.wasActive || false,
          timestamp
        } as PnlEvt;
      }
    } catch (error) {
      console.warn('Failed to parse PnL event:', cleanMessage, error);
    }
  }
  
  return {
    type: 'unknown',
    raw: cleanMessage,
    timestamp
  } as UnknownEvt;
}

function fixJsonString(jsonStr: string): string {
  // Remove trailing commas
  let fixed = jsonStr.replace(/,(\s*[}\]])/g, '$1');
  
  // Convert single quotes to double quotes
  fixed = fixed.replace(/'/g, '"');
  
  // Fix common JSON issues
  fixed = fixed.replace(/(\w+):/g, '"$1":');
  
  return fixed;
}

function parseDebugFlags(debugStr: string): Record<string, boolean> {
  const flags: Record<string, boolean> = {};
  
  // Parse key=value pairs
  const pairs = debugStr.split(',').map(pair => pair.trim());
  
  for (const pair of pairs) {
    const [key, value] = pair.split('=');
    if (key && value !== undefined) {
      flags[key.trim()] = value.trim() === 'true';
    }
  }
  
  return flags;
}

export function normalizeWebSocketFrame(payloadData: string): ConsoleEvent | null {
  // Check if WebSocket frame contains known markers
  if (payloadData.includes('newSideBet') || 
      payloadData.includes('New trade') || 
      payloadData.includes('rugRoyaleUpdate') || 
      payloadData.includes('PnL')) {
    
    try {
      // Try to parse as JSON first
      const data = JSON.parse(payloadData);
      if (data.type === 'newSideBet') {
        return {
          type: 'sideBet',
          playerId: data.playerId || '',
          gameId: data.gameId || '',
          username: data.username || null,
          betAmount: data.betAmount || 0,
          xPayout: data.xPayout,
          payout: data.payout,
          timestamp: new Date().toISOString()
        } as SideBetEvt;
      }
      
      if (data.type === 'trade') {
        return {
          type: 'trade',
          id: data.id || '',
          qty: data.qty || 0,
          tickIndex: data.tickIndex || 0,
          gameId: data.gameId || '',
          timestamp: new Date().toISOString()
        } as TradeEvt;
      }
      
      if (data.type === 'rugRoyaleUpdate') {
        return {
          type: 'rugRoyale',
          status: data.status || '',
          timestamp: new Date().toISOString()
        } as RugRoyaleEvt;
      }
      
    } catch (error) {
      // If JSON parsing fails, try console message parsing
      return normalizeConsoleMessage(payloadData);
    }
  }
  
  return null;
}
