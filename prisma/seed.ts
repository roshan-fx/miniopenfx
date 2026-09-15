import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const seedBalances = [
    { currency: "USD", amount: 10000 },
    { currency: "BTC", amount: 0 },
    { currency: "ETH", amount: 0 },
    { currency: "SOL", amount: 0 },
  ];

  for (const balance of seedBalances) {
    await prisma.balance.upsert({
      where: { currency: balance.currency },
      create: balance,
      update: {},
    });
  }

  console.log("Seeded balances:", await prisma.balance.findMany());
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
