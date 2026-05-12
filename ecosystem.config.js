module.exports = {
  apps: [
    {
      name: 'vlad-backend',
      script: './server.js',
      cwd: 'C:\\Users\\CJ\\PROJECTSSS\\Vlad_Trends_Project-main',
      interpreter: 'node',
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
      },
      // Auto-restart on crash with exponential backoff
      exp_backoff_restart_delay: 100,
      // Restart if memory exceeds 500MB
      max_restarts: 50,
      // Log configuration
      error_file: 'C:\\Users\\CJ\\.pm2\\logs\\vlad-backend-error.log',
      out_file: 'C:\\Users\\CJ\\.pm2\\logs\\vlad-backend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      // Merge stdout and stderr
      merge_logs: true,
      // Graceful shutdown
      kill_timeout: 5000,
      listen_timeout: 10000,
    },
  ],
};
