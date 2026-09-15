import { beforeEach, afterAll } from "vitest";
import { prisma } from "../src/db.js";

beforeEach(async () => {
  await prisma.$executeRawUnsafe(
    'TRUNCATE "Trade", "Quote", "Balance" RESTART IDENTITY CASCADE',
  );
  await prisma.balance.createMany({
    data: [
      { currency: "USD", amount: 10000 },
      { currency: "BTC", amount: 0 },
      { currency: "ETH", amount: 0 },
      { currency: "SOL", amount: 0 },
    ],
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
