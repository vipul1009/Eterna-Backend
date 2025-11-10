import { Worker, Job } from 'bullmq';
import { redisConfig, publisher } from './redis.js';
import { MockDexRouter } from './router/mockDexRouter.js';

console.log('[WORKER] Starting up...');

const processOrder = async (job: Job) => {
    const { orderId, inputToken, outputToken, amount } = job.data;
    const dexRouter = new MockDexRouter();
    console.log(`[WORKER] Processing order: ${amount} ${inputToken} -> ${outputToken} (ID: ${orderId})`);

    try {
        await publisher.publish('order-updates', JSON.stringify({
            orderId, status: 'pending', message: 'Order received and queued.'
        }));
        await sleep(1000);

        await publisher.publish('order-updates', JSON.stringify({
            orderId, status: 'routing', message: 'Comparing DEX prices...'
        }));
        const bestRoute = await dexRouter.findBestRoute(inputToken, outputToken, amount);

        await publisher.publish('order-updates', JSON.stringify({
            orderId, status: 'building', message: `Best price found on ${bestRoute.name}. Creating transaction...`,
            data: { dex: bestRoute.name, price: bestRoute.quote.price, estimatedOutput: bestRoute.quote.estimatedOutput }
        }));
        await sleep(1500);

        await publisher.publish('order-updates', JSON.stringify({
            orderId, status: 'submitted', message: 'Transaction sent to network.'
        }));
        const swapResult = await dexRouter.executeSwap(bestRoute.name, amount);

        const finalData = { 
            ...swapResult, 
            executedPrice: bestRoute.quote.price, 
            finalOutput: bestRoute.quote.estimatedOutput 
        };
        await publisher.publish('order-updates', JSON.stringify({
            orderId, status: 'confirmed', message: 'Transaction successful.',
            data: finalData
        }));

        console.log(`[WORKER] Finished processing order: ${orderId}`);
        return {
            orderId,
            chosenDex: bestRoute.name,
            executedPrice: finalData.executedPrice,
            transactionHash: finalData.txHash,
        };
    } catch (error: any) {
        console.error(`[WORKER] FAILED to process order ${orderId}:`, error);
        await publisher.publish('order-updates', JSON.stringify({
            orderId, status: 'failed', message: 'An error occurred during execution.',
            error: error.message
        }));
        throw error;
    }
};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const worker = new Worker('orders', processOrder, {
    connection: redisConfig,
    concurrency: 10
});
worker.on('completed', (job) => {
    console.log(`[WORKER] Job ${job.id} has completed!`);
});
worker.on('failed', async (job: any, err) => {
    console.error(`[WORKER] Job ${job?.id} has FAILED PERMANENTLY after ${job?.attemptsMade} attempts with error: ${err.message}`);
    
    const { orderId } = job.data;
    await publisher.publish('order-updates', JSON.stringify({
        orderId,
        status: 'failed',
        message: `Order failed after multiple retries: ${err.message}`
    }));
});
console.log('[WORKER] Worker is listening for jobs on the "orders" queue.');