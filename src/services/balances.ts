import { prisma } from "../db.js";

export async function getBalances() {
  return prisma.balance.findMany({ orderBy: { currency: "asc" } });
}
