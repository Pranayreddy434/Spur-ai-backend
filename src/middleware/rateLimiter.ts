import { Request, Response, NextFunction } from 'express';
import redis from '../services/redis';
import { logger } from '../server';

const RATE_LIMIT_WINDOW = 60; // 1 minute
const MAX_REQUESTS = 20; // max requests per minute

export const rateLimiter = async (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    const key = `ratelimit:${ip}`;

    try {
        if (redis.status !== 'ready') {
            return next(); // Skip rate limiting if Redis is not available
        }
        const current = await redis.incr(key);

        if (current === 1) {
            await redis.expire(key, RATE_LIMIT_WINDOW);
        }

        if (current > MAX_REQUESTS) {
            return res.status(429).json({
                error: 'Too many requests. Please try again later.'
            });
        }

        next();
    } catch (error) {
        logger.error('Rate limiter error:', error);
        next(); // Fallback to allow request if redis is down
    }
};
