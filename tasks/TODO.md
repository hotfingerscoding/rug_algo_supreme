# Console Collector TODO Checklist

## Phase A: Environment Verification ✅
- [x] Add `pnpm console:check` script
- [x] Verify SQLite write/read, JSONL perms, Playwright, ENV validation
- [x] Fail fast with non-zero exit on errors

## Phase B: Live Collection Happy-Path ✅
- [x] Event-key dedupe enforced via UNIQUE index
- [x] Rolling heartbeat every 30s (counts, memory, DB size, round state)
- [x] Graceful shutdown flushes current round
- [x] Integration test for collector startup

## Phase C: Replay Parity ✅
- [x] Live and replay share identical modules (no divergence)
- [x] `pnpm console:replay --strict --file <jsonl>` with round_features comparison
- [x] Test fixtures and golden file validation

## Phase D: Round Boundary Robustness ✅
- [x] FSM handles: start (pnlDebug OR inferred), end (pnlDebug OR rugRoyale OR timeout)
- [x] boundary_reason persisted on each round
- [x] Unit tests for each boundary_reason

## Phase E: Storage Retention & Rotation ✅
- [x] JSONL rotation at MAX_JSONL_MB with date+counter suffix
- [x] SQLite retention on events (keep round_features), VACUUM post-prune
- [x] `pnpm console:prune` with summary of deleted rows and sizes

## Phase F: Analysis Outputs ✅
- [x] `pnpm console:analyze --format csv|json --out <path> --mode overwrite|append`
- [x] New columns: avgBetSize, maxWager, tradeIntensity, volatility (safe division, 6-decimal)
- [x] Unit tests for feature math

## Phase G: Observability ✅
- [x] Structured logs: level, ts, module, msg, fields
- [x] `pnpm console:health` with config, counts, round summary, DB size, JSONL files, memory RSS

## Phase H: CI Wiring ✅
- [x] CI runs: pnpm i, build -r, test, console:check
- [x] Cache Playwright browsers for speed

## Phase I: Modeling Scaffold ✅
- [x] `pnpm console:export-train --out data/train.parquet`
- [x] Starter notebook with feature analysis and baseline model

## Phase J: Documentation Polish ✅
- [x] Complete runbook with quickstart, env vars, troubleshooting, daily ops
- [x] North star objectives and KPI mapping

## Status: ✅ COMPLETE - All phases implemented and tested
