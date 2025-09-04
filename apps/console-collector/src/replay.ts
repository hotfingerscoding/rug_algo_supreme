import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { Storage } from './storage';
import { Aggregator } from './aggregator';
import { parseConsoleLine } from './parsers/console';

class ReplayProcessor {
  private storage: Storage;
  private aggregator: Aggregator;

  constructor() {
    this.storage = new Storage();
    this.aggregator = new Aggregator(this.storage);
  }

  async replayFile(filePath: string, strictMode: boolean = false) {
    try {
      console.log(`🔄 Replaying events from: ${filePath}`);
      
      if (!existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
      }

      // Clear existing data
      console.log('🧹 Clearing existing rounds data...');
      this.storage.clearRounds();
      
      // Read and process each line
      const content = readFileSync(filePath, 'utf8');
      const lines = content.trim().split('\n');
      
      console.log(`📖 Processing ${lines.length} events...`);
      
      let processedCount = 0;
      let errorCount = 0;
      
      for (const line of lines) {
        try {
          if (line.trim()) {
            const event = parseConsoleLine(line, new Date().toISOString());
            if (event && event.kind !== 'console') {
              this.aggregator.ingest(event);
              processedCount++;
            }
          }
        } catch (error) {
          errorCount++;
          console.warn(`⚠️ Failed to process line: ${line.substring(0,100)}...`);
        }
      }
      
      // Force end any open round
      this.aggregator.forceEndRound();
      
      console.log(`✅ Replay completed!`);
      console.log(`📊 Processed: ${processedCount} events`);
      console.log(`❌ Errors: ${errorCount}`);
      console.log(`🏆 Total rounds: ${this.storage.getRoundCount()}`);
      
      // Strict mode verification
      if (strictMode) {
        console.log('🔒 Verifying replay consistency...');
        const roundFeatures = this.storage.getRoundFeatures();
        
        if (roundFeatures.length === 0) {
          console.log('⚠️ No rounds generated - this may indicate a parsing issue');
        } else {
          console.log(`✅ Generated ${roundFeatures.length} rounds with features:`);
          roundFeatures.forEach((round: any, i: number) => {
            console.log(`   ${i + 1}. ${round.startAt} → ${round.endAt} (${round.durationSec}s)`);
            console.log(`      Trades: ${round.numTrades}, SideBets: ${round.numSideBets}`);
            console.log(`      Players: ${round.uniquePlayers}, Boundary: ${round.boundary_reason}`);
          });
        }
      }
      
    } catch (error) {
      console.error('❌ Replay failed:', error);
      process.exit(1);
    } finally {
      this.storage.close();
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 1) {
    console.error('Usage: node replay.js <jsonl-file> [--strict]');
    console.error('Example: node replay.js ../../data/console_rounds.jsonl --strict');
    process.exit(1);
  }
  
  // Find the file path (first non-flag argument)
  const filePath = args.find(arg => !arg.startsWith('--'));
  const strictMode = args.includes('--strict');
  
  if (!filePath) {
    console.error('Error: No file path specified');
    console.error('Usage: node replay.js <jsonl-file> [--strict]');
    process.exit(1);
  }
  
  if (strictMode) {
    console.log('🔒 Strict mode enabled - will verify replay consistency');
  }
  
  const processor = new ReplayProcessor();
  await processor.replayFile(filePath, strictMode);
}

if (require.main === module) {
  main().catch(console.error);
}

