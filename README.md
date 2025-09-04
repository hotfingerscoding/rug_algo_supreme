# Rugs Research

A production-ready monorepo for analyzing rugs.fun round behavior and timing decisions through read-only data collection and statistical modeling.

## ⚠️ Important Disclaimers

- **Read-Only Research**: This tool collects data from public client-side events only. No automation of betting or site modification.
- **No ToS Violation**: We do not bypass terms of service or interfere with site functionality.
- **Educational Purpose**: This is for research and learning about game mechanics and timing patterns.
- **No Financial Advice**: Outputs are statistical predictions, not investment recommendations.

## 🎯 Main Goal

Collect reliable round-level and tick-level data from rugs.fun, analyze the hazard of a "rug" event over time/multiplier, and surface live guidance for cashout and sidebet timing with strict bankroll/risk controls.

## 🏗️ Architecture

```
rugs-research/
├── apps/
│   ├── collector/     # Node/TS + Playwright data harvester
│   └── analyzer/      # Python analytics + FastAPI predictor
├── packages/
│   ├── schema/        # Shared TypeScript types & zod schemas
│   └── shared/        # Logging, time utils, SQLite helpers
├── data/              # SQLite database, exports, models
├── docs/              # Documentation, runbooks, research plans
└── .cursor/           # Cursor IDE memory & rules
```

## 🚀 Quick Start

### 1. Install Dependencies
```bash
# Install everything
make install

# Or manually:
pnpm install
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
pip install -r apps/analyzer/requirements.txt
```

### 2. Update Selectors (CRITICAL)
Before running, you must update the DOM selectors:

1. Open `apps/collector/src/config/selectors.ts`
2. Inspect rugs.fun in your browser
3. Update the selector strings to match actual DOM elements
4. Look for TODO comments that tell you what to update

**The collector will not work without proper selectors!**

### 3. Start Data Collection
```bash
# Start collector (headless mode)
make collector

# Or with visible browser for debugging
HEADLESS=false make collector
```

### 4. Train Models
```bash
# Run analysis and train models
cd apps/analyzer
python notebooks/round_analysis.py
```

### 5. Start Prediction API
```bash
# Serve predictions
make serve
```

The API will be available at `http://localhost:8000`

## 📊 Data Flow

1. **Collector** → Monitors rugs.fun via Playwright
   - Captures WebSocket frames
   - Polls DOM for game state
   - Segments rounds (cooldown → live → rug → cooldown)
   - Stores in SQLite database

2. **Analyzer** → Processes collected data
   - Engineers features (time, slope, volatility, deltas)
   - Trains Random Forest models for rug prediction
   - Generates survival analysis plots
   - Exports trained models

3. **API** → Serves predictions
   - Loads trained models
   - Accepts feature inputs
   - Returns rug probability estimates
   - Provides model metadata

## 🔧 Configuration

### Environment Variables
Copy `env.example` to `.env` and customize:

```bash
# Collector settings
HEADLESS=true
POLL_MS=200
TARGET_URL=https://rugs.fun
DB_PATH=./data/rugs.sqlite

# API settings
API_HOST=0.0.0.0
API_PORT=8000
MODEL_PATH=./data/model.json
```

### Selector Updates
When rugs.fun updates their site, update selectors in:
```
apps/collector/src/config/selectors.ts
```

## 📈 Outputs

### Data Files
- `data/rugs.sqlite` - Raw collected data
- `data/model.json` - Trained prediction models
- `data/exports/` - CSV exports of rounds, ticks, WebSocket frames

### Analysis Plots
- `data/survival_analysis.png` - Round duration survival curves
- `data/feature_importance.png` - Model feature importance

### API Endpoints
- `POST /predict` - Get rug probability predictions
- `GET /health` - Service health check
- `GET /model-info` - Model metadata

## 🛠️ Development

### Available Commands
```bash
make install      # Install all dependencies
make build        # Build all packages
make collector    # Run data collector
make exports      # Export data to CSV
make analyze      # Run analysis (opens notebook)
make serve        # Start prediction API
make lint         # Run linter
make test         # Run tests
make help         # Show all commands
```

### Project Structure
- **TypeScript strict mode** everywhere
- **ESLint + Prettier** for code quality
- **Husky + lint-staged** for git hooks
- **Conventional Commits** for version control
- **pnpm workspaces** for monorepo management

## 📚 Documentation

- [Research Plan](docs/RESEARCH_PLAN.md) - Metrics, modeling approach, risk management
- [Runbook](docs/RUNBOOK.md) - Detailed operational procedures
- [Acceptance Criteria](docs/ACCEPTANCE_CRITERIA.md) - Clear "done" checks
- [TODO](docs/TODO.md) - Development checklist and milestones

## 🔍 Monitoring

### Key Metrics
- **Rounds collected**: `sqlite3 data/rugs.sqlite "SELECT COUNT(*) FROM rounds;"`
- **Data rate**: Monitor `logs/collector.log` for round completion
- **API latency**: Test prediction endpoint response times
- **Model accuracy**: Compare predictions vs actual outcomes

### Logs
- `logs/collector.log` - Collector operation logs
- Console output for real-time monitoring

## 🚨 Troubleshooting

### Common Issues

**Selector Problems**
```bash
# Check if selectors are working
grep "selector" logs/collector.log

# Run in visible mode to debug
HEADLESS=false make collector
```

**Model Not Found**
```bash
# Check if model file exists
ls -la data/model.json

# Retrain models
cd apps/analyzer && python notebooks/round_analysis.py
```

**Database Issues**
```bash
# Check database integrity
sqlite3 data/rugs.sqlite "PRAGMA integrity_check;"

# Backup and reset
cp data/rugs.sqlite data/rugs.sqlite.backup
rm data/rugs.sqlite
```

## 🤝 Contributing

1. Follow the rules in `.cursor/rules.md`
2. Update `docs/TODO.md` when adding tasks
3. Use conventional commits
4. Ensure all tests pass
5. Update documentation

## 📄 License

This project is for educational and research purposes only. Use at your own risk.

## ⚡ Performance Notes

- Collector polls DOM every 200ms (configurable)
- API responds in <100ms for predictions
- Database optimized for read-heavy workloads
- Memory usage remains stable during long runs

## 🔮 Future Enhancements

- Real-time monitoring dashboard
- Automated model retraining
- Ensemble prediction methods
- Advanced risk management controls
- Multi-site data collection
