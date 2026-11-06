import type { Metadata, Viewport } from "next";
import { Big_Shoulders } from "next/font/google";
import "./globals.css";

const displayFont = Big_Shoulders({
  subsets: ["latin"],
  weight: "variable",
  variable: "--font-display-loaded",
  display: "swap",
  fallback: ["Arial Narrow", "Impact", "sans-serif"],
});

const title = "Bleachwears — Custom streetwear";
const description =
  "Drop artigianali e capi personalizzati con candeggina. Scegli una base, un segno e crea il tuo pezzo nel Custom Lab.";

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
    statusBarStyle: "default",
    title: "Bleachwears",
  },
  openGraph: {
    title,
    description,
    type: "website",
    locale: "it_IT",
    siteName: "Bleachwears",
    url: "/",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Bleachwears — Custom streetwear" }],
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
  themeColor: "#171a1c",
  colorScheme: "light",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="it" className={displayFont.variable}>
      <body>{children}</body>
    </html>
  );
}
