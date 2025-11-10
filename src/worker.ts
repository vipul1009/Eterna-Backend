import { Worker } from 'bullmq';
import { redisConfig, publisher } from './redis.js';

console.log('[WORKER] Starting up...');

const processOrder = async (job: any) => {
    const { orderId } = job.data;
    console.log(`[WORKER] Processing order: ${orderId}`);

    const statuses = [
        { status: 'pending', message: 'Order received and queued.' },
        { status: 'routing', message: 'Comparing DEX prices...' },
        { status: 'building', message: 'Creating transaction...' },
        { status: 'submitted', message: 'Transaction sent.' },
        { status: 'confirmed', message: 'Transaction successful.' },
    ];

    let delay = 1000;
    for (const s of statuses) {
        await new Promise(resolve => setTimeout(resolve, delay));
        
        const payload = { orderId, status: s.status, message: s.message };
        if (s.status === 'confirmed') {
            (payload as any).txHash = `mock_tx_${Date.now()}`;
        }

        console.log(`[WORKER] Publishing status for ${orderId}: ${s.status}`);
        
        await publisher.publish('order-updates', JSON.stringify(payload));
        
        delay = 2000;
    }
    
    console.log(`[WORKER] Finished processing order: ${orderId}`);
    return { done: true, orderId };
};

const worker = new Worker('orders', processOrder, {
    connection: redisConfig,
    concurrency: 10 
});

worker.on('completed', (job) => {
    console.log(`[WORKER] Job ${job.id} has completed!`);
});

worker.on('failed', (job, err) => {
    console.error(`[WORKER] Job ${job?.id} has failed with ${err.message}`);
});

console.log('[WORKER] Worker is listening for jobs on the "orders" queue.');