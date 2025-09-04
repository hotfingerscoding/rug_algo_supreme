"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PredictionInputSchema = exports.PredictionSchema = exports.WSFrameSchema = exports.RoundSchema = exports.TickSchema = void 0;
const zod_1 = require("zod");
// Tick schema for individual data points
exports.TickSchema = zod_1.z.object({
    ts: zod_1.z.number(),
    phase: zod_1.z.enum(['live', 'cooldown', 'unknown']),
    x: zod_1.z.number().nullable(),
    timer: zod_1.z.string().nullable().optional(),
    players: zod_1.z.number().nullable().optional(),
    totalWager: zod_1.z.number().nullable().optional(),
});
// Round schema for complete round data
exports.RoundSchema = zod_1.z.object({
    id: zod_1.z.number(),
    started_at: zod_1.z.number(),
    ended_at: zod_1.z.number().nullable().optional(),
    max_x: zod_1.z.number().nullable().optional(),
    min_x: zod_1.z.number().nullable().optional(),
    avg_x: zod_1.z.number().nullable().optional(),
    rug_time_s: zod_1.z.number().nullable().optional(),
    rug_x: zod_1.z.number().nullable().optional(),
    players: zod_1.z.number().nullable().optional(),
    total_wager: zod_1.z.number().nullable().optional(),
    sidebet_windows: zod_1.z.array(zod_1.z.object({
        window_idx: zod_1.z.number(),
        start_s: zod_1.z.number(),
        end_s: zod_1.z.number(),
        rug_in_window: zod_1.z.boolean()
    })).optional(),
});
// WebSocket frame schema
exports.WSFrameSchema = zod_1.z.object({
    ts: zod_1.z.number(),
    dir: zod_1.z.enum(['in', 'out']),
    data: zod_1.z.string(),
});
// Prediction response schema
exports.PredictionSchema = zod_1.z.object({
    p_rug_5s: zod_1.z.number(),
    p_rug_10s: zod_1.z.number(),
});
// Prediction input schema
exports.PredictionInputSchema = zod_1.z.object({
    x: zod_1.z.number(),
    t: zod_1.z.number(),
    slope: zod_1.z.number(),
    vol: zod_1.z.number(),
    players: zod_1.z.number(),
    wager: zod_1.z.number(),
});
//# sourceMappingURL=index.js.map