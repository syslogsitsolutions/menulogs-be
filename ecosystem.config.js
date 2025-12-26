/**
 * PM2 Ecosystem Configuration
 * 
 * This configuration file is used by PM2 to manage the application process.
 * It supports both production and development environments through environment variables.
 * 
 * Environment Variables:
 * - PM2_APP_NAME: Application name (default: menulogs-backend-prod)
 * - PM2_CWD: Working directory (default: /opt/menulogs/prod)
 * - PM2_INSTANCES: Number of instances (default: 2)
 * - NODE_ENV: Node environment (default: production)
 * - PORT: Application port (default: 5000)
 */

module.exports = {
  apps: [{
    // Application name - can be overridden via PM2_APP_NAME env var
    name: process.env.PM2_APP_NAME || 'menulogs-backend-prod',
    
    // Entry point script (relative to cwd)
    script: './app/backend/dist/server.js',
    
    // Working directory - can be overridden via PM2_CWD env var
    cwd: process.env.PM2_CWD || '/opt/menulogs/prod',
    
    // Number of instances to run (cluster mode)
    // Use 'max' to use all CPU cores, or specify a number
    instances: process.env.PM2_INSTANCES || 2,
    
    // Execution mode: 'cluster' for load balancing, 'fork' for single instance
    exec_mode: 'cluster',
    
    // Environment variables
    env: {
      NODE_ENV: process.env.NODE_ENV || 'production',
      PORT: process.env.PORT || 5000
    },
    
    // Log file paths - can be overridden via environment variables
    error_file: process.env.PM2_ERROR_LOG || '/opt/menulogs/logs/pm2-error.log',
    out_file: process.env.PM2_OUT_LOG || '/opt/menulogs/logs/pm2-out.log',
    log_file: process.env.PM2_COMBINED_LOG || '/opt/menulogs/logs/pm2-combined.log',
    
    // Logging configuration
    time: true,              // Prepend timestamp to logs
    merge_logs: true,       // Merge logs from all instances
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z', // Log date format
    
    // Process management
    autorestart: true,       // Auto-restart on crash
    max_restarts: 10,        // Maximum number of restarts
    min_uptime: '10s',      // Minimum uptime to consider process stable
    max_memory_restart: '1G', // Restart if memory exceeds 1GB
    
    // File watching (disabled in production)
    watch: false,
    ignore_watch: [
      'node_modules',
      'logs',
      '.git',
      'dist',
      '*.log'
    ],
    
    // Instance identifier for cluster mode
    instance_var: 'INSTANCE_ID',
    
    // Kill timeout (time to wait before force kill)
    kill_timeout: 5000,
    
    // Wait for graceful shutdown
    shutdown_with_message: true
  }]
};

