import type { Metadata } from "next";
import { Anton, Inter_Tight } from "next/font/google";
import { socialMetadata } from "@/lib/seo";

const display = Anton({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-anton",
  display: "swap",
});

const sans = Inter_Tight({
  subsets: ["latin"],
  variable: "--font-inter-tight",
  display: "swap",
});

const title = "STENCIL LAB — One image. One style. | Bleachwears";
const description =
  "Carica una fotografia e scarica un'illustrazione stencil monocromatica ad alto contrasto: nero piatto, ombre nette, soggetto intatto.";

export const metadata: Metadata = {
  title,
  description,
  ...socialMetadata({ title, description, path: "/bwslab" }),
};

export default function BwslabLayout({ children }: { children: React.ReactNode }) {
  return <div className={`${display.variable} ${sans.variable}`}>{children}</div>;
}
