import { Suspense } from "react";
import type { Metadata } from "next";
import { Manrope, Unbounded } from "next/font/google";
import "./globals.css";
import { BottomNav, SiteHeader } from "@/components/site-nav";

const sans = Manrope({ variable: "--font-sans-ui", subsets: ["latin", "latin-ext", "cyrillic"], display: "swap" });
const display = Unbounded({ variable: "--font-display-ui", subsets: ["latin", "latin-ext", "cyrillic"], weight: ["500", "600", "700"], display: "swap" });

export const metadata: Metadata = {
  title: "Botir AI: agent agent bilan gaplashadi",
  description:
    "Har bir biznesga o'zbekcha gaplashadigan AI sotuvchi, har bir odamga o'zi muzokara qiladigan shaxsiy agent.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="uz" className={`${sans.variable} ${display.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col pb-16 sm:pb-0">
        <Suspense fallback={<div className="h-14" />}>
          <SiteHeader />
        </Suspense>
        <main className="flex-1">{children}</main>
        <Suspense fallback={null}>
          <BottomNav />
        </Suspense>
      </body>
    </html>
  );
}
