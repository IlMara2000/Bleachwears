import type { Metadata, Viewport } from "next";
import "./globals.css";

const title = "Bleachwears — Indossa la reazione";
const description =
  "Streetwear personalizzato a mano con candeggina. Scopri i drop, trova Bleachwears online o crea la tua t-shirt e felpa nel Custom Lab.";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://bleachwears.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title,
  description,
  applicationName: "Bleachwears",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.png", type: "image/png", sizes: "64x64" },
      { url: "/icon-192.png", type: "image/png", sizes: "192x192" },
    ],
    apple: [{ url: "/apple-touch-icon.png", type: "image/png", sizes: "180x180" }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Bleachwears",
  },
  openGraph: {
    title,
    description,
    type: "website",
    locale: "it_IT",
    siteName: "Bleachwears",
    url: "/",
    images: [{ url: "/og.png", width: 1536, height: 1024, alt: "Bleachwears — Indossa la reazione" }],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: ["/og.png"],
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  themeColor: "#e73423",
  colorScheme: "light",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="it">
      <body>{children}</body>
    </html>
  );
}
