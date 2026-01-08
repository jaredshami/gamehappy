#!/bin/bash

# GameHappy WebSocket Server - Production Startup
# This script starts the server using PM2

echo "========================================"
echo "GameHappy WebSocket Server"
echo "========================================"
echo ""

# Check if PM2 is installed globally
if ! command -v pm2 &> /dev/null; then
    echo "Installing PM2 globally..."
    npm install -g pm2
fi

# Navigate to websocket directory
cd "$(dirname "$0")"

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
fi

# Create logs directory
mkdir -p logs

# Start the server
echo "Starting GameHappy WebSocket Server..."
echo ""
npm run prod

# Show logs
echo ""
echo "Server started! Showing logs..."
sleep 2
npm run logs
