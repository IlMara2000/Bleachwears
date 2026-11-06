# Velvetica Streetwear — tema Shopify OS 2.0

Tema Shopify completo che riproduce il design dello storefront: hero con capi appesi
al binario, sezione campagna con sfera cromata, vetrina prodotti, pagina prodotto con
galleria e selettore taglie, drawer carrello AJAX.

## Installazione

Requisiti: Shopify CLI 3 (`npm i -g @shopify/cli`) e Node 20+.

```bash
cd shopify-theme
shopify theme dev --store il-tuo-store.myshopify.com
```

In alternativa: zippa il contenuto di `shopify-theme/` (non la cartella) e caricalo da
Admin → Online Store → Themes → Add theme → Upload zip file.

## Cosa modifica il merchant dall'editor

**Impostazioni tema** (`config/settings_schema.json`)

- Colori: sfondo, testo, testo secondario, bordi.
- Tipografia: font titoli e font testo (font library Shopify).
- Forme: raggio degli angoli.

**Home** (`templates/index.json`)

- `Hero – binario capi`: testi eyebrow, etichetta e link del bottone, riga handle;
  per ogni capo appeso (blocco) prodotto, appendino legno/metallo, cartellino
  (testo + stile sconto/novità/brand), forma e colore del segnaposto se il prodotto
  non ha foto.
- `Campagna`: titolo, testo, bottone, sfera cromata on/off.
- `Collezione in vetrina`: titolo, sottotitolo, collezione, numero prodotti.

**Pagina prodotto** (`templates/product.json` → `main-product`)

- Nota spedizione, dettagli/composizione (richtext), link guida alle taglie,
  titolo correlati, collezione correlati.

## Struttura

```
layout/theme.liquid          head, font, CSS vars, sezioni globali
assets/base.css              tutti gli stili
assets/theme.js              drawer, carrello AJAX, varianti, galleria
sections/header.liquid       brand, menu, ricerca, carrello
sections/hero-rail.liquid    binario dei capi (blocchi prodotto)
sections/campaign.liquid     campagna con sfera
sections/featured-collection.liquid
sections/main-product.liquid galleria, taglie, form, correlati
sections/main-collection.liquid
sections/main-cart.liquid    pagina /cart
sections/main-search.liquid  pagina /search
sections/main-404.liquid     pagina 404
sections/main-list-collections.liquid
sections/cart-drawer.liquid  drawer globale
snippets/product-card.liquid
snippets/garment-placeholder.liquid  silhouette SVG quando manca la foto
snippets/icon-hanger.liquid
templates/*.json             index, product, collection, cart, search, 404, list-collections
```

## Note tecniche

- Il carrello usa le AJAX API (`/cart/add.js`, `/cart/change.js`) e la Section
  Rendering API (`/?sections=cart-drawer,main-cart`) per rinfrescare drawer e pagina
  carrello con lo stesso markup Liquid.
- Le taglie sono i valori della prima opzione prodotto; le combinazioni senza
  variante disponibile vengono disabilitate lato client.
- Nessuna immagine è inclusa: senza foto prodotto il tema mostra le silhouette SVG,
  così il layout resta leggibile prima del caricamento del catalogo.
- Checkout e pagamenti restano su Shopify Checkout.
