import type { PriceProvider } from "../../src/services/priceProvider.js";

export class FakePriceProvider implements PriceProvider {
  constructor(private prices: Record<string, number>) {}

  async getMidPrice(baseCurrency: string): Promise<number> {
    const price = this.prices[baseCurrency];
    if (price === undefined) {
      throw new Error(`No fake price configured for ${baseCurrency}`);
    }
    return price;
  }
}
