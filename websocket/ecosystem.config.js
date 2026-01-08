module.exports = {
  apps: [
    {
      name: 'gamehappy-websocket',
      script: './server.js',
      instances: 1,
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        PORT: 8443
      },
      max_memory_restart: '500M',
      watch: false,
      ignore_watch: ['node_modules', 'logs'],
      max_restarts: 10,
      min_uptime: '10s',
      error_file: './logs/err.log',
      out_file: './logs/out.log',
      log_file: './logs/combined.log',
      time_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      // Graceful shutdown
      kill_timeout: 10000,
      listen_timeout: 5000,
      shutdown_with_message: true
    }
  ],
  deploy: {
    production: {
      user: 'root',
      host: 'gamehappy.app',
      ref: 'origin/master',
      repo: 'https://github.com/your-username/gamehappy.git',
      path: '/var/www/gamehappy',
      'post-deploy': 'npm install && npm run prod'
    }
  }
};
