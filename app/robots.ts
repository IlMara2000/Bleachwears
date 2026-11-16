import type { MetadataRoute } from "next";
import { SITE_URL } from "../lib/seo.ts";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        /* Le API della pressa non sono pagine e non devono finire in un indice. */
        disallow: ["/api/"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
