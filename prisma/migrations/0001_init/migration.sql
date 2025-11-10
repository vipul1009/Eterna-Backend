-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('CONFIRMED', 'FAILED');

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "status" "OrderStatus" NOT NULL,
    "inputToken" TEXT NOT NULL,
    "outputToken" TEXT NOT NULL,
    "inputAmount" DOUBLE PRECISION NOT NULL,
    "chosenDex" TEXT,
    "executedPrice" DOUBLE PRECISION,
    "finalOutput" DOUBLE PRECISION,
    "transactionHash" TEXT,
    "failReason" TEXT,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Order_transactionHash_key" ON "Order"("transactionHash");

