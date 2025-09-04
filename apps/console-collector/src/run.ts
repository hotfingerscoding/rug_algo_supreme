import { chromium, BrowserContext, Page } from 'playwright';
import { join } from 'path';
import { Storage } from './storage';
import { Aggregator } from './aggregator';
import { parseConsoleLine } from './parsers/console';
import { normalizeWebSocketFrame } from './normalize';
import config from './config';

export class ConsoleCollector {
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private storage: Storage;
  private aggregator: Aggregator;
  private isShuttingDown = false;

  constructor() {
    this.storage = new Storage();
    this.aggregator = new Aggregator(this.storage);
  }

  async start() {
    try {
      console.log('🚀 Starting console collector...');
      
      // Create persistent context for headed browser
      const userDataDir = join(__dirname, '../../../.browser-data');
      this.context = await chromium.launchPersistentContext(userDataDir, {
        headless: false,
        args: ['--disable-web-security', '--disable-features=VizDisplayCompositor']
      });

      this.page = await this.context.newPage();
      
      // Hook console events
      this.page.on('console', async (msg) => {
        try {
          // msg.text() is valid on ConsoleMessage itself
          const prefix = (() => {
            try { return msg.text(); } catch { return ''; }
          })();

          // msg.args() are JSHandles; evaluate each in page context to stringify
          const argStrings = await Promise.all(
            msg.args().map(async (handle) => {
              try {
                return await handle.evaluate((v: any) => {
                  if (v === undefined) return 'undefined';
                  if (v === null) return 'null';
                  if (typeof v === 'string') return v;
                  if (typeof v === 'number' || typeof v === 'boolean' || typeof v === 'bigint') return String(v);
                  try { return JSON.stringify(v); } catch {}
                  // fallback for functions, Symbols, etc.
                  const tag = Object.prototype.toString.call(v);
                  return tag;
                });
              } catch {
                return '[Unserializable console arg]';
              }
            })
          );

          const combined = [prefix, ...argStrings].filter(Boolean).join(' ');
          await this.handleRawLine(combined);
        } catch (err) {
          console.warn('⚠️ Failed to process console message:', err);
        }
      });
      
      // Hook CDP for WebSocket frames
      await this.setupCDP();
      
      // Navigate to rugs.fun
      console.log('🌐 Navigating to rugs.fun...');
      await this.page.goto('https://rugs.fun', { waitUntil: 'networkidle' });
      
      console.log('✅ Console collector is running! Press Ctrl+C to stop.');
      console.log(`📊 Current rounds in DB: ${this.storage.getRoundCount()}`);
      
      // Keep alive
      await this.keepAlive();
      
    } catch (error) {
      console.error('❌ Failed to start collector:', error);
      await this.cleanup();
      process.exit(1);
    }
  }

  private async setupCDP() {
    if (!this.page) return;
    
    try {
      const client = await this.page.context().newCDPSession(this.page);
      await client.send('Network.enable');
      
      // Listen for WebSocket frames
      client.on('Network.webSocketFrameReceived', (event) => {
        if (event.response.payloadData) {
          this.processWebSocketFrame(event.response.payloadData);
        }
      });
      
      client.on('Network.webSocketFrameSent', (event) => {
        if (event.response.payloadData) {
          this.processWebSocketFrame(event.response.payloadData);
        }
      });
      
      console.log('🔌 CDP WebSocket monitoring enabled');
    } catch (error) {
      console.warn('⚠️ Failed to setup CDP, continuing with console only:', error);
    }
  }



  private processWebSocketFrame(payloadData: string) {
    try {
      const event = normalizeWebSocketFrame(payloadData);
      if (event) {
        // Convert to ParsedEvent format
        const t = new Date().toISOString();
        const evt: { kind: 'console'; t: string; raw: string } = { kind: 'console', t, raw: payloadData };
        
        // Use deduplication with WebSocket source
        if (config.EVENT_SOURCE === 'ws' || config.EVENT_SOURCE === 'both') {
          this.storage.insertEventWithDedup(t, evt.kind, JSON.stringify(evt), 'ws');
          if (this.aggregator?.ingest) this.aggregator.ingest(evt);
        }
      }
    } catch (error) {
      console.warn('⚠️ Failed to process WebSocket frame:', error);
    }
  }

  async handleRawLine(line: string) {
    const t = new Date().toISOString();
    const evt = parseConsoleLine(line, t) ?? { kind: 'console', t, raw: line };

    // Persist with deduplication if console source is enabled
    if (config.EVENT_SOURCE === 'console' || config.EVENT_SOURCE === 'both') {
      this.storage.insertEventWithDedup(t, evt.kind, JSON.stringify(evt), 'console');
    }

    // Aggregate
    if (this.aggregator?.ingest) this.aggregator.ingest(evt);
  }

  private async keepAlive() {
    // Print stats every 30 seconds
    const statsInterval = setInterval(() => {
      if (this.isShuttingDown) {
        clearInterval(statsInterval);
        return;
      }
      
      const currentStats = this.aggregator.getCurrentRoundStats();
      const storageStats = this.storage.getStorageStats();
      const memUsage = process.memoryUsage();
      
      if (currentStats) {
        const duration = Math.round(currentStats.duration / 1000);
        console.log(`📈 Active round: ${duration}s, trades: ${currentStats.trades}, sideBets: ${currentStats.sideBets}, players: ${currentStats.uniquePlayers}`);
      }
      
      // Log storage and memory metrics
      if (storageStats) {
        console.log(`💾 Storage: DB ${storageStats.database.size}, JSONL ${storageStats.jsonl.size}, Events: ${storageStats.metrics.eventsInserted} inserted, ${storageStats.metrics.eventsDuplicated} duplicated`);
        console.log(`🧠 Memory: RSS ${(memUsage.rss / 1024 / 1024).toFixed(1)}MB, Heap ${(memUsage.heapUsed / 1024 / 1024).toFixed(1)}MB`);
      }
    }, config.HEARTBEAT_INTERVAL_MS);

    // Wait for shutdown signal
    await new Promise<void>((resolve) => {
      process.on('SIGINT', async () => {
        console.log('\n🛑 Shutting down...');
        this.isShuttingDown = true;
        clearInterval(statsInterval);
        await this.cleanup();
        resolve();
      });
    });
  }

  private async cleanup() {
    try {
      // Force end any open round
      this.aggregator.forceEndRound();
      
      // Close browser
      if (this.context) {
        await this.context.close();
      }
      
      // Close storage
      this.storage.close();
      
      console.log('✅ Cleanup completed');
    } catch (error) {
      console.error('❌ Error during cleanup:', error);
    }
  }
}

// Start the collector
async function main() {
  const collector = new ConsoleCollector();
  await collector.start();
}

if (require.main === module) {
  main().catch(console.error);
}
