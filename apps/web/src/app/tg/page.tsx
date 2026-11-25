import { Suspense } from "react";
import type { Metadata } from "next";
import { TgEntry } from "./tg-entry";

export const metadata: Metadata = { title: "Life Assistant", robots: { index: false, follow: false } };

export default function TgPage() {
  return (
    <Suspense fallback={null}>
      <TgEntry />
    </Suspense>
  );
}
