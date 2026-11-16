import type { MetadataRoute } from "next";
import { SITE_URL } from "../lib/seo.ts";

/**
 * Le pagine che esistono davvero. Shop, carrello e checkout sono viste della
 * stessa pagina, quindi non hanno un URL proprio da elencare qui.
 */
const PAGES: Array<{ path: string; priority: number; changeFrequency: "weekly" | "monthly" }> = [
  { path: "/", priority: 1, changeFrequency: "weekly" },
  { path: "/bwslab", priority: 0.8, changeFrequency: "monthly" },
  { path: "/bwslab/nfsw", priority: 0.6, changeFrequency: "monthly" },
  { path: "/legale/termini", priority: 0.3, changeFrequency: "monthly" },
  { path: "/legale/privacy", priority: 0.3, changeFrequency: "monthly" },
  { path: "/legale/spedizioni-e-resi", priority: 0.3, changeFrequency: "monthly" },
];

export default function sitemap(): MetadataRoute.Sitemap {
  /* Data di build: senza un CMS è l'unico indicatore onesto di quanto è fresco il sito. */
  const lastModified = new Date();

  return PAGES.map((page) => ({
    url: `${SITE_URL}${page.path}`,
    lastModified,
    changeFrequency: page.changeFrequency,
    priority: page.priority,
  }));
}
