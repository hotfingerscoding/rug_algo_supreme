# Rugs Research Operator Cheatsheet

## Top 7 Commands

- **`pnpm quickstart`** — run collector, API, dashboard, log tailer.
- **`pnpm selector:start`** — point-and-click selectors (then "Save & Update Collector").
- **`pnpm --filter collector run health`** — quick health ping.
- **`make export`** — dump CSVs to `data/exports/DATE/`.
- **`make train && curl -s localhost:8787/model-info`** — train then verify model.
- **`make simulate && make report`** — strategy backtest + charts.
- **`pnpm tail:logs --drift`** — watch for selector or analyzer drift.

## Daily Loop (5 Steps)

1. **Start**: `pnpm quickstart`
2. **If overlay shows "offline," start API**: `make serve`
3. **If drift warnings**: re-run `pnpm selector:start`, retest 30–60s, save
4. **Export & train**: `make export && make train`
5. **Evaluate**: `make eval` and (optional) `make tune` for thresholds

## Troubleshooting Tree

- **No ticks** → selectors wrong → `pnpm selector:start` → retest → save
- **Rounds never end** → increase `END_GUARD_POLLS`, verify WS `ROUND_END` mapping
- **API 503 model missing** → `make train`
- **Overlay "No edge" always** → `make calibrate` and verify thresholds via `make tune`
- **Drift spikes** → run `make drift` and consider retrain

## Health Signals

- **`logs/collector.log`**: `[DRIFT]`, `[RESUME]`
- **`logs/alerts.log`**: WARN/DRIFT webhooks
- **Dashboard top bar**: last WS frame, last round end, model version

## Safe-Ops Rules

- **Read-only only**; no automated betting
- **Half-Kelly default**; daily loss cap 20%
- **Stop after 2+ drift alerts** within 30m
