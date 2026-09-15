-- CreateEnum
CREATE TYPE "Side" AS ENUM ('BUY', 'SELL');

-- CreateTable
CREATE TABLE "Balance" (
    "currency" TEXT NOT NULL,
    "amount" DECIMAL(28,10) NOT NULL,

    CONSTRAINT "Balance_pkey" PRIMARY KEY ("currency")
);

-- CreateTable
CREATE TABLE "Quote" (
    "id" TEXT NOT NULL,
    "baseCurrency" TEXT NOT NULL,
    "quoteCurrency" TEXT NOT NULL,
    "side" "Side" NOT NULL,
    "amount" DECIMAL(28,10) NOT NULL,
    "midPrice" DECIMAL(28,10) NOT NULL,
    "rate" DECIMAL(28,10) NOT NULL,
    "consumed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Quote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Trade" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "baseCurrency" TEXT NOT NULL,
    "quoteCurrency" TEXT NOT NULL,
    "side" "Side" NOT NULL,
    "amount" DECIMAL(28,10) NOT NULL,
    "rate" DECIMAL(28,10) NOT NULL,
    "commission" DECIMAL(28,10) NOT NULL,
    "executedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Trade_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Trade_quoteId_key" ON "Trade"("quoteId");

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
