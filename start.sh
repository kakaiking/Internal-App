#!/bin/bash

# Terminal coloring
GREEN='\033[0;32m'
NC='\033[0;m' # No Color

echo -e "${GREEN}"
echo "======================================================"
echo "   🚀 LAUNCHING ENTERPRISE PORTAL (PORTAL OS)"
echo "   📁 Database: Physical JSON files in module folders"
echo "======================================================"
echo -e "${NC}"

# Check if node is installed
if ! command -v node &> /dev/null; then
    echo "❌ Error: Node.js is not installed. Please install Node.js to run this application."
    exit 1
fi

# Run the backend HTTP & REST API server
node server.js
