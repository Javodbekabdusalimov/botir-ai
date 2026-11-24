import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** iOS bosh ekran ikonkasi. */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#f0fdf4" }}>
        <div style={{ position: "absolute", width: 84, height: 84, border: "10px solid #15803d" }} />
        <div style={{ position: "absolute", width: 84, height: 84, border: "10px solid #b45309", transform: "rotate(45deg)" }} />
        <div style={{ width: 26, height: 26, borderRadius: 26, background: "#171717" }} />
      </div>
    ),
    size,
  );
}
