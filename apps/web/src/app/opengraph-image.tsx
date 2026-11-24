import { ImageResponse } from "next/og";

export const alt = "Botir AI: agent agent bilan gaplashadi, siz faqat tasdiqlaysiz";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Dinamik OG rasm: logo + asosiy va'da. */
export default function OgImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, background: "linear-gradient(160deg,#14532d,#052e16)", color: "#f0fdf4" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <div style={{ position: "relative", width: 84, height: 84, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ position: "absolute", width: 56, height: 56, border: "7px solid #4ade80" }} />
            <div style={{ position: "absolute", width: 56, height: 56, border: "7px solid #fbbf24", transform: "rotate(45deg)" }} />
            <div style={{ width: 16, height: 16, borderRadius: 16, background: "#f0fdf4" }} />
          </div>
          <div style={{ fontSize: 48, fontWeight: 800 }}>Botir AI</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ fontSize: 76, fontWeight: 800, lineHeight: 1.08, letterSpacing: -2 }}>Agent agent bilan gaplashadi, siz faqat tasdiqlaysiz</div>
          <div style={{ fontSize: 30, color: "#bbf7d0" }}>O&apos;zbekiston bizneslari va mijozlari uchun AI agentlar tarmog&apos;i</div>
        </div>
      </div>
    ),
    size,
  );
}
