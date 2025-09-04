#!/bin/bash

# Console Collector CI Script
# Runs all acceptance checks to prevent regressions

set -e  # Exit on any error

echo "🚀 Console Collector CI - Running Acceptance Checks"
echo "=================================================="

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
        echo -e "${GREEN}✅ PASS${NC}: $message"
    elif [ "$status" = "FAIL" ]; then
        echo -e "${RED}❌ FAIL${NC}: $message"
    else
        echo -e "${YELLOW}⚠️  WARN${NC}: $message"
    fi
}

# Track results
PASSED=0
FAILED=0

echo -e "\n📦 Phase 1: Dependencies and Build"
echo "-----------------------------------"

# Install dependencies
echo "Installing dependencies..."
if pnpm install; then
    print_status "PASS" "Dependencies installed"
    ((PASSED++))
else
    print_status "FAIL" "Dependency installation failed"
    ((FAILED++))
fi

# Build all packages
echo "Building packages..."
if pnpm build -r; then
    print_status "PASS" "All packages built successfully"
    ((PASSED++))
else
    print_status "FAIL" "Build failed"
    ((FAILED++))
fi

echo -e "\n🔍 Phase 2: Environment Verification"
echo "--------------------------------------"

# Environment check
echo "Running environment check..."
if pnpm console:check; then
    print_status "PASS" "Environment verification passed"
    ((PASSED++))
else
    print_status "FAIL" "Environment verification failed"
    ((FAILED++))
fi

echo -e "\n🧪 Phase 3: Testing"
echo "-------------------"

# Run tests
echo "Running tests..."
if pnpm test; then
    print_status "PASS" "All tests passed"
    ((PASSED++))
else
    print_status "FAIL" "Tests failed"
    ((FAILED++))
fi

echo -e "\n🔄 Phase 4: Replay Consistency"
echo "--------------------------------"

# Test replay with fixtures
echo "Testing replay consistency..."
if pnpm console:replay --strict test-fixtures/sample-events.jsonl; then
    print_status "PASS" "Replay consistency verified"
    ((PASSED++))
else
    print_status "FAIL" "Replay consistency failed"
    ((FAILED++))
fi

echo -e "\n📊 Phase 5: Analysis and Export"
echo "---------------------------------"

# Test analysis export
echo "Testing analysis export..."
if pnpm console:analyze --format=json --out=data/ci_test.json; then
    print_status "PASS" "Analysis export successful"
    ((PASSED++))
else
    print_status "FAIL" "Analysis export failed"
    ((FAILED++))
fi

echo -e "\n🧹 Phase 6: Storage Management"
echo "--------------------------------"

# Test prune functionality
echo "Testing storage management..."
if pnpm console:prune; then
    print_status "PASS" "Storage management working"
    ((PASSED++))
else
    print_status "FAIL" "Storage management failed"
    ((FAILED++))
fi

echo -e "\n🏥 Phase 7: Health Monitoring"
echo "--------------------------------"

# Test health check
echo "Testing health monitoring..."
if pnpm console:health; then
    print_status "PASS" "Health monitoring working"
    ((PASSED++))
else
    print_status "FAIL" "Health monitoring failed"
    ((FAILED++))
fi

# Cleanup test files
echo "Cleaning up test files..."
rm -f data/ci_test.json
rm -f apps/console-collector/data/ci_test.json

echo -e "\n📈 CI Results Summary"
echo "====================="
echo "Total Checks: $((PASSED + FAILED))"
echo -e "${GREEN}Passed: $PASSED${NC}"
echo -e "${RED}Failed: $FAILED${NC}"

if [ $FAILED -eq 0 ]; then
    echo -e "\n🎉 All acceptance checks passed!"
    echo "✅ Console Collector is ready for production"
    exit 0
else
    echo -e "\n⚠️  Some acceptance checks failed!"
    echo "❌ Please fix issues before proceeding"
    exit 1
fi
