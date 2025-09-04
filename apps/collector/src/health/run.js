#!/usr/bin/env node
"use strict";
/**
 * Health check runner for collector
 */
Object.defineProperty(exports, "__esModule", { value: true });
const shared_1 = require("@rugs-research/shared");
const sanity_1 = require("./sanity");
async function runHealthCheck() {
    const db = new shared_1.SQLiteHelper(shared_1.config.get('DB_PATH'));
    try {
        console.log('🔍 Running health check...\n');
        // Run basic health check
        const health = (0, sanity_1.assertRecentActivity)(db);
        if (health.healthy) {
            console.log('✅ Collector is healthy');
        }
        else {
            console.log('⚠️  Collector has issues:');
            health.warnings.forEach(warning => console.log(`  ${warning}`));
        }
        console.log('\n📊 Health Metrics:');
        console.log(`  WS frames (5min): ${health.dataQuality.wsFramesLast5Min}`);
        console.log(`  Ticks (5min): ${health.dataQuality.ticksLast5Min}`);
        console.log(`  Rounds (1hr): ${health.dataQuality.roundsLastHour}`);
        // Get detailed metrics
        const metrics = (0, sanity_1.getHealthMetrics)(db);
        console.log('\n📈 Summary:');
        console.log(`  Total rounds: ${metrics.summary.totalRounds}`);
        console.log(`  Total ticks: ${metrics.summary.totalTicks}`);
        console.log(`  Total WS frames: ${metrics.summary.totalWSFrames}`);
        console.log(`  Total events: ${metrics.summary.totalEvents}`);
        if (metrics.recent.lastRound) {
            console.log(`  Last round: ${new Date(metrics.recent.lastRound.started_at).toISOString()}`);
        }
        if (metrics.recent.lastTick) {
            console.log(`  Last tick: ${new Date(metrics.recent.lastTick.ts).toISOString()}`);
        }
        console.log('\n🎯 Data Quality:');
        console.log(`  Rounds with data: ${metrics.quality.roundsWithData}/${metrics.summary.totalRounds}`);
        console.log(`  Ticks with multiplier: ${metrics.quality.ticksWithMultiplier}/${metrics.summary.totalTicks}`);
        if (Object.keys(metrics.quality.eventsByType).length > 0) {
            console.log('  Events by type:');
            Object.entries(metrics.quality.eventsByType).forEach(([type, count]) => {
                console.log(`    ${type}: ${count}`);
            });
        }
    }
    catch (error) {
        console.error('❌ Health check failed:', error);
        process.exit(1);
    }
    finally {
        db.close();
    }
}
// Run if called directly
if (require.main === module) {
    runHealthCheck().catch(error => {
        console.error('Health check failed:', error);
        process.exit(1);
    });
}
//# sourceMappingURL=run.js.map