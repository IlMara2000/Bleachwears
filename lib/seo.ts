import type { Metadata } from "next";

/*
 * Next fonde i metadata campo per campo, ma non in profondità: una pagina che
 * dichiara solo `title` e `description` eredita l'intero `openGraph` della home,
 * quindi condivide titolo, descrizione e url della home. Questo helper li
 * riallinea alla pagina, riusando la card social unica del sito.
 */
export function socialMetadata({
  title,
  description,
  path,
}: {
  title: string;
  description: string;
  path: string;
}): Pick<Metadata, "openGraph" | "twitter"> {
  return {
    openGraph: {
      title,
      description,
      url: path,
      type: "website",
      locale: "it_IT",
      siteName: "Bleachwears",
      images: [{ url: "/og.png", width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ["/og.png"],
    },
  };
}
