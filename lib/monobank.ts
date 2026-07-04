const CACHE_KEY = 'monobank_rates_v2'
const CACHE_TTL = 60 * 60 * 1000 // 1hr

interface RateCache {
  uahToEur: number
  usdToEur: number
  fetchedAt: number
}

export async function getRates(): Promise<{ uahToEur: number; usdToEur: number }> {
  if (typeof window !== 'undefined') {
    const cached = localStorage.getItem(CACHE_KEY)
    if (cached) {
      const data: RateCache = JSON.parse(cached)
      if (Date.now() - data.fetchedAt < CACHE_TTL) {
        return { uahToEur: data.uahToEur, usdToEur: data.usdToEur }
      }
    }
  }

  try {
    const res = await fetch('https://api.monobank.ua/bank/currency')
    const rates = await res.json()
    const eurUah = rates.find((r: { currencyCodeA: number; currencyCodeB: number; rateSell?: number; rateBuy?: number; rateCross?: number }) => r.currencyCodeA === 978 && r.currencyCodeB === 980)
    const usdUah = rates.find((r: { currencyCodeA: number; currencyCodeB: number; rateSell?: number; rateBuy?: number; rateCross?: number }) => r.currencyCodeA === 840 && r.currencyCodeB === 980)

    const eurRate = eurUah?.rateSell ?? eurUah?.rateCross ?? 44
    const usdRate = usdUah?.rateSell ?? usdUah?.rateCross ?? 41

    const uahToEur = 1 / eurRate
    const usdToEur = usdRate / eurRate

    const result = { uahToEur, usdToEur, fetchedAt: Date.now() }
    if (typeof window !== 'undefined') {
      localStorage.setItem(CACHE_KEY, JSON.stringify(result))
    }
    return { uahToEur, usdToEur }
  } catch {
    return { uahToEur: 0.024, usdToEur: 0.92 }
  }
}

export function toEurFromRates(amount: number, currency: string, rates: { uahToEur: number; usdToEur: number }): number {
  if (currency === 'UAH') return amount * rates.uahToEur
  if (currency === 'USD') return amount * rates.usdToEur
  return amount
}

export function formatMoney(amount: number, currency: string): string {
  const symbols: Record<string, string> = { EUR: '€', UAH: '₴', USD: '$' }
  const sym = symbols[currency] ?? currency
  return `${sym}${Math.abs(amount).toFixed(2)}`
}
