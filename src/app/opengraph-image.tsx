import { ImageResponse } from "next/og";

/** The card that appears when a Deckwatch link is pasted into WhatsApp, X or
 * Slack. Generated rather than committed as a PNG so it stays in step with
 * the palette, and drawn with plain divs and system fonts because Satori
 * supports a subset of CSS and no external font is fetched at render time. */

export const alt = "Deckwatch Kenya — live public safety intelligence";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          background: "#05070a",
          padding: "80px",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <div
            style={{
              width: "18px",
              height: "18px",
              borderRadius: "999px",
              background: "#22c55e",
            }}
          />
          <div
            style={{
              color: "#22c55e",
              fontSize: "26px",
              fontWeight: 700,
              letterSpacing: "0.18em",
            }}
          >
            DECKWATCH KENYA
          </div>
        </div>

        <div
          style={{
            color: "#e7ebf1",
            fontSize: "72px",
            fontWeight: 700,
            lineHeight: 1.12,
            marginTop: "28px",
          }}
        >
          Public safety intelligence
        </div>

        <div
          style={{
            color: "#8993a4",
            fontSize: "32px",
            lineHeight: 1.4,
            marginTop: "24px",
          }}
        >
          Live incident map, verification scoring and county risk — ingested
          from 13 Kenyan newsrooms.
        </div>

        <div style={{ display: "flex", gap: "12px", marginTop: "44px" }}>
          {[
            ["#ef4444", "Critical"],
            ["#f97316", "High"],
            ["#eab308", "Medium"],
            ["#22c55e", "Low"],
          ].map(([color, label]) => (
            <div
              key={label}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                border: "1px solid #1c2330",
                background: "#0b0f16",
                borderRadius: "999px",
                padding: "10px 22px",
                color: "#8993a4",
                fontSize: "24px",
              }}
            >
              <div
                style={{
                  width: "12px",
                  height: "12px",
                  borderRadius: "999px",
                  background: color,
                }}
              />
              {label}
            </div>
          ))}
        </div>
      </div>
    ),
    size
  );
}
