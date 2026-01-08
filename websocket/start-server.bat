@echo off
REM GameHappy WebSocket Server - Production Startup
REM This script starts the server using PM2

echo ========================================
echo GameHappy WebSocket Server
echo ========================================
echo.

REM Check if PM2 is installed globally
where pm2 >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo Installing PM2 globally...
    call npm install -g pm2
)

REM Navigate to websocket directory
cd /d "%~dp0"

REM Install dependencies if needed
if not exist "node_modules" (
    echo Installing dependencies...
    call npm install
)

REM Start the server
echo Starting GameHappy WebSocket Server...
echo.
call npm run prod

REM Keep window open if there's an error
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo Error occurred! Press any key to close...
    pause
)
