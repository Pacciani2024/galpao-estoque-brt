#!/bin/bash

# Define colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}   🤖 BRT AUDIOVISUAL - SYSTEM STARTUP (LINUX DEV)${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
echo ""

# Function to handle cleanup on exit
cleanup() {
    echo ""
    echo -e "${RED}🛑 Stopping services...${NC}"
    if [ -n "$KIRA_PID" ]; then
        kill $KIRA_PID 2>/dev/null
        echo "Kira Voice stopped."
    fi
    echo -e "${GREEN}✅ System Stopped${NC}"
    exit 0
}

# Trap SIGINT (Ctrl+C)
trap cleanup SIGINT

echo -e "${RED}🛑 Stopping previous processes (if any)...${NC}"
pkill -f "node server.js" 2>/dev/null
pkill -f "python3 mark_ears.py" 2>/dev/null
sleep 1

echo -e "${GREEN}🎤 Starting KIRA Voice (Background)...${NC}"
python3 mark_ears.py > /dev/null 2>&1 &
KIRA_PID=$!
echo "KIRA Voice PID: $KIRA_PID"

echo -e "${GREEN}🔄 Syncing inventory via API...${NC}"
node scripts/sync_inventory_api.js

echo -e "${GREEN}🔄 Executing event scraping...${NC}"
node scripts/sync_eventos_equipamentos.js

echo -e "${GREEN}🌐 Opening browser...${NC}"
xdg-open http://localhost:3000 > /dev/null 2>&1 &

echo -e "${GREEN}🚀 Starting Server (Nodemon)...${NC}"
echo -e "${Blue}Press Ctrl+C to stop everything.${NC}"
npm run dev
