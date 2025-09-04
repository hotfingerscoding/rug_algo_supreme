import { Storage } from '../storage';
import config from '../config';
import { statSync, existsSync } from 'fs';
import { getDbPath, getJsonlPath } from '../config';

(async () => {
  console.log('🏥 Console Collector Health Report');
  console.log('================================');
  
  // Configuration
  console.log('\n📋 Configuration:');
  console.log(`   Event Source: ${config.EVENT_SOURCE}`);
  console.log(`   Round Inactivity: ${config.ROUND_INACTIVITY_S}s`);
  console.log(`   Retention: ${config.RETENTION_DAYS} days`);
  console.log(`   Max JSONL: ${config.MAX_JSONL_MB}MB`);
  console.log(`   Log Level: ${config.LOG_LEVEL}`);
  console.log(`   Heartbeat: ${config.HEARTBEAT_INTERVAL_MS}ms`);
  
  // Storage status
  console.log('\n💾 Storage Status:');
  const storage = new Storage();
  const storageStats = storage.getStorageStats();
  
  if (storageStats) {
    console.log(`   Database: ${storageStats.database.exists ? '✅' : '❌'} ${storageStats.database.size}`);
    console.log(`   JSONL: ${storageStats.jsonl.exists ? '✅' : '❌'} ${storageStats.jsonl.size}`);
    console.log(`   Data Directory: ${config.DATA_DIR}`);
  }
  
  // Database content
  console.log('\n📊 Database Content:');
  const roundCount = storage.getRoundCount();
  const roundFeatures = storage.getRoundFeatures();
  console.log(`   Rounds: ${roundCount}`);
  console.log(`   Round Features: ${roundFeatures.length}`);
  
  // Event metrics
  if (storageStats?.metrics) {
    console.log('\n📈 Event Metrics:');
    console.log(`   Inserted: ${storageStats.metrics.eventsInserted}`);
    console.log(`   Duplicated: ${storageStats.metrics.eventsDuplicated}`);
    console.log(`   WebSocket Source: ${storageStats.metrics.eventsSourceWs}`);
    console.log(`   Console Source: ${storageStats.metrics.eventsSourceConsole}`);
    console.log(`   Duplication Rate: ${storageStats.metrics.eventsInserted > 0 ? ((storageStats.metrics.eventsDuplicated / storageStats.metrics.eventsInserted) * 100).toFixed(2) : 0}%`);
  }
  
  // System info
  console.log('\n🖥️  System Info:');
  const memUsage = process.memoryUsage();
  console.log(`   Memory RSS: ${(memUsage.rss / 1024 / 1024).toFixed(1)}MB`);
  console.log(`   Memory Heap: ${(memUsage.heapUsed / 1024 / 1024).toFixed(1)}MB`);
  console.log(`   Memory External: ${(memUsage.external / 1024 / 1024).toFixed(1)}MB`);
  console.log(`   Node Version: ${process.version}`);
  console.log(`   Platform: ${process.platform} ${process.arch}`);
  
  // Recent activity
  if (roundFeatures.length > 0) {
    console.log('\n🕒 Recent Activity:');
    const recent = roundFeatures.slice(-3).reverse();
    recent.forEach((round: any, i: number) => {
      const startDate = new Date(round.startAt).toLocaleString();
      const duration = round.durationSec ? `${round.durationSec.toFixed(1)}s` : 'ongoing';
      console.log(`   ${i + 1}. ${startDate} - ${round.numTrades} trades, ${round.numSideBets} sideBets (${duration}) [${round.boundary_reason}]`);
    });
  }
  
  storage.close();
  console.log('\n✅ Health check completed');
})();
