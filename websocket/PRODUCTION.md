# GameHappy WebSocket Server - Production Setup

## Overview
This is the production-ready WebSocket server for GameHappy, a real-time multiplayer social deduction game. The server uses PM2 for process management and automatic restarts.

## Prerequisites
- Node.js v14+ installed
- PM2 installed globally: `npm install -g pm2`
- SSL certificates (key.pem and cert.pem) in the websocket directory

## Quick Start

### Windows
```batch
cd websocket
npm install
start-server.bat
```

### Linux/Mac
```bash
cd websocket
npm install
chmod +x start-server.sh
./start-server.sh
```

## Manual Commands

### Start the server
```bash
npm run prod
```

### Stop the server
```bash
npm run prod-stop
```

### Restart the server
```bash
npm run prod-restart
```

### View logs
```bash
npm run logs
```

### Delete PM2 process
```bash
npm run prod-delete
```

## PM2 Configuration
The server is configured in `ecosystem.config.js` with:
- **Single instance** with cluster mode enabled for optimal performance
- **Auto-restart** on crash with exponential backoff
- **Memory limit** of 500MB with automatic restart if exceeded
- **Graceful shutdown** with 10-second timeout
- **Logging** to separate error and output files in `./logs/`
- **Timestamp logging** for debugging

## Architecture

### Server Port
- **Port**: 8443 (HTTPS WebSocket)
- **Path**: `/websocket`
- **Environment**: Production

### Supported Games
- **Secret Syndicates**: Social deduction game with roles (Syndicates, Detective, Body Guard, Eye Witness, Bystander)

## Features

### Game Management
- Create/join games with unique codes
- Real-time player synchronization
- Game state persistence for current session
- Support for multiple concurrent games

### Secret Syndicates Gameplay
- **Roles**: Syndicate, Detective, Body Guard, Eye Witness, Bystander
- **Game Phases**: 
  - Night: Roles perform actions
  - Murder: Assassination results
  - Trial: Discussion phase
  - Accusation: Voting phase
  - Verdict: Results phase
- **Special Mechanics**:
  - Body Guard protection (prevents assassination)
  - Eye Witness reveals assassin + secret action word
  - Detective gets keyword hint to identify eye witness
  - Syndicate assassin voting with consensus

## Production Best Practices

### SSL Certificates
- Ensure `key.pem` and `cert.pem` are valid and secure
- Store credentials safely; never commit to version control
- Set appropriate file permissions (600) on certificate files

### Monitoring
- Check logs regularly: `npm run logs`
- Monitor server performance and connection count
- Set up automated backup of logs
- Configure alerts for errors and crashes

### Graceful Shutdown
- Server handles SIGTERM and SIGINT signals
- Automatic 10-second timeout before forced shutdown
- All connections closed cleanly before exit

### Error Handling
- Uncaught exceptions trigger process restart via PM2
- Unhandled promise rejections are logged
- Server logs include timestamps for debugging

### Memory Management
- Maximum memory limit: 500MB
- Automatic restart if exceeded
- Watch configuration excludes node_modules to prevent memory waste

## Troubleshooting

### Server won't start
1. Check Node.js version: `node --version`
2. Verify SSL certificates exist: `ls key.pem cert.pem`
3. Ensure port 8443 is not in use
4. Check PM2 status: `pm2 status`

### Connection issues
1. Verify CORS settings in server.js
2. Check firewall allows port 8443
3. Ensure SSL certificates are valid
4. Review client connection code

### Memory issues
1. Monitor with: `pm2 monit`
2. Check logs for leaks: `npm run logs`
3. Restart if needed: `npm run prod-restart`

### Logs location
- Error log: `./logs/err.log`
- Output log: `./logs/out.log`
- Combined log: `./logs/combined.log`

## SSL Certificate Generation (if needed)

Create self-signed certificates for testing:
```bash
openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 365 -nodes
```

For production, use certificates from a trusted CA (Let's Encrypt, etc.)

## Environment Variables
- `NODE_ENV`: Set to 'production' automatically by PM2
- `PORT`: Default 8443, can be overridden

## Deployment
For automated deployment, configure git repo in `ecosystem.config.js` deploy section and run:
```bash
pm2 deploy production setup
pm2 deploy production
```

## Support
For issues or questions, check the main GameHappy documentation or contact the development team.
