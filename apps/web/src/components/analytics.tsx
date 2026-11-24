import Script from "next/script";

/** GA4 o'lchov ID formati: faqat shu ko'rinishdagi qiymat skriptga qo'yiladi (injection oldini oladi). */
/** Botir AI GA4 o'lchov ID (ommaviy, sir emas). Env bilan almashtirish mumkin. */
export const DEFAULT_GA_ID = "G-4SKHJLBD37";

const GA_ID_PATTERN = /^G-[A-Z0-9]{4,20}$/;

/**
 * Google Analytics 4. `NEXT_PUBLIC_GA_ID` bo'lmasa yoki noto'g'ri formatda bo'lsa hech narsa yuklanmaydi.
 * `afterInteractive`: kritik yo'ldan tashqarida. Loyihada cookie banner yo'q, shuning uchun IP anonimlashtiriladi.
 */
export function Analytics() {
  const id = process.env.NEXT_PUBLIC_GA_ID || DEFAULT_GA_ID;
  if (!id || !GA_ID_PATTERN.test(id)) return null;
  return (
    <>
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${id}`} strategy="afterInteractive" />
      <Script id="ga4-init" strategy="afterInteractive">
        {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${id}',{anonymize_ip:true});`}
      </Script>
    </>
  );
}
