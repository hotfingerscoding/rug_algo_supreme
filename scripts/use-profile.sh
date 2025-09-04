#!/bin/bash
# Profile Switcher for Rugs Research
# Usage: scripts/use-profile.sh <profile_name>

set -e  # Exit on any error

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
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

# Check if profile name is provided
if [ $# -eq 0 ]; then
    echo "Usage: $0 <profile_name>"
    echo ""
    echo "Available profiles:"
    echo "  default  - Headless operation (production)"
    echo "  dev      - Headful operation (development)"
    echo "  lowcpu   - Resource-constrained operation"
    echo ""
    echo "Examples:"
    echo "  $0 default"
    echo "  $0 dev"
    echo "  $0 lowcpu"
    exit 1
fi

PROFILE_NAME=$1
PROFILE_FILE="config/profiles/${PROFILE_NAME}.env"
ENV_FILE=".env"

echo "🔄 Switching to profile: $PROFILE_NAME"
echo "================================"

# Check if profile exists
if [ ! -f "$PROFILE_FILE" ]; then
    print_error "Profile '$PROFILE_NAME' not found!"
    echo ""
    echo "Available profiles:"
    ls -1 config/profiles/*.env | sed 's|config/profiles/||' | sed 's|.env||' | while read profile; do
        echo "  - $profile"
    done
    exit 1
fi

# Backup current .env if it exists
if [ -f "$ENV_FILE" ]; then
    BACKUP_FILE=".env.backup.$(date +%Y%m%d_%H%M%S)"
    cp "$ENV_FILE" "$BACKUP_FILE"
    print_status "Backed up current .env to $BACKUP_FILE"
else
    print_warning "No existing .env file to backup"
fi

# Copy profile to .env
cp "$PROFILE_FILE" "$ENV_FILE"
print_status "Switched to profile: $PROFILE_NAME"

# Show profile description
if [ -f "$PROFILE_FILE" ]; then
    echo ""
    echo "📋 Profile Description:"
    grep "^# Description:" "$PROFILE_FILE" | sed 's/# Description: //' || echo "  No description available"
fi

# Show key differences from previous .env
if [ -f "$BACKUP_FILE" ]; then
    echo ""
    echo "🔄 Key Changes:"
    
    # Compare key settings
    for setting in HEADLESS POLL_MS TARGET_URL OVERLAY_SERVER; do
        old_value=$(grep "^${setting}=" "$BACKUP_FILE" | cut -d'=' -f2 || echo "not set")
        new_value=$(grep "^${setting}=" "$ENV_FILE" | cut -d'=' -f2 || echo "not set")
        
        if [ "$old_value" != "$new_value" ]; then
            echo "  $setting: $old_value → $new_value"
        fi
    done
fi

echo ""
print_status "Profile switch completed successfully!"
echo ""
echo "🔧 Next steps:"
echo "  1. Restart services if needed: pnpm quickstart"
echo "  2. Check settings: cat .env | grep -E '^(HEADLESS|POLL_MS|TARGET_URL)'"
echo "  3. Verify collector behavior matches profile expectations"
echo ""
echo "💡 To revert: cp $BACKUP_FILE .env"
