import { Worker, Job } from 'bullmq';
import { redisConfig } from './config/redis.js';
import { MockDexRouter } from './dex/mockDexRouter.js';
import { createRequire } from 'module';
import { prisma } from './db.js';

const require = createRequire(import.meta.url);
const IORedis = require("ioredis");

console.log('[WORKER] Starting up...');
console.log('[WORKER] Creating Redis publisher client...');

const publisher = new IORedis(redisConfig);

const processOrder = async (job: Job) => {
    const { orderId, inputToken, outputToken, amount } = job.data;
    const dexRouter = new MockDexRouter();

    try {

        await publisher.publish('order-updates', JSON.stringify({
            orderId,
            status: 'routing',
            message: 'Comparing DEX prices and finding best route.'
        }));

        const bestRoute = await dexRouter.findBestRoute(inputToken, outputToken, amount);

        await publisher.publish('order-updates', JSON.stringify({
            orderId,
            status: 'building',
            message: `Building transaction for route ${bestRoute.name}.`,
            data: { chosenDex: bestRoute.name, quote: bestRoute.quote }
        }));

        const swapResult = await dexRouter.executeSwap(bestRoute.name, amount);

        await publisher.publish('order-updates', JSON.stringify({
            orderId,
            status: 'submitted',
            message: 'Transaction submitted to the network.',
            data: { txHash: swapResult.txHash }
        }));

        const finalData = {
            ...swapResult,
            executedPrice: bestRoute.quote.price,
            finalOutput: bestRoute.quote.estimatedOutput
        };

        await publisher.publish('order-updates', JSON.stringify({
            orderId, status: 'confirmed', message: 'Transaction successful.',
            data: finalData
        }));

        return { jobData: job.data, finalData };

        } catch (error: any) {
        console.error(`[WORKER] FAILED to process order ${orderId}:`, error);
        await publisher.publish('order-updates', JSON.stringify({
            orderId, status: 'failed', message: 'An error occurred during execution.',
            error: error.message
        }));
        throw error;
    }
};

console.log('[WORKER] Creating BullMQ worker...');
const worker = new Worker('orders', processOrder, {
    connection: redisConfig,
    concurrency: 10
});

worker.on('completed', async (job, result) => {
    const { jobData, finalData } = result;
    console.log(`[WORKER] Job completed for order ${jobData.orderId}. Saving to DB...`);
    try {
        await prisma.order.create({
            data: {
                id: jobData.orderId,
                status: 'CONFIRMED',
                inputToken: jobData.inputToken,
                outputToken: jobData.outputToken,
                inputAmount: jobData.amount,
                executedPrice: finalData.executedPrice,
                finalOutput: finalData.finalOutput,
                transactionHash: finalData.txHash,
            }
        });
        console.log(`[DB] Saved CONFIRMED order ${jobData.orderId}`);
    } catch (e) {
        console.error(`[DB] FAILED to save confirmed order ${jobData.orderId}`, e);
    }
});

worker.on('failed', async (job: any, err) => {
    const { orderId, inputToken, outputToken, amount } = job.data;
    console.error(`[WORKER] Job for order ${orderId} has FAILED PERMANENTLY. Saving to DB...`);
    try {
        await prisma.order.create({
            data: {
                id: orderId,
                status: 'FAILED',
                inputToken: inputToken,
                outputToken: outputToken,
                inputAmount: amount,
                failReason: err.message.substring(0, 255),
            }
        });
        console.log(`[DB] Saved FAILED order ${orderId}`);
    } catch (e) {
        console.error(`[DB] FAILED to save failed order ${orderId}`, e);
    }
});


console.log('[WORKER] Worker is listening for jobs on the "orders" queue.');
