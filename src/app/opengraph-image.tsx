import { ImageResponse } from "next/og";

export const alt = "CotaPro — operação inteligente do pedido ao recebimento";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background: "#0b0d12",
        color: "#f0f1f4",
        padding: "64px 72px",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
        <svg width="52" height="52" viewBox="0 0 32 32">
          <rect width="32" height="32" rx="9" fill="#6366f1" />
          <path
            d="M20.6 9.9a7.6 7.6 0 1 0 0 12.2"
            fill="none"
            stroke="white"
            strokeWidth="3.1"
            strokeLinecap="round"
          />
          <path
            d="m19.2 16.1 2.15 2.15 4.1-4.65"
            fill="none"
            stroke="white"
            strokeWidth="2.35"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <div
          style={{
            display: "flex",
            fontSize: 34,
            fontWeight: 700,
            letterSpacing: "-1.2px",
          }}
        >
          Cota<span style={{ color: "#818cf8" }}>Pro</span>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", maxWidth: 900 }}>
        <div
          style={{
            color: "#818cf8",
            fontSize: 18,
            fontWeight: 700,
            letterSpacing: "2.5px",
            textTransform: "uppercase",
          }}
        >
          Operação de compras conectada
        </div>
        <div
          style={{
            marginTop: 22,
            fontSize: 62,
            lineHeight: 1.08,
            fontWeight: 700,
            letterSpacing: "-2.5px",
          }}
        >
          Compre com clareza. Negocie com histórico.
        </div>
        <div
          style={{
            marginTop: 24,
            color: "#a8abb6",
            fontSize: 24,
            lineHeight: 1.4,
          }}
        >
          Da demanda à conferência da NF-e, toda decisão no mesmo fluxo.
        </div>
      </div>

      <div style={{ display: "flex", gap: 12 }}>
        {["Cotações", "Pedidos", "NF-e", "Histórico de preços"].map((item) => (
          <div
            key={item}
            style={{
              display: "flex",
              border: "1px solid #292e3a",
              borderRadius: 999,
              padding: "10px 16px",
              color: "#a8abb6",
              fontSize: 16,
            }}
          >
            {item}
          </div>
        ))}
      </div>
    </div>,
    size,
  );
}
