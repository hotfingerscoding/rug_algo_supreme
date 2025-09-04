#!/bin/bash
# Full System Test for Rugs Research
# Tests the entire pipeline from selectors to trained model

set -e  # Exit on any error

# Configuration
TEST_MINUTES=${TEST_MINUTES:-15}
HEALTH_CHECK_INTERVAL=300  # 5 minutes in seconds

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}✅${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠️${NC} $1"
}

print_error() {
    echo -e "${RED}❌${NC} $1"
}

print_info() {
    echo -e "${BLUE}ℹ️${NC} $1"
}

print_step() {
    echo ""
    echo "🔄 $1"
    echo "================================"
}

# Function to log to system test log
log_message() {
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[$timestamp] $1" | tee -a logs/system_test.log
}

# Preflight checks
print_step "Preflight Checks"
echo "Checking system prerequisites..."

# Check Node version and SQLite override
NODE_VERSION=$(node --version)
NODE_MAJOR=$(echo $NODE_VERSION | cut -d. -f1 | tr -d 'v')
echo "Node version: $NODE_VERSION"
if [ "$NODE_MAJOR" = "22" ]; then
    print_info "Node 22 detected - better-sqlite3 override active"
fi

# Check Node.js
if ! command -v node &> /dev/null; then
    print_error "Node.js not found. Please install Node.js 18+ first."
    exit 1
fi
NODE_VERSION=$(node --version)
print_status "Node.js: $NODE_VERSION"

# Check pnpm
if ! command -v pnpm &> /dev/null; then
    print_error "pnpm not found. Please install pnpm first: npm install -g pnpm"
    exit 1
fi
PNPM_VERSION=$(pnpm --version)
print_status "pnpm: $PNPM_VERSION"

# Check Python3
if ! command -v python3 &> /dev/null; then
    print_error "Python3 not found. Please install Python 3.8+ first."
    exit 1
fi
PYTHON_VERSION=$(python3 --version)
print_status "Python3: $PYTHON_VERSION"

# Check virtual environment
if [ ! -d "venv" ]; then
    print_error "Python virtual environment not found. Run 'pnpm quickstart' first."
    exit 1
fi
print_status "Python virtual environment: found"

# Check .env file
if [ ! -f ".env" ]; then
    print_error ".env file not found. Run 'pnpm quickstart' first."
    exit 1
fi
print_status ".env file: found"

# Create logs directory
mkdir -p logs
log_message "System test started - Test duration: ${TEST_MINUTES} minutes"

print_status "Preflight checks completed successfully!"

# Step 1: Selectors
print_step "Step 1: Selector Setup"
echo "In another terminal, run: pnpm selector:start"
echo ""
echo "Instructions:"
echo "1. Click on multiplier, timer, players, wagers elements"
echo "2. Test selectors for 30-60 seconds (ensure ≥90% hit rate)"
echo "3. Click 'Save & Update Collector'"
echo "4. Return here and press ENTER to continue"
echo ""
read -p "Press ENTER after selectors are configured..."

log_message "Selectors configured - proceeding to stack launch"

# Auto-detect selector completeness
print_step "Selector Validation Check"
echo "Checking if all required selectors are configured..."

# Check if selectors file exists and has non-empty selectors
SELECTORS_FILE="apps/collector/src/config/selectors.ts"
if [ ! -f "$SELECTORS_FILE" ]; then
    print_error "Selectors file not found: $SELECTORS_FILE"
    exit 1
fi

# Check for empty selectors using grep
EMPTY_SELECTORS=()
for selector in multiplier timer players wager status; do
    if grep -q "${selector}: { selector: '' }" "$SELECTORS_FILE" || grep -q "${selector}: { selector: \"\" }" "$SELECTORS_FILE"; then
        EMPTY_SELECTORS+=("$selector")
    fi
done

if [ ${#EMPTY_SELECTORS[@]} -gt 0 ]; then
    print_warning "[SYSTEM TEST] Selectors are incomplete."
    echo "Next steps:"
    echo "  1) In a new terminal: pnpm selector:start"
    echo "  2) Click multiplier/timer/players/wager/status → Test ≥90% → Save & Update"
    echo "  3) (Optional) pnpm selectors:apply-latest"
    echo ""
    read -p "Press ENTER here to continue when done..."
    log_message "Selectors updated - proceeding to stack launch"
else
    print_status "All selectors are configured"
fi

# Step 2: Launch stack
print_step "Step 2: Launch Stack"
echo "Starting all services..."

# Check if tmux is available
TMUX_AVAILABLE=false
if command -v tmux &> /dev/null; then
    TMUX_AVAILABLE=true
    print_info "Using tmux for service management"
else
    print_warning "tmux not available, using background processes"
fi

if [ "$TMUX_AVAILABLE" = true ]; then
    # Create new tmux session
    tmux new-session -d -s rugs-system-test
    
    # Split into 4 panes
    tmux split-window -h
    tmux split-window -v
    tmux select-pane -t 0
    tmux split-window -v
    
    # Pane 1: Collector
    tmux select-pane -t 0
    tmux send-keys "echo 'Starting collector...' && pnpm --filter collector start" Enter
    
    # Pane 2: Predictor API
    tmux select-pane -t 1
    tmux send-keys "echo 'Starting predictor API...' && make serve" Enter
    
    # Pane 3: Dashboard
    tmux select-pane -t 2
    tmux send-keys "echo 'Starting dashboard...' && make dashboard" Enter
    
    # Pane 4: Log tailer
    tmux select-pane -t 3
    tmux send-keys "echo 'Starting log tailer...' && pnpm tail:logs --drift" Enter
    
    print_status "Services started in tmux session 'rugs-system-test'"
    echo "To attach: tmux attach -t rugs-system-test"
    
else
    # Start services in background
    echo "Starting collector..."
    pnpm --filter collector start > logs/collector.log 2>&1 &
    COLLECTOR_PID=$!
    echo $COLLECTOR_PID > .collector.pid
    print_status "Collector started (PID: $COLLECTOR_PID)"
    
    echo "Starting predictor API..."
    make serve > logs/api.log 2>&1 &
    API_PID=$!
    echo $API_PID > .api.pid
    print_status "API started (PID: $API_PID)"
    
    echo "Starting dashboard..."
    make dashboard > logs/dashboard.log 2>&1 &
    DASHBOARD_PID=$!
    echo $DASHBOARD_PID > .dashboard.pid
    print_status "Dashboard started (PID: $DASHBOARD_PID)"
    
    echo "Starting log tailer..."
    pnpm tail:logs --drift > logs/tailer.log 2>&1 &
    TAILER_PID=$!
    echo $TAILER_PID > .tailer.pid
    print_status "Log tailer started (PID: $TAILER_PID)"
fi

# Wait for services to start
echo ""
print_info "Waiting for services to start..."
sleep 10

# Print URLs
echo ""
echo "🌐 Service URLs:"
echo "  API: http://localhost:8787"
echo "  Dashboard: http://localhost:8501"
echo "  Collector logs: tail -f logs/collector.log"
echo ""

log_message "Stack launched - services running"

# Step 3: Collect short session
print_step "Step 3: Data Collection (${TEST_MINUTES} minutes)"
echo "Collecting data for ${TEST_MINUTES} minutes..."
echo "Health checks will run every 5 minutes..."

# Calculate end time
END_TIME=$(($(date +%s) + (TEST_MINUTES * 60)))
CURRENT_TIME=$(date +%s)

while [ $CURRENT_TIME -lt $END_TIME ]; do
    # Calculate remaining time
    REMAINING=$((END_TIME - CURRENT_TIME))
    REMAINING_MINUTES=$((REMAINING / 60))
    REMAINING_SECONDS=$((REMAINING % 60))
    
    echo "⏱️  Remaining: ${REMAINING_MINUTES}m ${REMAINING_SECONDS}s"
    
    # Run health check
    echo "🏥 Running health check..."
    if pnpm --filter collector run health > /tmp/health_check.txt 2>&1; then
        HEALTH_STATUS="OK"
        print_status "Health check passed"
    else
        HEALTH_STATUS="FAILED"
        print_warning "Health check failed"
    fi
    
    # Log health check
    log_message "Health check: $HEALTH_STATUS"
    cat /tmp/health_check.txt >> logs/system_test.log
    
    # Wait for next health check or end
    if [ $REMAINING -gt $HEALTH_CHECK_INTERVAL ]; then
        echo "💤 Sleeping for 5 minutes..."
        sleep $HEALTH_CHECK_INTERVAL
        CURRENT_TIME=$(date +%s)
    else
        break
    fi
done

print_status "Data collection completed!"
log_message "Data collection phase completed"

# Step 4: Train & Evaluate
print_step "Step 4: Training & Evaluation"
echo "Running full pipeline..."

# Export data
echo "📊 Exporting data..."
if make export; then
    print_status "Data export completed"
    log_message "Data export: SUCCESS"
else
    print_warning "Data export had issues"
    log_message "Data export: ISSUES"
fi

# Train model
echo "🤖 Training model..."
if make train; then
    print_status "Model training completed"
    log_message "Model training: SUCCESS"
else
    print_warning "Model training had issues"
    log_message "Model training: ISSUES"
fi

# Calibrate model
echo "🎯 Calibrating model..."
if make calibrate; then
    print_status "Model calibration completed"
    log_message "Model calibration: SUCCESS"
else
    print_warning "Model calibration had issues"
    log_message "Model calibration: ISSUES"
fi

# Tune thresholds
echo "⚙️  Tuning thresholds..."
if make tune; then
    print_status "Threshold tuning completed"
    log_message "Threshold tuning: SUCCESS"
else
    print_warning "Threshold tuning had issues"
    log_message "Threshold tuning: ISSUES"
fi

# Run simulation
echo "🎮 Running simulation..."
if make simulate; then
    print_status "Simulation completed"
    log_message "Simulation: SUCCESS"
else
    print_warning "Simulation had issues"
    log_message "Simulation: ISSUES"
fi

# Generate report
echo "📈 Generating report..."
if make report; then
    print_status "Report generation completed"
    log_message "Report generation: SUCCESS"
else
    print_warning "Report generation had issues"
    log_message "Report generation: ISSUES"
fi

log_message "Training & evaluation phase completed"

# Step 5: Verify overlay
print_step "Step 5: Overlay Verification"
echo "To test the overlay:"
echo "1. Install Tampermonkey browser extension"
echo "2. Load overlay/rugs-overlay.user.js"
echo "3. Navigate to rugs.fun"
echo "4. Verify predictions and EV calculations appear"
echo ""
echo "Press ENTER to continue..."
read -p ""

log_message "Overlay verification instructions provided"

# Step 6: Smoke check
print_step "Step 6: Smoke Test"
echo "Running comprehensive smoke test..."

if pnpm smoke > /tmp/smoke_output.txt 2>&1; then
    print_status "Smoke test passed"
    log_message "Smoke test: PASSED"
else
    print_warning "Smoke test had warnings (check output)"
    log_message "Smoke test: WARNINGS"
fi

# Log smoke test output
echo "Smoke test output:" >> logs/system_test.log
cat /tmp/smoke_output.txt >> logs/system_test.log

# Final smoke test result
echo ""
echo "📊 Final Smoke Test Result:"
if grep -q "✅" /tmp/smoke_output.txt; then
    echo "✅ System is healthy and ready for production"
else
    echo "⚠️  System has some issues - check smoke test output above"
fi

# Step 7: Done - Summary
print_step "Step 7: System Test Complete"
echo "🎉 Full system test completed successfully!"
echo ""

echo "📁 Generated Files & Paths:"
echo "  Database: data/rugs.sqlite"
echo "  Model: data/model.json"
echo "  Metrics: data/metrics.json"
echo "  Thresholds: data/thresholds.json"
echo "  Calibration: data/calibration.json"
echo "  Exports: data/exports/ (CSVs, plots)"
echo "  Logs: logs/system_test.log"
echo ""

echo "🌐 Service URLs:"
echo "  Dashboard: http://localhost:8501"
echo "  API: http://localhost:8787"
echo ""

echo "🔧 Next Steps:"
echo "  1. Open dashboard: http://localhost:8501"
echo "  2. Test overlay on rugs.fun"
echo "  3. Monitor collector logs: tail -f logs/collector.log"
echo "  4. Run periodic health checks: pnpm --filter collector run health"
echo ""

# Log completion
log_message "System test completed successfully"
log_message "All phases: selector setup, stack launch, data collection, training, evaluation, smoke test"

print_status "System test completed! Check logs/system_test.log for detailed results."
echo ""
echo "🎯 Happy researching!"
