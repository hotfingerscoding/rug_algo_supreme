"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.assertRecentActivity = assertRecentActivity;
exports.getHealthMetrics = getHealthMetrics;
const shared_1 = require("@rugs-research/shared");
/**
 * Assert recent activity and data quality
 */
function assertRecentActivity(db, logger) {
    const log = logger || new shared_1.Logger();
    const warnings = [];
    const now = shared_1.timeUtils.now();
    const fiveMinutesAgo = now - 5 * 60 * 1000;
    const oneHourAgo = now - 60 * 60 * 1000;
    // Check WebSocket activity
    const wsFramesLast5Min = db.getWSFrames().filter(frame => frame.ts >= fiveMinutesAgo).length;
    const lastWSFrame = db.getWSFrames().pop()?.ts;
    if (wsFramesLast5Min === 0) {
        warnings.push('[HEALTH] No WebSocket frames in last 5 minutes');
    }
    // Check tick activity
    const ticksLast5Min = db.getTicks().filter(tick => tick.ts >= fiveMinutesAgo).length;
    const lastTick = db.getTicks().pop()?.ts;
    if (ticksLast5Min === 0) {
        warnings.push('[HEALTH] No ticks in last 5 minutes');
    }
    // Check round activity
    const roundsLastHour = db.getRounds().filter(round => round.started_at && round.started_at >= oneHourAgo).length;
    if (roundsLastHour === 0) {
        warnings.push('[HEALTH] No rounds started in last hour');
    }
    // Check for current live round
    const currentRound = db.getRounds().find(round => round.started_at && !round.ended_at);
    if (currentRound) {
        // Check if ticks are advancing in live round
        const roundTicks = db.getTicks().filter(tick => tick.round_id === currentRound.id);
        if (roundTicks.length > 1) {
            const tickTimestamps = roundTicks.map(tick => tick.ts).sort((a, b) => a - b);
            const lastTickTs = tickTimestamps[tickTimestamps.length - 1];
            const secondLastTickTs = tickTimestamps[tickTimestamps.length - 2];
            if (lastTickTs <= secondLastTickTs) {
                warnings.push('[HEALTH] Ticks not advancing in current round');
            }
        }
    }
    // Log warnings
    for (const warning of warnings) {
        log.warn(warning);
    }
    const healthy = warnings.length === 0;
    return {
        healthy,
        warnings,
        lastWSFrame,
        lastTick,
        currentRound,
        dataQuality: {
            wsFramesLast5Min,
            ticksLast5Min,
            roundsLastHour
        }
    };
}
/**
 * Get detailed health metrics
 */
function getHealthMetrics(db) {
    const now = shared_1.timeUtils.now();
    const oneHourAgo = now - 60 * 60 * 1000;
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    const rounds = db.getRounds();
    const ticks = db.getTicks();
    const wsFrames = db.getWSFrames();
    const events = db.getEvents();
    return {
        summary: {
            totalRounds: rounds.length,
            totalTicks: ticks.length,
            totalWSFrames: wsFrames.length,
            totalEvents: events.length,
            roundsLastHour: rounds.filter(r => r.started_at && r.started_at >= oneHourAgo).length,
            roundsLastDay: rounds.filter(r => r.started_at && r.started_at >= oneDayAgo).length,
        },
        recent: {
            lastRound: rounds[rounds.length - 1],
            lastTick: ticks[ticks.length - 1],
            lastWSFrame: wsFrames[wsFrames.length - 1],
            lastEvent: events[events.length - 1],
        },
        quality: {
            roundsWithData: rounds.filter(r => r.max_x !== null).length,
            ticksWithMultiplier: ticks.filter(t => t.x !== null).length,
            eventsByType: events.reduce((acc, event) => {
                acc[event.type] = (acc[event.type] || 0) + 1;
                return acc;
            }, {})
        }
    };
}
//# sourceMappingURL=sanity.js.map