const redis = require('redis');

const client = redis.createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
});

client.on('error', (err) => console.error('Redis Client Error', err));

async function clearCache() {
  await client.connect();
  
  const patterns = ['menu:*', 'about:*', 'contact:*'];
  let totalCleared = 0;
  
  for (const pattern of patterns) {
    const keys = await client.keys(pattern);
    if (keys.length > 0) {
      await client.del(keys);
      totalCleared += keys.length;
      console.log(`Cleared ${keys.length} keys matching ${pattern}`);
    }
  }
  
  console.log(`\nTotal keys cleared: ${totalCleared}`);
  await client.quit();
}

clearCache().catch(console.error);
