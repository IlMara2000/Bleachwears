import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SITE_URL, absoluteUrl } from "@/lib/seo";
import { fallbackProducts, money } from "@/lib/shop/catalog";
import { productPath, productSlug, productStructuredData } from "@/lib/shop/structured-data";

type Params = { slug: string };

/**
 * La scheda di un capo, con un URL suo.
 *
 * Prima esisteva solo la home: il catalogo era dichiarato, ma nessuna pagina
 * poteva mostrare prezzo e disponibilità nei risultati, perché i dati
 * strutturati non avevano un posto dove puntare. Il prezzo viene dal catalogo
 * che il checkout usa per fatturare — mai da un valore scritto qui.
 */
function findProduct(slug: string) {
  return fallbackProducts.find((product) => productSlug(product) === slug) ?? null;
}

export function generateStaticParams(): Params[] {
  return fallbackProducts.map((product) => ({ slug: productSlug(product) }));
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const product = findProduct(slug);
  if (!product) return {};

  const title = `${product.name} — ${product.kind}`;
  const description = `${product.name}, ${product.kind.toLowerCase()} dipinta a mano. ${product.technique ?? ""} ${product.status}. ${money(product.price)}, spedizione dall'Italia.`.trim();

  return {
    title,
    description,
    alternates: { canonical: `${SITE_URL}${productPath(product)}` },
    openGraph: {
      title,
      description,
      url: `${SITE_URL}${productPath(product)}`,
      ...(product.image ? { images: [absoluteUrl(product.image)] } : {}),
    },
  };
}

export default async function ProductPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const product = findProduct(slug);

  if (!product) notFound();

  /* `<` escapato: un nome non deve poter chiudere il tag che lo dichiara. */
  const jsonLd = JSON.stringify(productStructuredData(product)).replace(/</g, "\\u003c");

  return (
    <main className="mx-auto max-w-4xl px-5 py-14 md:py-20">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />

      <p className="text-[0.7rem] uppercase tracking-[0.25em] text-neutral-500">
        <Link href="/" className="underline-offset-4 hover:underline">
          Bleachwears
        </Link>{" "}
        · Catalogo
      </p>

      <div className="mt-8 grid gap-10 md:grid-cols-2 md:items-start">
        <div className="overflow-hidden rounded-lg bg-neutral-900">
          {product.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={product.image} alt={`${product.name} — ${product.kind}`} className="h-full w-full object-cover" />
          ) : null}
        </div>

        <div>
          <h1 className="text-3xl font-semibold leading-tight md:text-4xl">{product.name}</h1>
          <p className="mt-2 text-neutral-600">{product.kind}</p>

          <p className="mt-6 text-2xl font-semibold">{money(product.price)}</p>
          <p className="mt-1 text-sm text-neutral-600">{product.status}</p>

          <dl className="mt-8 divide-y divide-neutral-200 border-y border-neutral-200 text-sm">
            <div className="flex justify-between gap-6 py-3">
              <dt className="text-neutral-500">Tecnica</dt>
              <dd className="text-right">{product.technique ?? "Dipinto a mano"}</dd>
            </div>
            <div className="flex justify-between gap-6 py-3">
              <dt className="text-neutral-500">Codice</dt>
              <dd className="text-right">{product.id}</dd>
            </div>
            <div className="flex justify-between gap-6 py-3">
              <dt className="text-neutral-500">Categoria</dt>
              <dd className="text-right">
                {product.category === "tee" ? "T-shirt" : product.category === "hoodie" ? "Felpa" : "Pezzo unico"}
              </dd>
            </div>
          </dl>

          <p className="mt-6 text-sm leading-relaxed text-neutral-600">
            Ogni capo è dipinto a mano, uno alla volta: quello che arriva è il tuo esemplare, non una stampa di serie.
            Le taglie e il pagamento si scelgono nel negozio.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/#shop-title"
              className="rounded-full bg-neutral-900 px-5 py-3 text-sm font-medium text-white hover:bg-neutral-700"
            >
              Scegli la taglia nel negozio
            </Link>
            <Link
              href="/bwslab"
              className="rounded-full border border-neutral-300 px-5 py-3 text-sm font-medium hover:border-neutral-900"
            >
              Vedilo nella pressa
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
