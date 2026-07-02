#!/bin/bash

# Terminal coloring
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
NC='\033[0;m' # No Color

echo -e "${GREEN}"
echo "======================================================"
echo "   🚀 LAUNCHING ENTERPRISE PORTAL (PORTAL OS)"
echo "   📁 Database: Physical JSON files in module folders"
echo "======================================================"
echo -e "${NC}"

# Check if node is installed
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Error: Node.js is not installed. Please install Node.js to run this application.${NC}"
    exit 1
fi

# Check if Node.js version is at least 18 (required for native fetch in server.js)
NODE_MAJOR_VERSION=$(node -v | tr -d 'v' | cut -d. -f1)
if [ "$NODE_MAJOR_VERSION" -lt 18 ]; then
    echo -e "${YELLOW}⚠️  Warning: Node.js version is below v18 (detected v$(node -v | tr -d 'v')).${NC}"
    echo -e "${YELLOW}The server's native fetch API requires Node.js v18 or higher.${NC}"
    echo ""
fi

# Optional: Load GITHUB_TOKEN from a local .env file if it exists
if [ -f .env ]; then
    echo "⚙️  Loading environment variables from .env file..."
    export $(grep -v '^#' .env | xargs)
fi

# Inform the user about GITHUB_TOKEN status
if [ -z "$GITHUB_TOKEN" ]; then
    echo -e "${YELLOW}ℹ️  GITHUB_TOKEN is not set. API rate limits or private repos might fail.${NC}"
fi

echo -e "${GREEN}Starting server...${NC}"
echo ""

# Run the backend HTTP & REST API server
node server.js