import Fastify from 'fastify';
import { WebSocketServer, WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';

const server = Fastify({ logger: true });

const wss = new WebSocketServer({ noServer: true });

server.get('/health', async () => {
    return { status: 'ok', uptime: process.uptime() };
});

server.get('/api/orders/execute', (request, reply) => {
    
});

server.server.on('upgrade', (request, socket, head) => {
    if (request.url === '/api/orders/execute') {
        wss.handleUpgrade(request, socket, head, (ws) => {
            wss.emit('connection', ws, request);
        });
    } else {
        socket.destroy();
    }
});

wss.on('connection', (ws: WebSocket) => {
    const orderId = uuidv4();
    server.log.info(`[${orderId}] WebSocket connection established. Order created.`);

    ws.send(JSON.stringify({
        orderId,
        status: 'accepted',
        message: 'Order accepted and connection established.'
    }));

    const statuses = [
        { status: 'pending', message: 'Order received and queued.' },
        { status: 'routing', message: 'Comparing DEX prices...' },
        { status: 'building', message: 'Creating transaction...' },
        { status: 'submitted', message: 'Transaction sent to network.' },
        { status: 'confirmed', message: 'Transaction successful.' },
    ];

    let delay = 2000;
    for (const s of statuses) {
        setTimeout(() => {
            if (ws.readyState === WebSocket.OPEN) {
                const payload = { orderId, status: s.status, message: s.message };
                if (s.status === 'confirmed') {
                    (payload as any).txHash = `mock_tx_${Date.now()}`;
                }
                ws.send(JSON.stringify(payload));
            }
        }, delay);
        delay += 2000;
    }

    setTimeout(() => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.close();
        }
    }, delay);

    ws.on('close', () => {
        server.log.info(`[${orderId}] Client disconnected.`);
    });
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