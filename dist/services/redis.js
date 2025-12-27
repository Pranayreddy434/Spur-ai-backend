"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const ioredis_1 = __importDefault(require("ioredis"));
const server_1 = require("../server");
const redis = new ioredis_1.default({
    host: process.env.REDIS_HOST || 'localhost',
    port: Number(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD,
    maxRetriesPerRequest: null, // Allow connection retries to not crash requests immediately
    retryStrategy: (times) => {
        // If we've retried 3 times, log a warning but keep retrying slowly
        if (times > 3) {
            // Only log every 50 seconds roughly to avoid spamming
            if (times % 10 === 0) {
                server_1.logger.warn('Redis connection failed. Retrying in background...');
            }
            return 5000; // Retry every 5 seconds
        }
        return Math.min(times * 50, 2000);
    }
});
redis.on('error', (err) => {
    server_1.logger.error('Redis connection error:', err);
});
redis.on('connect', () => {
    server_1.logger.info('Connected to Redis');
});
exports.default = redis;
