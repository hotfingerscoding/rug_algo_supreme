import { z } from 'zod';
export declare const TickSchema: z.ZodObject<{
    ts: z.ZodNumber;
    phase: z.ZodEnum<["live", "cooldown", "unknown"]>;
    x: z.ZodNullable<z.ZodNumber>;
    timer: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    players: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    totalWager: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
}, "strip", z.ZodTypeAny, {
    x: number | null;
    phase: "cooldown" | "live" | "unknown";
    ts: number;
    timer?: string | null | undefined;
    totalWager?: number | null | undefined;
    players?: number | null | undefined;
}, {
    x: number | null;
    phase: "cooldown" | "live" | "unknown";
    ts: number;
    timer?: string | null | undefined;
    totalWager?: number | null | undefined;
    players?: number | null | undefined;
}>;
export declare const RoundSchema: z.ZodObject<{
    id: z.ZodNumber;
    started_at: z.ZodNumber;
    ended_at: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    max_x: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    min_x: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    avg_x: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    rug_time_s: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    rug_x: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    players: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    total_wager: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    sidebet_windows: z.ZodOptional<z.ZodArray<z.ZodObject<{
        window_idx: z.ZodNumber;
        start_s: z.ZodNumber;
        end_s: z.ZodNumber;
        rug_in_window: z.ZodBoolean;
    }, "strip", z.ZodTypeAny, {
        window_idx: number;
        start_s: number;
        end_s: number;
        rug_in_window: boolean;
    }, {
        window_idx: number;
        start_s: number;
        end_s: number;
        rug_in_window: boolean;
    }>, "many">>;
}, "strip", z.ZodTypeAny, {
    id: number;
    started_at: number;
    players?: number | null | undefined;
    ended_at?: number | null | undefined;
    max_x?: number | null | undefined;
    min_x?: number | null | undefined;
    avg_x?: number | null | undefined;
    rug_time_s?: number | null | undefined;
    rug_x?: number | null | undefined;
    total_wager?: number | null | undefined;
    sidebet_windows?: {
        window_idx: number;
        start_s: number;
        end_s: number;
        rug_in_window: boolean;
    }[] | undefined;
}, {
    id: number;
    started_at: number;
    players?: number | null | undefined;
    ended_at?: number | null | undefined;
    max_x?: number | null | undefined;
    min_x?: number | null | undefined;
    avg_x?: number | null | undefined;
    rug_time_s?: number | null | undefined;
    rug_x?: number | null | undefined;
    total_wager?: number | null | undefined;
    sidebet_windows?: {
        window_idx: number;
        start_s: number;
        end_s: number;
        rug_in_window: boolean;
    }[] | undefined;
}>;
export declare const WSFrameSchema: z.ZodObject<{
    ts: z.ZodNumber;
    dir: z.ZodEnum<["in", "out"]>;
    data: z.ZodString;
}, "strip", z.ZodTypeAny, {
    data: string;
    ts: number;
    dir: "in" | "out";
}, {
    data: string;
    ts: number;
    dir: "in" | "out";
}>;
export type Tick = z.infer<typeof TickSchema>;
export type Round = z.infer<typeof RoundSchema>;
export type WSFrame = z.infer<typeof WSFrameSchema>;
export type SidebetWindow = NonNullable<z.infer<typeof RoundSchema>['sidebet_windows']>[0];
export declare const PredictionSchema: z.ZodObject<{
    p_rug_5s: z.ZodNumber;
    p_rug_10s: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    p_rug_5s: number;
    p_rug_10s: number;
}, {
    p_rug_5s: number;
    p_rug_10s: number;
}>;
export type Prediction = z.infer<typeof PredictionSchema>;
export declare const PredictionInputSchema: z.ZodObject<{
    x: z.ZodNumber;
    t: z.ZodNumber;
    slope: z.ZodNumber;
    vol: z.ZodNumber;
    players: z.ZodNumber;
    wager: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    x: number;
    players: number;
    wager: number;
    t: number;
    slope: number;
    vol: number;
}, {
    x: number;
    players: number;
    wager: number;
    t: number;
    slope: number;
    vol: number;
}>;
export type PredictionInput = z.infer<typeof PredictionInputSchema>;
//# sourceMappingURL=index.d.ts.map