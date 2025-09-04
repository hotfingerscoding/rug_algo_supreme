#!/bin/bash
# Quick-Start Script for Rugs Research
# One command to run the whole loop locally

set -e  # Exit on any error

echo "🚀 Rugs Research Quick-Start"
echo "============================"

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

# Check prerequisites
echo "Checking prerequisites..."

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

# Check tmux (optional)
TMUX_AVAILABLE=false
if command -v tmux &> /dev/null; then
    TMUX_AVAILABLE=true
    print_status "tmux: available"
else
    print_warning "tmux: not available, will use background processes"
fi

# Create virtual environment if missing
echo ""
echo "Setting up Python environment..."
if [ ! -d "venv" ]; then
    print_info "Creating virtual environment..."
    python3 -m venv venv
    print_status "Virtual environment created"
fi

# Activate virtual environment and install requirements
print_info "Installing Python dependencies..."
source venv/bin/activate
if [ -f "apps/analyzer/requirements.txt" ]; then
    pip install -r apps/analyzer/requirements.txt
    print_status "Python dependencies installed"
else
    print_warning "No requirements.txt found, skipping Python deps"
fi

# Copy .env if missing
echo ""
echo "Setting up environment configuration..."
if [ ! -f ".env" ]; then
    if [ -f ".env.example" ]; then
        cp .env.example .env
        print_status "Created .env from .env.example"
        
        # Set sensible defaults
        sed -i.bak 's/HEADLESS=.*/HEADLESS=true/' .env
        sed -i.bak 's/POLL_MS=.*/POLL_MS=200/' .env
        sed -i.bak 's/TARGET_URL=.*/TARGET_URL=https:\/\/rugs.fun/' .env
        sed -i.bak 's/OVERLAY_SERVER=.*/OVERLAY_SERVER=http:\/\/localhost:8787/' .env
        print_status "Applied sensible defaults to .env"
    else
        print_warning "No .env.example found, creating minimal .env"
        cat > .env << EOF
HEADLESS=true
POLL_MS=200
TARGET_URL=https://rugs.fun
OVERLAY_SERVER=http://localhost:8787
DB_PATH=data/rugs.sqlite
EOF
        print_status "Created minimal .env"
    fi
else
    print_status ".env already exists"
fi

# Install dependencies and build
echo ""
echo "Installing Node.js dependencies and building..."
pnpm install

# Rebuild SQLite binding for macOS compatibility
echo ""
echo "🔧 Rebuilding better-sqlite3 native binding for Node $(node -v)..."
pnpm rebuild:sqlite
if [ $? -eq 0 ]; then
    print_status "SQLite binding rebuilt successfully"
else
    print_warning "SQLite rebuild failed"
    echo "💡 Install Xcode Command Line Tools: xcode-select --install"
    echo "   Then run: pnpm rebuild:sqlite"
fi

if pnpm -w build; then
    print_status "Dependencies installed and packages built"
else
    print_warning "Build had issues, but continuing with installation"
fi

# Create necessary directories
echo ""
echo "Creating data directories..."
mkdir -p data/exports data/backups data/models logs .cache
print_status "Data directories created"

# Install Playwright browser if not already installed
if [ ! -f ".cache/.playwright_installed" ]; then
    echo ""
    echo "🌐 Installing Playwright Chromium browser..."
    if pnpm --filter collector exec npx playwright install chromium; then
        print_status "Playwright Chromium installed successfully"
        touch .cache/.playwright_installed
    else
        print_warning "Playwright installation had issues, but continuing"
    fi
else
    print_status "Playwright Chromium already installed"
fi

# Start services
echo ""
echo "Starting services..."

if [ "$TMUX_AVAILABLE" = true ]; then
    print_info "Starting services in tmux..."
    
    # Create new tmux session
    tmux new-session -d -s rugs-research
    
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
    
    print_status "Services started in tmux session 'rugs-research'"
    echo ""
    echo "To attach to the session: tmux attach -t rugs-research"
    echo "To detach: Ctrl+B, then D"
    
else
    print_info "Starting services in background (tmux not available)..."
    
    # Start collector
    echo "Starting collector..."
    pnpm --filter collector start > logs/collector.log 2>&1 &
    COLLECTOR_PID=$!
    echo $COLLECTOR_PID > .collector.pid
    print_status "Collector started (PID: $COLLECTOR_PID)"
    
    # Start predictor API
    echo "Starting predictor API..."
    make serve > logs/api.log 2>&1 &
    API_PID=$!
    echo $API_PID > .api.pid
    print_status "API started (PID: $API_PID)"
    
    # Start dashboard
    echo "Starting dashboard..."
    make dashboard > logs/dashboard.log 2>&1 &
    DASHBOARD_PID=$!
    echo $DASHBOARD_PID > .dashboard.pid
    print_status "Dashboard started (PID: $DASHBOARD_PID)"
    
    # Start log tailer
    echo "Starting log tailer..."
    pnpm tail:logs --drift > logs/tailer.log 2>&1 &
    TAILER_PID=$!
    echo $TAILER_PID > .tailer.pid
    print_status "Log tailer started (PID: $TAILER_PID)"
    
    echo ""
    echo "Process PIDs saved to .*.pid files"
    echo "To stop all services: pkill -f 'rugs-research'"
fi

# Wait a moment for services to start
echo ""
print_info "Waiting for services to start..."
sleep 5

# Print local URLs and next steps
echo ""
echo "🌐 Local URLs:"
echo "  Collector logs: tail -f logs/collector.log"
echo "  API: http://localhost:8787"
echo "  Dashboard: http://localhost:8501"
echo ""

echo "📋 Next Steps:"
echo "  1. Wait for collector to start capturing data (check logs/collector.log)"
echo "  2. Open dashboard: http://localhost:8501"
echo "  3. Check API health: curl http://localhost:8787/health"
echo "  4. Monitor for drift: pnpm tail:logs --drift"
echo ""

echo "🔧 Useful Commands:"
echo "  pnpm --filter collector run health    # Quick health check"
echo "  make export                          # Export data to CSV"
echo "  make train                           # Train model"
echo "  make simulate                        # Run strategy simulation"
echo ""

print_status "Quick-start completed successfully!"
echo ""
echo "🎯 Happy researching!"
