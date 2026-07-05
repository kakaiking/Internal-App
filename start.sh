#!/bin/bash

GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${CYAN}======================================================${NC}"
echo -e "${GREEN}🚀 Starting Local Server (Static Mode)...\${NC}"
echo -e "${CYAN}======================================================${NC}"
echo -e "${YELLOW}Since the app is now fully static and serverless, we are simply serving the HTML files.${NC}\n"

# Try using npx (Node) first, fallback to Python
if command -v npx &> /dev/null
then
    echo "Using Node (http-server)..."
    echo "Serving on http://localhost:3000 and opening browser..."
    # -c-1 disables caching, -a localhost forces localhost binding, -o opens browser
    npx http-server -c-1 -p 3000 -a localhost -o
elif command -v python3 &> /dev/null
then
    echo "npx not found. Using Python 3 server..."
    echo "Serving on http://localhost:3000 and opening browser..."
    xdg-open http://localhost:3000 2>/dev/null &
    python3 -m http.server 3000 --bind localhost
else
    echo -e "\033[1;31mError: You need Node.js (npx) or Python 3 installed to run a local server.\033[0m"
    exit 1
fi
