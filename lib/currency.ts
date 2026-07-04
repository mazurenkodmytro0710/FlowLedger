let cachedRates: Record<string, number> = {};
let cacheTime = 0;

export async function getEurRates(): Promise<Record<string, number>> {
  if (Date.now() - cacheTime < 3600000 && Object.keys(cachedRates).length > 0) {
    return cachedRates;
  }
  try {
    const res = await fetch("https://api.monobank.ua/bank/currency");
    const data = await res.json();
    const eurUah = data.find((r: { currencyCodeA: number; currencyCodeB: number; rateSell?: number; rateCross?: number }) => r.currencyCodeA === 978 && r.currencyCodeB === 980);
    const usdUah = data.find((r: { currencyCodeA: number; currencyCodeB: number; rateSell?: number; rateCross?: number }) => r.currencyCodeA === 840 && r.currencyCodeB === 980);
    if (eurUah) cachedRates["UAH"] = 1 / (eurUah.rateSell ?? eurUah.rateCross);
    if (usdUah && eurUah) cachedRates["USD"] = (usdUah.rateSell ?? usdUah.rateCross) / (eurUah.rateSell ?? eurUah.rateCross);
    cachedRates["EUR"] = 1;
    cacheTime = Date.now();
  } catch {
    cachedRates = { EUR: 1, UAH: 0.024, USD: 1.08 };
  }
  return cachedRates;
}

export function toEur(amount: number, currency: string, rates: Record<string, number>): number {
  return amount * (rates[currency] ?? 1);
}

export function formatMoney(amount: number, currency: string): string {
  const symbols: Record<string, string> = { EUR: "€", UAH: "₴", USD: "$" };
  const sym = symbols[currency] ?? currency;
  return `${sym}${Math.abs(amount).toFixed(2)}`;
}
