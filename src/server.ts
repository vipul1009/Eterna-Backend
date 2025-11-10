import Fastify from 'fastify';
import { WebSocketServer, WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const IORedis = require("ioredis");

import { orderQueue, redisConfig } from './redis.js';

const server = Fastify({ logger: true });
const wss = new WebSocketServer({ noServer: true });

const activeConnections = new Map<string, WebSocket>();

server.get('/health', async () => {
    return { status: 'ok', uptime: process.uptime() };
});

server.get('/api/orders/execute', (request, reply) => { });

server.server.on('upgrade', (request, socket, head) => {
    if (request.url === '/api/orders/execute') {
        wss.handleUpgrade(request, socket, head, (ws) => {
            wss.emit('connection', ws, request);
        });
    } else {
        socket.destroy();
    }
});

wss.on('connection', async (ws: WebSocket) => {
    const orderId = uuidv4();
    console.log(`[API] Connection established for new order ${orderId}`);
    
    activeConnections.set(orderId, ws);

    try {
        await orderQueue.add('process-order', { orderId });
        console.log(`[API] Added job for order ${orderId} to the queue.`);
        
        ws.send(JSON.stringify({
            orderId,
            status: 'accepted',
            message: 'Order accepted and queued for processing.'
        }));
    } catch (err) {
        console.error(`[API] Failed to add job for order ${orderId}`, err);
        ws.send(JSON.stringify({
            orderId,
            status: 'failed',
            message: 'Failed to queue order.'
        }));
        ws.close();
    }
    
    ws.on('close', () => {
        console.log(`[API] Connection closed for order ${orderId}`);
        activeConnections.delete(orderId);
    });
});

const subscriber = new IORedis(redisConfig);
subscriber.subscribe('order-updates', (err: string) => {
    if (err) {
        console.error('[API] Failed to subscribe to order-updates', err);
        process.exit(1);
    } else {
        console.log('[API] Subscribed to order-updates channel.');
    }
});

subscriber.on('message', (channel: any, message: any) => {
    if (channel === 'order-updates') {
        const update = JSON.parse(message);
        const { orderId, status } = update;
        
        const connection = activeConnections.get(orderId);
        if (connection && connection.readyState === WebSocket.OPEN) {
            console.log(`[API] Forwarding status update for ${orderId}: ${status}`);
            connection.send(message);
            
            if (status === 'confirmed' || status === 'failed') {
                connection.close();
            }
        }
    }
});

(async () => {
    try {
        const port = Number(process.env.PORT) || 3000;
        await server.listen({ port, host: '0.0.0.0' });
    } catch (err) {
        server.log.error(err);
        process.exit(1);
    }
})();

export default server;