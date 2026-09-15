// Minimal placeholder for Task 1 — expanded into the real Binance-backed
// implementation in Task 2.
export interface PriceProvider {
  getMidPrice(baseCurrency: string): Promise<number>;
}

export class BinancePriceProvider implements PriceProvider {
  async getMidPrice(_baseCurrency: string): Promise<number> {
    throw new Error("not implemented until Task 2");
  }
}
