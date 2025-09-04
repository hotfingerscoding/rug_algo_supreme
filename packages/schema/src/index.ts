import { z } from 'zod';

// Tick schema for individual data points
export const TickSchema = z.object({
  ts: z.number(),
  phase: z.enum(['live', 'cooldown', 'unknown']),
  x: z.number().nullable(),
  timer: z.string().nullable().optional(),
  players: z.number().nullable().optional(),
  totalWager: z.number().nullable().optional(),
});

// Round schema for complete round data
export const RoundSchema = z.object({
  id: z.number(),
  started_at: z.number(),
  ended_at: z.number().nullable().optional(),
  max_x: z.number().nullable().optional(),
  min_x: z.number().nullable().optional(),
  avg_x: z.number().nullable().optional(),
  rug_time_s: z.number().nullable().optional(),
  rug_x: z.number().nullable().optional(),
  players: z.number().nullable().optional(),
  total_wager: z.number().nullable().optional(),
  sidebet_windows: z.array(z.object({
    window_idx: z.number(),
    start_s: z.number(),
    end_s: z.number(),
    rug_in_window: z.boolean()
  })).optional(),
});

// WebSocket frame schema
export const WSFrameSchema = z.object({
  ts: z.number(),
  dir: z.enum(['in', 'out']),
  data: z.string(),
});

// TypeScript types derived from schemas
export type Tick = z.infer<typeof TickSchema>;
export type Round = z.infer<typeof RoundSchema>;
export type WSFrame = z.infer<typeof WSFrameSchema>;
export type SidebetWindow = NonNullable<z.infer<typeof RoundSchema>['sidebet_windows']>[0];

// Prediction response schema
export const PredictionSchema = z.object({
  p_rug_5s: z.number(),
  p_rug_10s: z.number(),
});

export type Prediction = z.infer<typeof PredictionSchema>;

// Prediction input schema
export const PredictionInputSchema = z.object({
  x: z.number(),
  t: z.number(),
  slope: z.number(),
  vol: z.number(),
  players: z.number(),
  wager: z.number(),
});

export type PredictionInput = z.infer<typeof PredictionInputSchema>;
