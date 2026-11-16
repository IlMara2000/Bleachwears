import { BleachwearsApp } from "./BleachwearsApp";
import { fallbackProducts } from "@/lib/shop/catalog";
import { catalogStructuredData } from "@/lib/shop/structured-data";

export default function Home() {
  /*
   * Il catalogo dichiarato ai motori di ricerca: nome, prezzo in euro e
   * disponibilità presi dal catalogo che il checkout usa per fatturare.
   * `<` viene escapato perché un nome prodotto non deve poter chiudere il tag.
   */
  const jsonLd = JSON.stringify(catalogStructuredData(fallbackProducts)).replace(/</g, "\\u003c");

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
      <BleachwearsApp />
    </>
  );
}
