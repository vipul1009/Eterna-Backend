# Eterna - High-Performance Order Execution Engine

This project is a robust, scalable, and real-time order execution engine built as a backend engineering task for Eterna. It processes user swap requests by finding the best price across multiple Decentralized Exchanges (DEXs) and provides live status updates via WebSockets.

The architecture is built using modern, production-grade technologies including Node.js, TypeScript, Docker, Redis, BullMQ, and PostgreSQL, focusing on scalability, resilience, and maintainability.

## Table of Contents

- [Features](#features)
- [System Architecture](#system-architecture)
- [Tech Stack](#tech-stack)
- [Core Design Decisions](#core-design-decisions)
  - [Why Market Order?](#why-market-order)
  - [Extending to Limit and Sniper Orders](#extending-to-limit-and-sniper-orders)
  - [API Design: POST vs. GET and WebSocket Handshake](#api-design-post-vs-get-and-websocket-handshake)
- [How It Works - The Order Lifecycle](#how-it-works---the-order-lifecycle)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Setup](#setup)
  - [Running the Application](#running-the-application)
- [How to Test](#how-to-test)
- [Database Schema](#database-schema)
- [Project Structure](#project-structure)

## Features

- **Real-time Order Updates**: Uses WebSockets to stream the live status of an order from accepted to confirmed or failed.
- **DEX Routing (Mocked)**: Intelligently compares prices between simulated Raydium and Meteora pools to select the best execution venue.
- **Concurrent Processing**: Built on a robust queue system (BullMQ) capable of processing up to 10 orders concurrently.
- **Resilient and Scalable**: Employs a producer/worker pattern with Redis, ensuring the API can handle high request volumes while orders are processed reliably in the background.
- **Automatic Retries**: Failed jobs are automatically retried up to 3 times with exponential backoff for resilience against temporary network or service failures.
- **Persistent Order History**: All final order states (both confirmed and failed) are saved to a PostgreSQL database for historical analysis and auditing.
- **Fully Containerized**: The entire application and its dependencies (Postgres, Redis) are managed with Docker for a consistent and easy-to-set-up development environment.

## System Architecture

The application is designed as a distributed system with a clear separation of concerns, ensuring high scalability and fault tolerance.

- **API Server (server.ts)**: The "front door" of the system. It is a lightweight Fastify server responsible for handling incoming WebSocket connections. When a user connects, it validates the request, generates a unique orderId, and immediately adds a job to the BullMQ queue. It then subscribes to Redis Pub/Sub to listen for status updates for that specific order.

- **Redis**: The central nervous system of the architecture.
  - **BullMQ**: Uses Redis as a message broker to manage the queue of pending orders.
  - **Pub/Sub**: Used as a real-time communication channel between the Worker and the API Server.

- **Worker (worker.ts)**: The "engine" of the system. It is a completely separate process that listens for jobs from the BullMQ queue. When it receives a job, it executes the entire order lifecycle: fetching quotes, comparing prices, and executing the swap. As it completes each step, it publishes a status update to a Redis channel.

- **PostgreSQL Database**: The system's long-term memory. The worker connects to the database to save the final, permanent record of every completed or failed order.

*(Self-promotion: You can use a tool like Excalidraw or draw.io to create a simple diagram of the API -> Redis -> Worker flow and link it here for extra credit.)*

## Tech Stack

- **Backend**: Node.js, TypeScript
- **Framework**: Fastify
- **WebSockets**: ws (The most popular and robust WebSocket library for Node.js)
- **Database**: PostgreSQL
- **ORM**: Prisma (for type-safe database access and migrations)
- **Queueing**: BullMQ
- **In-Memory Store**: Redis (for queueing and Pub/Sub)
- **Containerization**: Docker & Docker Compose

## Core Design Decisions

### Why Market Order?

For this project, I chose to implement the **Market Order** type. The primary reason is that the specified order execution flow—which includes immediate DEX routing, price comparison, and transaction settlement—is the exact definition of a market order. This choice allowed me to focus on building the core DEX routing and concurrent processing engine, which are the central challenges of the problem statement.

A market order serves as the fundamental execution primitive upon which more complex order types can be built.

### Extending to Limit and Sniper Orders

The current architecture is designed to be easily extensible. Here's how the other order types could be integrated:

**Limit Orders**: A limit order executes when a target price is met.
- **Integration**: A new `POST /api/orders/limit` endpoint would be created. Instead of adding a job to the main execution queue, it would save the order details (e.g., `targetPrice`) to a "pending_limit_orders" table in the database.
- A new, separate "Price Watcher" worker process would be created. This worker would periodically poll price data (e.g., from an oracle like Pyth). When the market price meets an order's target price, this worker would then add a job to our existing orders queue, triggering the market order execution engine we've already built.

**Sniper Orders**: A sniper order executes on a specific event, like a new token launch or liquidity addition.
- **Integration**: This would be similar to a limit order. A "Chain Watcher" worker would be created. Instead of polling for prices, it would subscribe to on-chain events (e.g., new liquidity pool creation events on Raydium). When a target event is detected, it would trigger our existing market order execution engine.

### API Design: POST vs. GET and WebSocket Handshake

The project document specified a POST request that upgrades to a WebSocket. The standard WebSocket handshake protocol (RFC 6455) is designed to work exclusively with an HTTP GET request. Forcing a POST to upgrade is non-standard and not supported by most libraries, including `@fastify/websocket`, which led to initial implementation challenges.

To resolve this while adhering to the standard, I made the following design choice:

- The client initiates the connection via a **GET request** to `/api/orders/execute`. This allows for a clean, standard WebSocket handshake.
- Order parameters (`inputToken`, `outputToken`, `amount`) are passed as URL query parameters, which is a common and effective pattern for this type of connection.

This approach provides a robust, reliable WebSocket connection while still logically representing the "submission" of a new order. For a more RESTful API, a two-endpoint approach (POST `/orders` to create and GET `/orders/:id/ws` to subscribe) was considered and is a viable alternative for future versions. I also opted to use the `ws` library directly for handling the WebSocket server, as it provided more direct control and bypassed issues encountered with the Fastify plugin wrapper.

## How It Works - The Order Lifecycle

1. **Connection**: The user connects to `ws://<your-url>/api/orders/execute?inputToken=SOL&outputToken=USDC&amount=1.5`.

2. **Job Creation**: The API server validates the query parameters, generates a unique `orderId`, and adds a job with the order details to the BullMQ queue. It immediately sends an `accepted` status to the client.

3. **Worker Processing**: A worker process, running independently, picks up the job from the queue.

4. **Routing**: The worker calls the mock DEX router, which simulates fetching quotes from Raydium and Meteora. It compares the quotes and selects the one with the best output amount. The `routing` status is published.

5. **Building & Submitted**: The worker simulates building the transaction and sending it to the network, publishing `building` and `submitted` statuses along the way.

6. **Confirmed / Failed**:
   - If all steps succeed, the worker publishes a `confirmed` status, including the final transaction hash.
   - If any step fails, and all retries are exhausted, the worker publishes a `failed` status with the error reason.

7. **Database Persistence**: On the final `confirmed` or `failed` event, the worker writes a complete historical record of the order to the PostgreSQL database.

8. **Real-time Updates**: Throughout this process, the API server, subscribed to Redis, receives every status update from the worker and forwards it instantly to the correct client's WebSocket connection.

## Getting Started

### Prerequisites

- Docker and Docker Compose
- Node.js (v18+)
- A WebSocket testing client like Postman

### Setup

1. **Clone the repository:**
```bash
git clone <your-repo-url>
cd <your-repo-name>
```

2. **Create the environment file:**

Copy the example environment file to create your local configuration.
```bash
cp .env.example .env
```

*(Note: The default values in the .env file are already configured for the Docker setup and do not need to be changed for local development.)*

3. **Install dependencies:**
```bash
npm install
```

### Running the Application

The entire application stack (API Server, Worker, PostgreSQL, Redis) is managed by Docker Compose.

1. **Build and run the containers:**
```bash
docker-compose up --build
```

2. **Run the database migration:**

In a separate terminal, run the Prisma command to create the Order table in your database.
```bash
npx prisma migrate dev
```

The application is now running. The API server is available at `http://localhost:3000`.

## How to Test

1. Open your WebSocket client (e.g., Postman).
2. Create a new WebSocket request (not a standard HTTP request).
3. Enter the URL, including the query parameters for the trade you want to simulate:
```
ws://localhost:3000/api/orders/execute?inputToken=SOL&outputToken=USDC&amount=2
```

4. Click **Connect**.
5. You will see a live stream of JSON messages representing the order's status, from `accepted` to `confirmed`.

To test concurrent processing, open 3-5 tabs in Postman and connect them all in quick succession. You will see the logs from the worker processing all orders in parallel.

## Database Schema

The historical order data is stored in an `Order` table, defined by the following Prisma schema:
```prisma
model Order {
  id        String   @id @default(uuid())
  createdAt DateTime @default(now())
  status    OrderStatus // CONFIRMED or FAILED

  // Request Data
  inputToken  String
  outputToken String
  inputAmount Float

  // Result Data
  chosenDex       String?
  executedPrice   Float?
  finalOutput     Float?
  transactionHash String? @unique

  // Failure Data
  failReason String?
}
```

## Project Structure
```
.
├── docker-compose.yml   # Defines all application services
├── Dockerfile           # Blueprint for the Node.js application image
├── prisma/              # Prisma configuration and migrations
│   └── schema.prisma    # The database schema definition
├── src/
│   ├── dex/             # Contains DEX routing logic
│   │   └── mockDexRouter.ts
│   ├── db.ts            # Prisma client instance
│   ├── redis.ts         # Redis connection and BullMQ setup
│   ├── server.ts        # The API server (Fastify, WebSocket handling, job producer)
│   └── worker.ts        # The background worker (job consumer, order processing logic)
├── .env                 # Local environment variables
└── package.json         # Project dependencies and scripts
```
