"use client";

import { useState, useEffect } from "react";
import type { CurrencyRates } from "@/lib/types";

const CACHE_KEY = "t6x_currency_rates";
const CACHE_TTL = 3600 * 1000; // 1 hour

export function useCurrency() {
  const [rates, setRates] = useState<CurrencyRates | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached) as CurrencyRates & { _ts: number };
      if (Date.now() - parsed._ts < CACHE_TTL) {
        setRates(parsed);
        setLoading(false);
        return;
      }
    }
    fetchRates();
  }, []);

  async function fetchRates() {
    try {
      const res = await fetch("/api/currency");
      if (!res.ok) throw new Error("fetch failed");
      const data = (await res.json()) as CurrencyRates;
      const toCache = { ...data, _ts: Date.now() };
      localStorage.setItem(CACHE_KEY, JSON.stringify(toCache));
      setRates(data);
    } catch {
      // fallback rates
      setRates({ eurUah: 45, usdUah: 42, usdEur: 0.93, updatedAt: "" });
    } finally {
      setLoading(false);
    }
  }

  function toEur(amount: number, currency: string): number {
    if (!rates) return amount;
    if (currency === "EUR") return amount;
    if (currency === "UAH") return amount / rates.eurUah;
    if (currency === "USD") return amount * rates.usdEur;
    return amount;
  }

  return { rates, loading, toEur };
}
