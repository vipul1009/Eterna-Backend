import { createRequire } from 'module';
import { Queue } from 'bullmq';

const require = createRequire(import.meta.url);
const IORedis = require("ioredis");

export const redisConfig = {
    host: process.env.REDIS_HOST || 'redis',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    maxRetriesPerRequest: null
};

export const publisher = new IORedis(redisConfig);

publisher.on('connect', () => {
    console.log('[WORKER] Connected to Redis successfully!');
});

publisher.on('error', (err: any) => {
    console.error('[WORKER] Redis connection error:', err);
});

export const orderQueue = new Queue('orders', {
    connection: redisConfig
});

console.log("Order queue initialized.");