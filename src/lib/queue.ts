import { Queue } from 'bullmq';
import { redisConfig } from '../config/redis.js';

export const bullmqConnection = {
    connection: redisConfig
};

export const defaultJobOptions = {
    attempts: 3,
    backoff: {
        type: 'exponential',
        delay: 1000,
    },
    removeOnComplete: true,
    removeOnFail: true
};

export const orderQueue = new Queue('orders', bullmqConnection);

