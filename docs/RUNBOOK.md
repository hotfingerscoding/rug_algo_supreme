# Console Collector Runbook

Complete operational guide for the console-collector system.

## Quickstart

### 1. Environment Setup
```bash
# Clone and install
git clone <repo>
cd rug_algo_supreme
pnpm install

# Copy environment template
cp env.example .env

# Verify environment
pnpm console:check
```

### 2. First Run
```bash
# Start collection (headed browser)
pnpm console:collect

# In another terminal, monitor health
pnpm console:health

# Stop collection with Ctrl+C
```

### 3. Analyze Data
```bash
# Export to CSV
pnpm console:analyze

# Export to JSON
pnpm console:analyze --format=json

# Custom output path
pnpm console:analyze --out=data/custom_features.csv
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `EVENT_SOURCE` | `ws` | Event source preference: `ws`, `console`, or `both` |
| `ROUND_INACTIVITY_S` | `90` | Seconds of inactivity before round timeout |
| `RETENTION_DAYS` | `14` | Days to keep events (round_features preserved) |
| `MAX_JSONL_MB` | `200` | JSONL file size before rotation |
| `LOG_LEVEL` | `info` | Logging level: `debug`, `info`, `warn`, `error` |
| `HEARTBEAT_INTERVAL_MS` | `30000` | Heartbeat interval in milliseconds |
| `DATA_DIR` | `../../data` | Data storage directory |
| `DB_NAME` | `console_rounds.sqlite` | SQLite database filename |

## Daily Operations

### Morning Check
```bash
# Check system health
pnpm console:health

# Review recent rounds
pnpm console:analyze --format=json | jq '.rounds[-3:]'
```

### Data Collection
```bash
# Start collection (preferred: WebSocket source)
pnpm console:collect

# Monitor in background
pnpm console:collect > logs/collector.log 2>&1 &

# Check status
tail -f logs/collector.log
```

### Maintenance
```bash
# Clean up old events (weekly)
pnpm console:prune

# Export analysis (daily)
pnpm console:analyze --format=json --out=data/daily_$(date +%Y%m%d).json

# Check storage usage
pnpm console:health | grep -A 5 "Storage Status"
```

### Troubleshooting
```bash
# Check environment
pnpm console:check

# Verify replay consistency
pnpm console:replay --strict data/console_rounds.jsonl

# Force cleanup
pnpm console:prune
```

## Common Issues & Solutions

### Mac Permissions
```bash
# Grant terminal full disk access
# System Preferences → Security & Privacy → Privacy → Full Disk Access

# Grant terminal accessibility access
# System Preferences → Security & Privacy → Privacy → Accessibility
```

### Playwright Missing
```bash
# Install Playwright browsers
npx playwright install chromium

# Verify installation
npx playwright --version
```

### Database Locked
```bash
# Check for other processes
lsof data/console_rounds.sqlite

# Kill processes if needed
kill -9 <PID>

# Or restart collector
pnpm console:collect
```

### High Memory Usage
```bash
# Check memory
pnpm console:health | grep -A 3 "System Info"

# Restart if >1GB RSS
pkill -f "console:collect"
pnpm console:collect
```

### Storage Full
```bash
# Check storage
pnpm console:health | grep -A 5 "Storage Status"

# Force cleanup
pnpm console:prune

# Check file sizes
du -sh data/*
```

## Monitoring & Alerts

### Health Check Indicators
- **Database Size**: Should be <1GB for normal operation
- **Memory RSS**: Should be <500MB for normal operation
- **Event Counts**: Should show steady growth during collection
- **Round Count**: Should increase over time

### Warning Signs
- **High Duplication Rate**: >20% suggests source configuration issues
- **Memory Growth**: >100MB/hour suggests memory leak
- **Storage Growth**: >100MB/hour suggests rotation issues
- **No New Rounds**: >5 minutes suggests boundary detection failure

### Emergency Procedures
```bash
# Stop collection
pkill -f "console:collect"

# Backup data
cp -r data data/backup_$(date +%Y%m%d_%H%M%S)

# Check logs
tail -100 logs/collector.log

# Restart with debug
LOG_LEVEL=debug pnpm console:collect
```

## Data Export & Analysis

### Export Formats

#### CSV Export
```bash
# Default export
pnpm console:analyze

# Custom path
pnpm console:analyze --out=data/analysis_$(date +%Y%m%d).csv

# Append mode
pnpm console:analyze --mode=append --out=data/combined.csv
```

#### JSON Export
```bash
# Full export with metadata
pnpm console:analyze --format=json

# Custom path
pnpm console:analyze --format=json --out=data/features_$(date +%Y%m%d).json
```

### Data Schema
```json
{
  "metadata": {
    "generated": "2025-01-01T12:00:00.000Z",
    "totalRounds": 100,
    "config": {
      "retentionDays": 14,
      "maxJsonlMB": 200
    }
  },
  "rounds": [
    {
      "id": "2025-01-01T12:00:00.000Z__2025-01-01T12:00:10.000Z",
      "startAt": "2025-01-01T12:00:00.000Z",
      "endAt": "2025-01-01T12:00:10.000Z",
      "durationSec": 10,
      "cooldownSec": 15.5,
      "boundary_reason": "pnlDebug",
      "numTrades": 5,
      "numSideBets": 3,
      "uniquePlayers": 4,
      "avgBetSize": 25.5,
      "maxWager": 100,
      "tradeIntensity": 0.5,
      "volatility": 2.2
    }
  ]
}
```

## Performance Tuning

### Memory Optimization
```bash
# Reduce heartbeat frequency
HEARTBEAT_INTERVAL_MS=60000 pnpm console:collect

# Use console-only mode for testing
EVENT_SOURCE=console pnpm console:collect
```

### Storage Optimization
```bash
# Reduce retention for testing
RETENTION_DAYS=7 pnpm console:collect

# Smaller rotation size
MAX_JSONL_MB=100 pnpm console:collect
```

### Network Optimization
```bash
# WebSocket-only mode
EVENT_SOURCE=ws pnpm console:collect

# Headless mode for production
HEADLESS=true pnpm console:collect
```

## Backup & Recovery

### Backup Strategy
```bash
# Daily backup
cp -r data data/backup_$(date +%Y%m%d)

# Weekly archive
tar -czf data/archive_$(date +%Y%m%d).tar.gz data/backup_*

# Clean old backups (keep 30 days)
find data/backup_* -type d -mtime +30 -exec rm -rf {} \;
```

### Recovery Procedures
```bash
# Restore from backup
cp -r data/backup_20250101/* data/

# Verify data integrity
pnpm console:health

# Test replay consistency
pnpm console:replay --strict data/console_rounds.jsonl
```

## Integration Points

### External Monitoring
```bash
# Health check endpoint
curl -s http://localhost:3000/health | jq

# Metrics endpoint
curl -s http://localhost:3000/metrics | jq
```

### Data Pipeline
```bash
# Export for ML training
pnpm console:export-train --out=data/train.parquet

# Load in Python
import pandas as pd
df = pd.read_parquet('data/train.parquet')
```

### Log Aggregation
```bash
# Send logs to external system
pnpm console:collect 2>&1 | tee -a logs/collector.log | logger -t console-collector

# Monitor with logwatch
logwatch --detail High --mail root --range Today --service console-collector
```

## Troubleshooting Checklist

- [ ] Environment check passes (`pnpm console:check`)
- [ ] Database accessible and writable
- [ ] JSONL directory exists with write permissions
- [ ] Playwright Chromium available
- [ ] No other collector processes running
- [ ] Sufficient disk space available
- [ ] Network connectivity to rugs.fun
- [ ] Console logs showing expected patterns
- [ ] WebSocket frames being received
- [ ] Round boundaries being detected
- [ ] Events being deduplicated
- [ ] Storage rotation working
- [ ] Retention cleanup successful

## Support Contacts

- **Documentation**: `docs/` directory
- **Issues**: GitHub Issues
- **Logs**: `logs/` directory
- **Data**: `data/` directory
- **Tests**: `pnpm test`
- **Health**: `pnpm console:health`
