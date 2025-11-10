
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const generateMockTxHash = () => `mock_tx_${[...Array(64)].map(() => Math.floor(Math.random() * 16).toString(16)).join('')}`;

const BASE_PRICES: Record<string, number> = {
    'SOL-USDC': 150.50,
    'BTC-USDC': 70000.00,
    'ETH-USDC': 3500.00,
};

export class MockDexRouter {
    private getBasePrice(inputToken: string, outputToken: string): number {
        const pair = `${inputToken}-${outputToken}`;
        return BASE_PRICES[pair] || 100;
    }

    async getRaydiumQuote(inputToken: string, outputToken: string, amount: number) {
        await sleep(200);
        const basePrice = this.getBasePrice(inputToken, outputToken);
        const price = basePrice * (0.98 + Math.random() * 0.04);
        const estimatedOutput = amount * price;
        console.log(`[DEX] Raydium Quote: ${amount} ${inputToken} -> ${estimatedOutput.toFixed(2)} ${outputToken} @ ${price.toFixed(2)}`);
        return { price, estimatedOutput };
    }

    async getMeteoraQuote(inputToken: string, outputToken: string, amount: number) {
        await sleep(200);
        const basePrice = this.getBasePrice(inputToken, outputToken);
        const price = basePrice * (0.97 + Math.random() * 0.05);
        const estimatedOutput = amount * price;
        console.log(`[DEX] Meteora Quote: ${amount} ${inputToken} -> ${estimatedOutput.toFixed(2)} ${outputToken} @ ${price.toFixed(2)}`);
        return { price, estimatedOutput };
    }

    async findBestRoute(inputToken: string, outputToken: string, amount: number) {
        console.log(`[DEX] Finding best route for ${amount} ${inputToken} -> ${outputToken}...`);
        const [raydiumQuote, meteoraQuote] = await Promise.all([
            this.getRaydiumQuote(inputToken, outputToken, amount),
            this.getMeteoraQuote(inputToken, outputToken, amount)
        ]);

        if (raydiumQuote.estimatedOutput > meteoraQuote.estimatedOutput) {
            console.log(`[DEX] Best route found: Raydium (${raydiumQuote.estimatedOutput.toFixed(2)} ${outputToken})`);
            return { name: 'Raydium', quote: raydiumQuote };
        } else {
            console.log(`[DEX] Best route found: Meteora (${meteoraQuote.estimatedOutput.toFixed(2)} ${outputToken})`);
            return { name: 'Meteora', quote: meteoraQuote };
        }
    }

    async executeSwap(dex: string, amount: number) {
        console.log(`[DEX] Executing swap for ${amount} on ${dex}...`);
        await sleep(2000 + Math.random() * 1000);
        const txHash = generateMockTxHash();
        console.log(`[DEX] Swap executed. TxHash: ${txHash}`);
        return { txHash };
    }
}
