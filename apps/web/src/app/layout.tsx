import { Suspense } from "react";
import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { ChatLauncher } from "@/components/chat-launcher";
import { BottomNav, SiteHeader } from "@/components/site-nav";

// Shriftlar lokal (public emas, src/app/fonts): Manrope (UI) va Unbounded (sarlavhalar), Google Fonts SIL OFL. Offline build ishlaydi.
const sans = localFont({ src: "./fonts/Manrope-latin.woff2", variable: "--font-sans-ui", weight: "200 800", display: "swap" });
const display = localFont({ src: "./fonts/Unbounded-latin.woff2", variable: "--font-display-ui", weight: "300 900", display: "swap" });

export const metadata: Metadata = {
  title: "Botir AI: agent agent bilan gaplashadi",
  description:
    "Har bir biznesga o'zbekcha gaplashadigan AI sotuvchi, har bir odamga o'zi muzokara qiladigan shaxsiy agent.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="uz" data-scroll-behavior="smooth" className={`${sans.variable} ${display.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col pb-16 sm:pb-0">
        <Suspense fallback={<div className="h-14" />}>
          <SiteHeader />
        </Suspense>
        <main className="flex-1">{children}</main>
        <Suspense fallback={null}>
          <BottomNav />
          <ChatLauncher />
        </Suspense>
      </body>
    </html>
  );
}
