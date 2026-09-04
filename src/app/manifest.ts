import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "CotaPro — Compras inteligentes",
    short_name: "CotaPro",
    description:
      "Gestão do ciclo de compras, da cotação à conferência do recebimento.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: "#f6f6f7",
    theme_color: "#4f46e5",
    lang: "pt-BR",
    dir: "ltr",
    categories: ["business", "productivity", "finance"],
    icons: [
      {
        src: "/pwa/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/pwa/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/pwa/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: "Central operacional",
        short_name: "Central",
        url: "/dashboard",
        icons: [{ src: "/pwa/icon-192.png", sizes: "192x192" }],
      },
      {
        name: "Pedidos",
        short_name: "Pedidos",
        url: "/pedidos",
        icons: [{ src: "/pwa/icon-192.png", sizes: "192x192" }],
      },
      {
        name: "Recebimentos",
        short_name: "Recebimentos",
        url: "/recebimentos",
        icons: [{ src: "/pwa/icon-192.png", sizes: "192x192" }],
      },
    ],
  };
}
