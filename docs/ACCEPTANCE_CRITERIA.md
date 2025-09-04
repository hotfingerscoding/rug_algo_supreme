# Acceptance Criteria

## Collector Acceptance Criteria

### ✅ Data Collection
- [ ] Collector runs headless and stores consistent rows into SQLite for ≥1000 rounds without manual babysitting
- [ ] WebSocket frames are captured and stored with timestamps and direction
- [ ] DOM polling extracts multiplier, timer, players, and wager data every 200ms
- [ ] Round segmentation correctly identifies start/end boundaries
- [ ] Data validation prevents invalid entries from being stored

### ✅ WebSocket Schema Mapping
- [ ] Events table populated from WS mapping with structured events
- [ ] WS decoder pipeline handles multiple JSON formats (single, newline-separated, comma-separated)
- [ ] Event mapper detects game events using heuristics (ROUND_START, ROUND_END, TICK, HEARTBEAT)
- [ ] Segmentation uses both DOM and WS events for robust round detection
- [ ] Raw JSON stored in events table for debugging

### ✅ Configuration & Maintenance
- [ ] Selectors isolated in `apps/collector/src/config/selectors.ts` with clear TODO comments
- [ ] Schema-drift warnings logged when segmentation fails or selectors return empty
- [ ] Environment variables control headless mode, polling frequency, and database path
- [ ] Graceful shutdown handles active rounds and saves partial data
- [ ] Log files provide clear debugging information

### ✅ Drift Detection & Warnings
- [ ] Collector must log warnings to console and logs/collector.log if selectors fail
- [ ] Collector must continue running when selectors drift
- [ ] Startup validation checks all selectors and logs warnings for missing ones
- [ ] Runtime drift detection warns after configurable consecutive misses (default: 10)
- [ ] Drift warnings are prefixed with [DRIFT] for easy identification
- [ ] Selector validation includes visibility checks, not just existence

### ✅ Reliability
- [ ] Handles network disconnections and reconnects automatically
- [ ] Continues collecting data after site updates (with selector warnings)
- [ ] Memory usage remains stable during long-running sessions
- [ ] Database writes are atomic and survive process crashes
- [ ] No data loss during collector restarts

## Analyzer Acceptance Criteria

### ✅ Data Processing
- [ ] Loads SQLite database and validates data integrity
- [ ] Feature engineering creates time_since_start, slope, volatility, and delta features
- [ ] Handles missing data gracefully with appropriate imputation
- [ ] Exports processed data to CSV/JSON formats

### ✅ Model Training
- [ ] Scripted train.py exports model.json with trained Random Forest models
- [ ] Generates survival analysis plots and saves to PNG
- [ ] Creates calibration plots for model validation
- [ ] Exports trained models to `data/model.json` with metadata
- [ ] Feature importance analysis identifies key predictive variables

### ✅ Model Evaluation & Calibration
- [ ] Training script outputs metrics.json with ROC, precision/recall, calibration
- [ ] ROC curves and calibration plots saved as PNG files
- [ ] Evaluation metrics include AUC, precision, recall, F1 at threshold 0.5
- [ ] Feature importance rankings displayed with visual bars
- [ ] Threshold analysis provides expected value calculations

### ✅ API Service
- [ ] FastAPI POST `/predict` returns `{ p_rug_5s, p_rug_10s, meta }` from model.json
- [ ] Input validation rejects invalid feature values
- [ ] Error handling provides clear messages for missing models
- [ ] Health check endpoint reports service status
- [ ] Model reload endpoint allows hot-swapping trained models

### ✅ Evaluation CLI
- [ ] eval.py prints metrics cleanly with formatted output
- [ ] Supports --threshold parameter for custom threshold analysis
- [ ] Displays feature importance with visual bars
- [ ] Shows expected value calculations and risk assessments
- [ ] Provides detailed curve information with --detailed flag

### ✅ Drift Monitoring
- [ ] drift.py detects significant shifts in rug timing distributions
- [ ] Compares recent data (configurable rounds) to training baseline
- [ ] Calculates overall drift score and identifies specific changes
- [ ] Provides actionable recommendations when drift detected
- [ ] Configurable threshold for drift detection (default: 20%)

### ✅ Bankroll Management
- [ ] bankroll.py enforces half-Kelly and loss caps
- [ ] Kelly criterion implementation calculates optimal bet sizes
- [ ] Daily loss caps prevent excessive losses (default: 20%)
- [ ] Bet size caps limit maximum stake (default: 5% of balance)
- [ ] Persistent state tracking in data/bankroll.json
- [ ] Automatic daily reset of loss tracking

### ✅ Strategy Simulation
- [ ] simulate.py compares multiple strategies with metrics
- [ ] Simulates naive strategies (hold to target multipliers)
- [ ] Simulates model-guided strategies (cashout based on predictions)
- [ ] Includes random baseline strategies for comparison
- [ ] Tracks ROI, win rate, max drawdown, volatility for each strategy
- [ ] Saves results to data/sim_results.json with comprehensive metrics

### ✅ Strategy Evaluation Reports
- [ ] report.py outputs equity curves and Sharpe ratio
- [ ] overlay shows bankroll-driven stake size (optional)

### ✅ Sidebet Windows & Labels
- [ ] Collector writes sidebet_windows with correct rug_in_window flag
- [ ] train.py uses window-aligned labels when available
- [ ] Sidebet windows are 10-second intervals aligned to site mechanics
- [ ] Fallback to traditional sliding-window method when windows unavailable
- [ ] Export script includes sidebet_windows.csv in data/exports/

### ✅ Crash Resilience & Resume
- [ ] Collector survives a restart, auto-closes unfinished rounds, and logs [RESUME] with meta pointers
- [ ] Unfinished rounds are auto-closed with ended_at = last_tick_ts, rug_x = last_live_tick_x
- [ ] Resume pointers track last_ws_ts, last_tick_ts, last_round_id
- [ ] Notes field marked as 'closed_on_restart' for audit trail
- [ ] Idempotent operations prevent data corruption on multiple restarts

### ✅ EV Engine & Threshold Tuning
- [ ] ev.py computes EVs with configurable assumptions
- [ ] tune_thresholds.py saves thresholds.json and per-regime variants; simulate uses them
- [ ] serve.py exposes thresholds endpoints and optional calibrated predictions
- [ ] Dashboard renders EV panel and EV surface without errors
- [ ] Overlay displays action + EV delta + regime badge; shows 'No edge' when appropriate

### ✅ Quick-Start & Smoke Tests
- [ ] pnpm quickstart launches collector, API, dashboard, and log tailer, printing URLs
- [ ] pnpm smoke passes once at least one round exists (else soft-warns)
- [ ] Cheatsheet present with 7 commands, daily loop, troubleshooting tree, health signals, safe-ops rules
- [ ] Profiles script switches .env cleanly

### ✅ Full System Test
- [ ] pnpm system:test performs complete end-to-end pipeline test
- [ ] Selector prompt, stack launch, 15-minute collection, full training pipeline
- [ ] Outputs: logs/system_test.log, updated DB, model, metrics, thresholds, plots
- [ ] Dashboard reachable, overlay shows predictions
- [ ] Script ends with ✅ summary and paths
- [ ] report.py outputs equity curves and Sharpe ratio
- [ ] Generates equity curves plot showing portfolio value over time
- [ ] Creates drawdown analysis visualization
- [ ] Produces risk-return scatter plots with efficient frontier
- [ ] Calculates comprehensive risk metrics (Sharpe, Sortino, Calmar ratios)
- [ ] Ranks strategies by risk-adjusted returns

## Automation & Job Scheduling Acceptance Criteria

### ✅ Job Scheduler
- [ ] jobs/runner.ts runs scheduled export/train/drift/backup/rotate without crashing; logs to logs/jobs.log
- [ ] Cron patterns are configurable via environment variables
- [ ] Jobs can be run manually with pnpm jobs:run <jobName>
- [ ] Job timeouts prevent hanging processes
- [ ] Concurrent job execution is prevented
- [ ] Job status and listing functionality works correctly

### ✅ Export Job
- [ ] export.ts creates timestamped directories for CSV exports
- [ ] Exports rounds, ticks, events, and WebSocket data
- [ ] Includes metadata files with export information
- [ ] Handles export failures gracefully
- [ ] Sends success/failure alerts

### ✅ Training Job
- [ ] train.ts runs model training and saves timestamped versions
- [ ] Updates current.json symlink to latest model
- [ ] Includes training metadata and metrics
- [ ] Handles training failures gracefully
- [ ] Sends training completion alerts with metrics

### ✅ Drift Check Job
- [ ] drift.ts runs drift detection and returns appropriate exit codes
- [ ] Exit code 0 for no drift, exit code 2 for drift detected
- [ ] Sends DRIFT alerts when drift is detected
- [ ] Includes drift context and threshold information
- [ ] Handles drift check failures gracefully

### ✅ Backup Job
- [ ] backup.ts creates SQLite database backups with timestamps
- [ ] Uses file copy method for consistency
- [ ] Verifies backup integrity
- [ ] Includes backup metadata
- [ ] Sends backup completion alerts

### ✅ Rotation Job
- [ ] rotate.ts deletes old files according to config/retention.json
- [ ] Honors retention policies for backups, models, and exports
- [ ] Logs rotation activities
- [ ] Sends rotation summary alerts
- [ ] Handles rotation failures gracefully

### ✅ Alert System
- [ ] Alerts fire to console/file and webhook on drift and failures
- [ ] Alert debouncing prevents duplicate notifications
- [ ] Webhook integration works with Discord/Slack
- [ ] Alert levels (INFO, WARN, ERROR, DRIFT) are properly categorized
- [ ] Alert context includes relevant metadata

### ✅ Model Registry
- [ ] Model registry maintains timestamped versions and supports manual switch
- [ ] models/ directory stores versioned models with metadata
- [ ] current.json symlink points to active model
- [ ] API endpoints for listing and switching models
- [ ] Model versioning includes training metadata

### ✅ Data Retention
- [ ] Rotation deletes old artifacts according to config/retention.json
- [ ] Retention policies are configurable
- [ ] File deletion is logged and reported
- [ ] Disk space is managed automatically
- [ ] Retention policies are enforced consistently

## Export & Integration Acceptance Criteria

### ✅ Data Export
- [ ] CSV export scripts work and create properly formatted files
- [ ] Exports include rounds, ticks, WebSocket frames, and events
- [ ] Data integrity maintained during export process
- [ ] Export timestamps and metadata included
- [ ] Source column included in ticks export ('ws'|'dom'|'merged')

### ✅ Documentation
- [ ] README explains end-to-end flow clearly
- [ ] RUNBOOK provides exact commands for each step
- [ ] Selector update instructions are clear and actionable
- [ ] Troubleshooting guide covers common issues
- [ ] Drift warning documentation explains how to handle selector changes

### ✅ Optional Live Overlay
- [ ] Optional overlay displays probabilities and actions
- [ ] Tampermonkey userscript injects floating div on rugs.fun
- [ ] Overlay shows 5s/10s risk percentages and recommended actions
- [ ] Draggable interface with color-coded risk levels
- [ ] Connects to local API server for real-time predictions
- [ ] Graceful handling of offline/error states
- [ ] Overlay shows bankroll-driven stake size (optional)
- [ ] Displays current balance and daily loss tracking
- [ ] Shows Kelly criterion based recommended stake amounts
- [ ] Visual warning when daily loss cap exceeded (overlay turns gray)
- [ ] API health status indicator
- [ ] Model version and drift status display
- [ ] Recent alerts indicator

## CI/CD Acceptance Criteria

### ✅ GitHub Actions
- [ ] CI nightly completes without errors and archives artifacts
- [ ] Nightly workflow runs on cron schedule (03:00 UTC daily)
- [ ] Lint workflow runs on push/PR with TypeScript and Python checks
- [ ] Build artifacts are properly archived
- [ ] Webhook notifications work for success/failure states

### ✅ Build Process
- [ ] TypeScript compilation succeeds with strict mode
- [ ] Python linting passes with flake8
- [ ] Build artifacts are created and archived
- [ ] No sensitive data in build artifacts
- [ ] Build process is idempotent

### ✅ Testing
- [ ] All tests pass when implemented
- [ ] Code coverage meets minimum thresholds
- [ ] Integration tests verify end-to-end functionality
- [ ] Job execution tests verify automation
- [ ] API endpoint tests verify functionality

## Operational Acceptance Criteria

### ✅ Monitoring
- [ ] Log files provide sufficient detail for debugging
- [ ] Error conditions are clearly identified and logged
- [ ] Performance metrics are tracked (rounds/hour, prediction latency)
- [ ] Data quality metrics are monitored
- [ ] Drift warnings are logged with appropriate severity levels
- [ ] Job execution is monitored and logged
- [ ] Alert activity is tracked and reported

### ✅ Security
- [ ] No hardcoded credentials or sensitive data
- [ ] Environment variables used for configuration
- [ ] Input validation prevents injection attacks
- [ ] Logs don't contain sensitive information
- [ ] Webhook URLs are properly secured
- [ ] File permissions are appropriate

## Success Metrics

### Quantitative
- [ ] Collector runs for 24+ hours without manual intervention
- [ ] Model achieves >60% accuracy on rug prediction
- [ ] API responds to predictions in <100ms
- [ ] Data collection rate maintains 200ms polling frequency
- [ ] Drift warnings fire within 2 seconds of selector failure
- [ ] Strategy simulations complete in <5 minutes for 1000 rounds
- [ ] Bankroll management enforces loss caps within 1% accuracy
- [ ] Jobs complete within their timeout limits
- [ ] Alert system responds within 30 seconds
- [ ] Model switching completes within 5 seconds

### Qualitative
- [ ] Clear error messages guide users to solutions
- [ ] Documentation enables new users to get started quickly
- [ ] Code is maintainable and well-structured
- [ ] System handles edge cases gracefully
- [ ] Drift warnings are actionable and informative
- [ ] Strategy reports provide actionable insights
- [ ] Bankroll management prevents catastrophic losses
- [ ] Automation reduces manual intervention
- [ ] Alerts provide timely and relevant information
- [ ] Model registry enables easy rollbacks

## Definition of Done

A feature is considered "done" when:
1. ✅ All acceptance criteria are met
2. ✅ Code is reviewed and approved
3. ✅ Tests pass (where applicable)
4. ✅ Documentation is updated
5. ✅ No known bugs remain
6. ✅ Performance meets requirements
7. ✅ Security review completed
8. ✅ Drift detection tested with bad selectors
9. ✅ Events table populated from WS mapping; segmentation uses DOM+WS
10. ✅ Scripted train.py exports model.json; /predict returns probabilities
11. ✅ Training script outputs metrics.json with ROC, precision/recall, calibration
12. ✅ eval.py prints metrics cleanly
13. ✅ drift.py detects significant shifts in rug timing distributions
14. ✅ Optional overlay displays probabilities and actions
15. ✅ bankroll.py enforces half-Kelly and loss caps
16. ✅ simulate.py compares multiple strategies with metrics
17. ✅ report.py outputs equity curves and Sharpe ratio
18. ✅ Overlay shows bankroll-driven stake size (optional)
19. ✅ jobs/runner.ts runs scheduled jobs without crashing; logs to logs/jobs.log
20. ✅ Alerts fire to console/file and webhook on drift and failures
21. ✅ Model registry maintains timestamped versions and supports manual switch
22. ✅ Rotation deletes old artifacts according to config/retention.json
23. ✅ CI nightly completes without errors and archives artifacts
