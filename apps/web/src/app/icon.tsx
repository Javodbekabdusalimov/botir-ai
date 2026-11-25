import { ImageResponse } from "next/og";

export const size = { width: 64, height: 64 };
export const contentType = "image/png";

/** Brauzer ikonkasi: Life Assistant belgisi (ikki burchak + markaz). */
export default function Icon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#f4f6f4", borderRadius: 14 }}>
        <div style={{ position: "absolute", width: 30, height: 30, border: "4px solid #444e47" }} />
        <div style={{ position: "absolute", width: 30, height: 30, border: "4px solid #b45309", transform: "rotate(45deg)" }} />
        <div style={{ width: 10, height: 10, borderRadius: 10, background: "#171717" }} />
      </div>
    ),
    size,
  );
}
