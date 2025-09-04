#!/bin/bash

# Console Collector CI Script
# Run this locally or in any CI environment to verify console-collector functionality

set -e  # Exit on any error

echo "🚀 Starting Console Collector CI..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    local status=$1
    local message=$2
    if [ "$status" = "PASS" ]; then
        echo -e "${GREEN}✅ $message${NC}"
    elif [ "$status" = "FAIL" ]; then
        echo -e "${RED}❌ $message${NC}"
    else
        echo -e "${YELLOW}⚠️  $message${NC}"
    fi
}

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check prerequisites
echo "🔍 Checking prerequisites..."

if ! command_exists node; then
    print_status "FAIL" "Node.js not found"
    exit 1
fi

if ! command_exists pnpm; then
    print_status "FAIL" "pnpm not found"
    exit 1
fi

print_status "PASS" "Prerequisites satisfied"

# Check Node.js version
NODE_VERSION=$(node --version)
echo "📦 Node.js version: $NODE_VERSION"

# Check pnpm version
PNPM_VERSION=$(pnpm --version)
echo "📦 pnpm version: $PNPM_VERSION"

# Install dependencies
echo "📥 Installing dependencies..."
pnpm install

# Build console-collector
echo "🔨 Building console-collector..."
cd apps/console-collector
pnpm build

# Run tests
echo "🧪 Running tests..."
pnpm test

# Run environment check
echo "🔍 Running environment check..."
pnpm check

# Run integration test
echo "🔗 Running integration test..."
pnpm test:integration

# Test replay consistency
echo "🔄 Testing replay consistency..."
pnpm replay test-fixtures/sample-events.jsonl --strict

# Test export-train
echo "📊 Testing export-train..."
pnpm export-train --out data/ci-test-train.json

# Verify export output
if [ -f "data/ci-test-train.json" ]; then
    print_status "PASS" "Export-train created output file"
    echo "📁 Output file size: $(wc -c < data/ci-test-train.json) bytes"
else
    print_status "FAIL" "Export-train did not create output file"
    exit 1
fi

# Clean up test artifacts
echo "🧹 Cleaning up test artifacts..."
rm -f data/ci-test-train.json

# Return to root
cd ../..

echo ""
print_status "PASS" "All CI checks passed! 🎉"
echo ""
echo "📋 Summary of completed checks:"
echo "  ✅ Dependencies installed"
echo "  ✅ Console-collector built"
echo "  ✅ Unit tests passed"
echo "  ✅ Environment check passed"
echo "  ✅ Integration test passed"
echo "  ✅ Replay consistency verified"
echo "  ✅ Export-train functionality verified"
echo ""
echo "🚀 Console-collector is ready for production!"
