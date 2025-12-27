import Redis from 'ioredis';
import { logger } from '../server';

const redis = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: Number(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD,
    maxRetriesPerRequest: null, // Allow connection retries to not crash requests immediately
    retryStrategy: (times) => {
        // If we've retried 3 times, log a warning but keep retrying slowly
        if (times > 3) {
            // Only log every 50 seconds roughly to avoid spamming
            if (times % 10 === 0) {
                logger.warn('Redis connection failed. Retrying in background...');
            }
            return 5000; // Retry every 5 seconds
        }
        return Math.min(times * 50, 2000);
    }
});

redis.on('error', (err) => {
    // Only log error if it's not a connection refusal which is handled by retry strategy
    // or if we want to debug. To clean up logs, we suppress ECONNREFUSED spam.
    if ((err as any).code !== 'ECONNREFUSED') {
        logger.error('Redis connection error:', err);
    }
});

redis.on('connect', () => {
    logger.info('Connected to Redis');
});

export default redis;
