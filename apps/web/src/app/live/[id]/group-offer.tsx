"use client";

import { useState } from "react";
import { OfferCard } from "@/components/negotiation";
import { confirmNegotiation } from "@/lib/api";
import { friendlyError } from "@/lib/friendly-error";
import type { BestOffer, ConfirmResult } from "@/lib/types";

/** Tasdiq xatosida doim aytiladi: pul yechilmagan. */
export const CONFIRM_FAILED = "Buyurtma yaratilmadi, pul yechilmadi.";

/** Takliflarni vazifa (biznes kategoriyasi) bo'yicha guruhlaydi: moy suv bilan solishtirilmaydi. */
export function groupOffers(best: Record<string, BestOffer>, categoryOf: (id: string) => string): BestOffer[][] {
  const groups = new Map<string, BestOffer[]>();
  for (const b of Object.values(best)) {
    const key = categoryOf(b.businessId);
    groups.set(key, [...(groups.get(key) ?? []), b]);
  }
  return [...groups.values()].map((g) => g.sort((a, b) => a.offer.price - b.offer.price));
}

/**
 * Bitta vazifa guruhi: o'z eng arzoni, o'z "Boshqasi" va o'z "Tasdiqlayman".
 * Tasdiqdan keyin boshqa guruhlar yashirilmaydi (har guruhning natijasi alohida).
 */
export function GroupOffer({
  negotiationId,
  offers,
  ready,
  focusId,
}: {
  negotiationId: string;
  offers: BestOffer[];
  ready: boolean;
  focusId?: string | null;
}) {
  const [skip, setSkip] = useState(0);
  const [result, setResult] = useState<ConfirmResult | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const forced = focusId && skip === 0 ? offers.find((b) => b.businessId === focusId) : undefined;
  const current = forced ?? offers[skip % offers.length];
  if (!current) return null;

  async function onConfirm() {
    if (confirming) return;
    setConfirming(true);
    setError(null);
    try {
      setResult(await confirmNegotiation(negotiationId, current.businessId));
    } catch (e) {
      setError(`${CONFIRM_FAILED} ${friendlyError(e instanceof Error ? e.message : null)}`);
    } finally {
      setConfirming(false);
    }
  }

  return (
    <OfferCard
      key={ready ? "final" : "live"}
      focusConfirm={!!forced}
      best={current}
      ready={ready}
      confirming={confirming}
      result={result}
      error={error}
      onConfirm={onConfirm}
      onOther={() => setSkip((s) => s + 1)}
      othersLeft={!result && offers.length > 1}
    />
  );
}
