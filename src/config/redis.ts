import Redis from 'ioredis';

// Build Redis configuration
const redisConfig: {
  host: string;
  port: number;
  password?: string;
  retryStrategy: (times: number) => number | null;
  maxRetriesPerRequest: number | null;
  enableReadyCheck: boolean;
  lazyConnect?: boolean;
} = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  maxRetriesPerRequest: null, // Disable retries to prevent hanging
  enableReadyCheck: true,
};

// Support REDIS_URL format (redis://password@host:port or redis://host:port)
// REDIS_URL takes precedence over individual env vars
if (process.env.REDIS_URL) {
  try {
    const url = new URL(process.env.REDIS_URL);
    redisConfig.host = url.hostname;
    redisConfig.port = parseInt(url.port || '6379');
    if (url.password) {
      redisConfig.password = decodeURIComponent(url.password);
    }
  } catch (error) {
    console.error('❌ Invalid REDIS_URL format:', process.env.REDIS_URL);
  }
} else {
  // Only add password if it's provided and not empty
  if (process.env.REDIS_PASSWORD && process.env.REDIS_PASSWORD.trim() !== '') {
    redisConfig.password = process.env.REDIS_PASSWORD;
  }
}

const redis = new Redis(redisConfig);

redis.on('connect', () => {
  console.log('✅ Redis connected');
});

redis.on('ready', () => {
  console.log('✅ Redis ready');
});

redis.on('error', (err) => {
  console.error('❌ Redis error:', err.message);
  // Don't crash the app, but log the error
});

redis.on('close', () => {
  console.warn('⚠️ Redis connection closed');
});

redis.on('reconnecting', () => {
  console.log('🔄 Redis reconnecting...');
});

redis.on('end', () => {
  console.warn('⚠️ Redis connection ended');
});

export default redis;

