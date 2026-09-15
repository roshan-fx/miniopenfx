import { ValidationError, UpstreamError } from "../errors.js";

export const SUPPORTED_CURRENCIES = ["BTC", "ETH", "SOL"] as const;
export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

const BINANCE_SYMBOLS: Record<SupportedCurrency, string> = {
  BTC: "BTCUSDT",
  ETH: "ETHUSDT",
  SOL: "SOLUSDT",
};

export function isSupportedCurrency(value: string): value is SupportedCurrency {
  return (SUPPORTED_CURRENCIES as readonly string[]).includes(value);
}

export function parsePairToCurrency(pair: string): SupportedCurrency {
  const currency = pair.replace(/USD$/, "");
  if (!isSupportedCurrency(currency)) {
    throw new ValidationError(`Unsupported pair: ${pair}`);
  }
  return currency;
}

export interface PriceProvider {
  getMidPrice(baseCurrency: string): Promise<number>;
}

export class BinancePriceProvider implements PriceProvider {
  async getMidPrice(baseCurrency: string): Promise<number> {
    if (!isSupportedCurrency(baseCurrency)) {
      throw new ValidationError(`Unsupported currency: ${baseCurrency}`);
    }
    const symbol = BINANCE_SYMBOLS[baseCurrency];
    let res: Response;
    try {
      // data-api.binance.vision is Binance's public, read-only market-data
      // mirror. api.binance.com geo-blocks some hosting regions (returns
      // 451) even for public price data; this endpoint doesn't.
      res = await fetch(
        `https://data-api.binance.vision/api/v3/ticker/price?symbol=${symbol}`,
      );
    } catch {
      throw new UpstreamError("Failed to reach Binance");
    }
    if (!res.ok) {
      throw new UpstreamError(`Binance request failed: ${res.status}`);
    }
    const data = (await res.json()) as { price: string };
    return Number(data.price);
  }
}
