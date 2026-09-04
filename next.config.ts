import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          {
            key: "Content-Type",
            value: "application/javascript; charset=utf-8",
          },
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
          {
            key: "Content-Security-Policy",
            value: "default-src 'self'; script-src 'self'",
          },
          {
            key: "Service-Worker-Allowed",
            value: "/",
          },
        ],
      },
    ];
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "5mb",
    },
    /**
     * O App Router deixou de reutilizar segmentos dinâmicos por padrão no
     * Next 15. Como todas as telas autenticadas são dinâmicas, voltar para uma
     * página recém-visitada fazia outra renderização e novas idas ao Supabase.
     *
     * Trinta segundos cobrem a navegação de trabalho (lista -> ficha -> lista)
     * sem transformar dados operacionais em cache de longa duração. Server
     * Actions continuam invalidando as rotas com revalidatePath.
     */
    staleTimes: {
      dynamic: 30,
    },
  },
};

export default nextConfig;
