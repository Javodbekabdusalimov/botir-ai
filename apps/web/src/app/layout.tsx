import { Suspense } from "react";
import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { ChatLauncher } from "@/components/chat-launcher";
import { BottomNav, SiteHeader } from "@/components/site-nav";
import { Analytics } from "@/components/analytics";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/seo";

// Shriftlar lokal (src/app/fonts): Inter (matn) + Instrument Serif (sarlavhalar, kursiv urg'u), Google Fonts SIL OFL. Offline build ishlaydi.
const sans = localFont({ src: "./fonts/Inter-latin.woff2", variable: "--font-sans-ui", weight: "300 800", display: "swap" });
const display = localFont({
  src: [
    { path: "./fonts/InstrumentSerif-Regular.woff2", weight: "400", style: "normal" },
    { path: "./fonts/InstrumentSerif-Italic.woff2", weight: "400", style: "italic" },
  ],
  variable: "--font-display-ui",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: `${SITE_NAME}: agent agent bilan gaplashadi`, template: `%s — ${SITE_NAME}` },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  openGraph: { type: "website", locale: "uz_UZ", siteName: SITE_NAME, url: SITE_URL, title: `${SITE_NAME}: agent agent bilan gaplashadi`, description: SITE_DESCRIPTION, images: ["/opengraph-image"] },
  twitter: { card: "summary_large_image", title: `${SITE_NAME}: agent agent bilan gaplashadi`, description: SITE_DESCRIPTION, images: ["/opengraph-image"] },
  // Search Console: asosiy tasdiq public/google84cc5b4f86d33aff.html fayli; env bo'lsa meta-teg ham qo'shiladi.
  ...(process.env.NEXT_PUBLIC_GSC_VERIFICATION ? { verification: { google: process.env.NEXT_PUBLIC_GSC_VERIFICATION } } : {}),
  manifest: "/manifest.webmanifest",
  keywords: ["Life Assistant", "AI sotuvchi", "Telegram AI bot", "AI agent O'zbekiston", "o'zbekcha AI yordamchi", "avtomatik savdo", "agent muzokara"],
  category: "business",
  formatDetection: { telephone: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="uz" data-scroll-behavior="smooth" className={`${sans.variable} ${display.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col pb-16 sm:pb-0">
        <Suspense fallback={<div className="h-14" />}>
          <SiteHeader />
        </Suspense>
        <main className="flex-1">{children}</main>
        <Analytics />
        <Suspense fallback={null}>
          <BottomNav />
          <ChatLauncher />
        </Suspense>
      </body>
    </html>
  );
}
