import { SQLiteHelper, Logger } from '@rugs-research/shared';
export interface HealthStatus {
    healthy: boolean;
    warnings: string[];
    lastWSFrame?: number;
    lastTick?: number;
    currentRound?: any;
    dataQuality: {
        wsFramesLast5Min: number;
        ticksLast5Min: number;
        roundsLastHour: number;
    };
}
/**
 * Assert recent activity and data quality
 */
export declare function assertRecentActivity(db: SQLiteHelper, logger?: Logger): HealthStatus;
/**
 * Get detailed health metrics
 */
export declare function getHealthMetrics(db: SQLiteHelper): any;
//# sourceMappingURL=sanity.d.ts.map