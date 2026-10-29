import type { Metadata, Viewport } from "next";
import { Geist_Mono, Inter } from "next/font/google";

import { ThemeProvider } from "@/components/providers/theme-provider";
import { PwaServiceWorker } from "@/components/providers/pwa-service-worker";
import { publicEnv } from "@/lib/env";

import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(publicEnv.NEXT_PUBLIC_APP_URL),
  title: {
    default: "CotaPro",
    template: "%s",
  },
  description:
    "Gestão do ciclo de compras, da demanda à conferência do recebimento.",
  applicationName: "CotaPro",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "CotaPro",
    statusBarStyle: "default",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f8fa" },
    { media: "(prefers-color-scheme: dark)", color: "#0f1218" },
  ],
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="pt-BR"
      suppressHydrationWarning
      className={`${inter.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <PwaServiceWorker />
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
