import { Storage } from '../storage';
import config from '../config';

(async () => {
  console.log('🧹 Starting retention cleanup...');
  console.log(`📅 Retention policy: ${config.RETENTION_DAYS} days`);
  console.log(`💾 Max JSONL size: ${config.MAX_JSONL_MB}MB`);
  
  const storage = new Storage();
  
  // Get storage stats before cleanup
  const beforeStats = storage.getStorageStats();
  if (beforeStats) {
    console.log(`📊 Before cleanup: DB ${beforeStats.database.size}, JSONL ${beforeStats.jsonl.size}`);
  }
  
  // Prune old events
  const pruneResult = storage.pruneOldEvents();
  if (pruneResult) {
    console.log(`✅ Cleanup completed:`);
    console.log(`   - Events deleted: ${pruneResult.eventsDeleted}`);
    console.log(`   - Events remaining: ${pruneResult.eventsRemaining}`);
    console.log(`   - Cutoff date: ${pruneResult.cutoffDate}`);
  } else {
    console.log('❌ Cleanup failed');
    process.exit(1);
  }
  
  // Get storage stats after cleanup
  const afterStats = storage.getStorageStats();
  if (afterStats) {
    console.log(`📊 After cleanup: DB ${afterStats.database.size}, JSONL ${afterStats.jsonl.size}`);
    console.log(`📈 Metrics: ${afterStats.metrics.eventsInserted} inserted, ${afterStats.metrics.eventsDuplicated} duplicated`);
  }
  
  storage.close();
  console.log('✅ Prune operation completed');
})();
