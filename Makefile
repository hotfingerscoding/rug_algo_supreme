.PHONY: install build clean collector exports analyze serve test lint type-check dev quick-start help eval drift simulate report jobs export train drift backup rotate dashboard

# Default target
help:
	@echo "Rugs Research - Available Commands:"
	@echo "  install      - Install all dependencies"
	@echo "  build        - Build all packages"
	@echo "  clean        - Clean build artifacts"
	@echo "  collector    - Start data collection"
	@echo "  exports      - Export data to CSV"
	@echo "  analyze      - Train models"
	@echo "  eval         - Evaluate model performance"
	@echo "  drift        - Monitor model drift"
	@echo "  simulate     - Run strategy simulations"
	@echo "  report       - Generate strategy reports"
	@echo "  serve        - Start prediction API"
	@echo "  test         - Run tests"
	@echo "  lint         - Run linting"
	@echo "  type-check   - Run type checking"
	@echo "  dev          - Start development mode"
	@echo "  quick-start  - Install + build"
	@echo "  jobs         - Start job scheduler"
	@echo "  export       - Run single CSV export"
	@echo "  train        - Run single model training"
	@echo "  backup       - Run single database backup"
	@echo "  rotate       - Run single file rotation"
	@echo "  dashboard    - Start Streamlit dashboard"
	@echo "  tune         - Tune cash/sidebet thresholds"
	@echo "  calibrate    - Calibrate model probabilities"
	@echo "  regime       - Detect market regimes"
	@echo "  help         - Show this help"

# Installation
install:
	@echo "Installing dependencies..."
	pnpm install
	@echo "Dependencies installed successfully"

# Build
build:
	@echo "Building packages..."
	pnpm build
	@echo "Build completed"

# Clean
clean:
	@echo "Cleaning build artifacts..."
	pnpm clean
	@echo "Clean completed"

# Data Collection
collector:
	@echo "Starting data collector..."
	pnpm --filter collector start

# Data Export
exports:
	@echo "Exporting data to CSV..."
	pnpm --filter collector export:csv

# Model Training
analyze:
	@echo "Training models..."
	cd apps/analyzer && python train.py

# Model Evaluation
eval:
	@echo "Evaluating model performance..."
	cd apps/analyzer && python eval.py

# Drift Monitoring
drift:
	@echo "Monitoring model drift..."
	cd apps/analyzer && python drift.py

# Strategy Simulation
simulate:
	@echo "Running strategy simulations..."
	cd apps/analyzer && python simulate.py

# Strategy Reports
report:
	@echo "Generating strategy reports..."
	cd apps/analyzer && python report.py

# API Server
serve:
	@echo "Starting prediction API..."
	cd apps/analyzer && python serve.py

# Dashboard
dashboard:
	@echo "Starting Streamlit dashboard..."
	cd apps/analyzer && streamlit run dashboard.py

# Threshold Tuning
tune:
	@echo "Tuning cash and sidebet thresholds..."
	cd apps/analyzer && python tune_thresholds.py

# Model Calibration
calibrate:
	@echo "Calibrating model probabilities..."
	cd apps/analyzer && python calibrate.py

# Regime Detection
regime:
	@echo "Detecting market regimes..."
	cd apps/analyzer && python regime.py

# Health Check
health:
	@echo "Running health check..."
	pnpm --filter collector health

# Job Management
jobs:
	@echo "Starting job scheduler..."
	pnpm jobs:start

export:
	@echo "Running single CSV export..."
	pnpm jobs:run exportCSV

train:
	@echo "Running single model training..."
	pnpm jobs:run trainDaily

backup:
	@echo "Running single database backup..."
	pnpm jobs:run backupHourly

rotate:
	@echo "Running single file rotation..."
	pnpm jobs:run rotateDaily

# Testing
test:
	@echo "Running tests..."
	pnpm test

# Linting
lint:
	@echo "Running linting..."
	pnpm lint

# Type Checking
type-check:
	@echo "Running type checking..."
	pnpm type-check

# Development Mode
dev:
	@echo "Starting development mode..."
	pnpm dev

# Quick Start
quick-start: install build
	@echo "Quick start completed!"
	@echo "Next steps:"
	@echo "  1. Update selectors in apps/collector/src/config/selectors.ts"
	@echo "  2. Run 'make collector' to start data collection"
	@echo "  3. Run 'make analyze' to train models"
	@echo "  4. Run 'make eval' to evaluate model performance"
	@echo "  5. Run 'make simulate' to test strategies"
	@echo "  6. Run 'make report' to generate strategy reports"
	@echo "  7. Run 'make serve' to start prediction API"
	@echo "  8. Run 'make drift' to monitor model drift"
	@echo "  9. Run 'make jobs' to start automated jobs"
	@echo "  10. Run 'make dashboard' to view live dashboard"
