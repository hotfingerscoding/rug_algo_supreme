import { readFileSync, existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import { Storage } from '../src/storage';
import { Aggregator } from '../src/aggregator';
import { parseConsoleLine } from '../src/parsers/console';

describe('Replay Consistency', () => {
  let storage: Storage;
  let aggregator: Aggregator;
  const testDataPath = join(__dirname, '../test-fixtures/sample-events.jsonl');
  const goldenPath = join(__dirname, '../test-fixtures/golden-rounds.json');

  beforeEach(() => {
    storage = new Storage();
    aggregator = new Aggregator(storage);
  });

  afterEach(() => {
    storage.close();
  });

  it('should produce consistent round features from test fixture', () => {
    // Clear existing data
    storage.clearRounds();
    
    // Read test fixture
    const content = readFileSync(testDataPath, 'utf8');
    const lines = content.trim().split('\n');
    
    // Process each line
    let processedCount = 0;
    for (const line of lines) {
      if (line.trim()) {
        const event = parseConsoleLine(line, new Date().toISOString());
        if (event && event.kind !== 'console') {
          aggregator.ingest(event);
          processedCount++;
        }
      }
    }
    
    // Force end any open round
    aggregator.forceEndRound();
    
    // Get results
    const roundFeatures = storage.getRoundFeatures();
    
    // Verify we got exactly 1 round
    expect(roundFeatures).toHaveLength(1);
    
    const round = roundFeatures[0];
    
    // Verify round structure
    expect(round).toHaveProperty('id');
    expect(round).toHaveProperty('startAt');
    expect(round).toHaveProperty('endAt');
    expect(round).toHaveProperty('durationSec');
    expect(round).toHaveProperty('boundary_reason');
    expect(round).toHaveProperty('numTrades');
    expect(round).toHaveProperty('numSideBets');
    expect(round).toHaveProperty('uniquePlayers');
    expect(round).toHaveProperty('avgBetSize');
    expect(round).toHaveProperty('maxWager');
    expect(round).toHaveProperty('tradeIntensity');
    expect(round).toHaveProperty('volatility');
    
    // Verify specific values from our test fixture
    expect(round.boundary_reason).toBe('pnlDebug');
    expect(round.numTrades).toBe(2); // 2 trade events (buy + sell)
    expect(round.numSideBets).toBe(1); // 1 side bet event
    expect(round.uniquePlayers).toBe(2); // 2 unique players
    
    // Verify computed features
    expect(round.avgBetSize).toBe(100); // 100 from side bet
    expect(round.maxWager).toBe(100); // 100 from side bet
    expect(round.tradeIntensity).toBeGreaterThan(0); // Should have some intensity
    expect(round.volatility).toBeGreaterThan(0); // Should have some volatility
    
    console.log('✅ Replay consistency test passed');
    console.log(`   Round: ${round.startAt} → ${round.endAt}`);
    console.log(`   Trades: ${round.numTrades}, SideBets: ${round.numSideBets}`);
    console.log(`   Players: ${round.uniquePlayers}, Boundary: ${round.boundary_reason}`);
  });

  it('should handle multiple replays consistently', () => {
    // First replay
    storage.clearRounds();
    const content1 = readFileSync(testDataPath, 'utf8');
    const lines1 = content1.trim().split('\n');
    
    for (const line of lines1) {
      if (line.trim()) {
        const event = parseConsoleLine(line, new Date().toISOString());
        if (event && event.kind !== 'console') {
          aggregator.ingest(event);
        }
      }
    }
    aggregator.forceEndRound();
    
    const results1 = storage.getRoundFeatures();
    
    // Second replay
    storage.clearRounds();
    const content2 = readFileSync(testDataPath, 'utf8');
    const lines2 = content2.trim().split('\n');
    
    for (const line of lines2) {
      if (line.trim()) {
        const event = parseConsoleLine(line, new Date().toISOString());
        if (event && event.kind !== 'console') {
          aggregator.ingest(event);
        }
      }
    }
    aggregator.forceEndRound();
    
    const results2 = storage.getRoundFeatures();
    
    // Results should be identical
    expect(results1).toHaveLength(results2.length);
    
    if (results1.length > 0 && results2.length > 0) {
      const round1 = results1[0];
      const round2 = results2[0];
      
      // Compare key fields (excluding timestamps which will differ)
      expect(round1.numTrades).toBe(round2.numTrades);
      expect(round1.numSideBets).toBe(round2.numSideBets);
      expect(round1.uniquePlayers).toBe(round2.uniquePlayers);
      expect(round1.boundary_reason).toBe(round2.boundary_reason);
      expect(round1.avgBetSize).toBe(round2.avgBetSize);
      expect(round1.maxWager).toBe(round2.maxWager);
    }
    
    console.log('✅ Multiple replay consistency test passed');
  });
});
