"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.rateLimiter = void 0;
const redis_1 = __importDefault(require("../services/redis"));
const server_1 = require("../server");
const RATE_LIMIT_WINDOW = 60; // 1 minute
const MAX_REQUESTS = 20; // max requests per minute
const rateLimiter = async (req, res, next) => {
    const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    const key = `ratelimit:${ip}`;
    try {
        if (redis_1.default.status !== 'ready') {
            return next(); // Skip rate limiting if Redis is not available
        }
        const current = await redis_1.default.incr(key);
        if (current === 1) {
            await redis_1.default.expire(key, RATE_LIMIT_WINDOW);
        }
        if (current > MAX_REQUESTS) {
            return res.status(429).json({
                error: 'Too many requests. Please try again later.'
            });
        }
        next();
    }
    catch (error) {
        server_1.logger.error('Rate limiter error:', error);
        next(); // Fallback to allow request if redis is down
    }
};
exports.rateLimiter = rateLimiter;
