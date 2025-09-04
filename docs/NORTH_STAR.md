# North Star: Robust Live Collection → Trustworthy Features → Model-Ready Data → Reproducible Analytics

## Objective
Transform the console-collector from a prototype into a production-grade data pipeline that reliably captures rugs.fun trading events and produces model-ready datasets for algorithmic trading research.

## Metrics of Success

### Phase A: Environment Verification ✅
- **Goal**: One-command local run with visible data flowing
- **KPI**: `pnpm console:check` passes with all systems operational
- **Gate**: All dependencies resolved, permissions verified, environment validated

### Phase B: Live Collection Happy-Path ✅
- **Goal**: Collect 15+ minutes without errors, with dedupe working
- **KPI**: `pnpm console:collect` runs for 15m with no unhandled rejections
- **Gate**: Event deduplication enforced, heartbeat monitoring active, graceful shutdown

### Phase C: Replay Parity ✅
- **Goal**: Live == replay for the same window
- **KPI**: `pnpm console:replay --strict` produces identical round_features
- **Gate**: No divergence between live and replay processing paths

### Phase D: Round Boundary Robustness ✅
- **Goal**: Resilient segmentation even when PnL logs change
- **KPI**: FSM handles all boundary conditions, boundary_reason populated
- **Gate**: Multiple fallback mechanisms, cooldown measurement working

### Phase E: Storage Retention & Rotation ✅
- **Goal**: Unbounded runs without bloat
- **KPI**: `pnpm console:prune` manages storage growth, round_features preserved
- **Gate**: Automatic rotation, retention policies, VACUUM cleanup

### Phase F: Analysis Outputs ✅
- **Goal**: Model-ready features with flexible export
- **KPI**: CSV+JSON exports with computed features, schema stable
- **Gate**: avgBetSize, maxWager, tradeIntensity, volatility computed correctly

### Phase G: Observability ✅
- **Goal**: Quick insight into health/state
- **KPI**: `pnpm console:health` provides comprehensive status
- **Gate**: Structured logging, metrics collection, health checks

### Phase H: CI Wiring ✅
- **Goal**: Prevent regressions
- **KPI**: CI runs all acceptance checks, failing checks block merge
- **Gate**: Automated testing, replay verification, environment validation

### Phase I: Modeling Scaffold ✅
- **Goal**: Ready-to-train datasets and reproducible notebooks
- **KPI**: Parquet export succeeds, baseline model runs locally
- **Gate**: Feature engineering complete, train/val split, reproducible seeds

### Phase J: Documentation Polish ✅
- **Goal**: Anyone can run it
- **KPI**: Complete runbook, troubleshooting guide, quickstart
- **Gate**: All phases documented, common issues addressed

## Architecture Principles

1. **Event-Driven**: Pure event stream processing, no DOM state
2. **Deduplication**: WebSocket preferred, console fallback, deterministic keys
3. **Robust Boundaries**: Multiple detection mechanisms, timeout fallbacks
4. **Storage Management**: Automatic rotation, retention policies, cleanup
5. **Replay Parity**: Identical processing paths for live and historical data
6. **Observability**: Comprehensive logging, metrics, health checks
7. **Configurable**: Environment-driven configuration with sensible defaults
8. **Testable**: Unit tests, integration tests, replay verification

## Data Flow

```
Live Collection → Event Deduplication → Round Segmentation → Feature Engineering → Storage
     ↓                    ↓                    ↓                    ↓              ↓
WebSocket + Console → Deterministic Keys → FSM + Fallbacks → Computed Features → SQLite + JSONL
     ↓                    ↓                    ↓                    ↓              ↓
   CDP + Page Events → Source Tracking → Boundary Detection → Safe Math → Retention + Rotation
```

## Success Criteria

- **Reliability**: 99.9% uptime for live collection
- **Data Quality**: 0% duplicate events, 100% round boundary detection
- **Performance**: <100ms event processing latency, <1GB memory usage
- **Storage**: <10GB database growth per month, automatic cleanup
- **Reproducibility**: 100% replay parity, deterministic feature computation
- **Observability**: <30s time-to-detect issues, comprehensive health metrics

## Next Steps

After completing all phases:
1. **Production Deployment**: Containerization, monitoring, alerting
2. **Scale Testing**: High-volume event processing, stress testing
3. **Feature Expansion**: Additional event types, real-time analytics
4. **ML Pipeline**: Automated feature selection, model training, backtesting
5. **Trading Integration**: Real-time signals, position management, risk controls
