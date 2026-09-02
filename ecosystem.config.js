module.exports = {
  apps: [
    {
      name: 'modernwar-bot',
      script: 'dist/index.js',
      cwd: 'C:\\Users\\Administrator\\Documents\\Work\\ModernWar-Bot',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
      },
      // Restart if crash unexpectedly
      min_uptime: '5s',
      max_restarts: 10,
    },
  ],
};