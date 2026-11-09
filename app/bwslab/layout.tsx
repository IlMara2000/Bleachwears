import type { Metadata } from "next";
import { Anton, Inter_Tight } from "next/font/google";

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

export const metadata: Metadata = {
  title: "STENCIL LAB — One image. One style. | Bleachwears",
  description:
    "Carica una fotografia e scarica un'illustrazione stencil monocromatica ad alto contrasto: nero piatto, ombre nette, soggetto intatto.",
};

export default function BwslabLayout({ children }: { children: React.ReactNode }) {
  return <div className={`${display.variable} ${sans.variable}`}>{children}</div>;
}
