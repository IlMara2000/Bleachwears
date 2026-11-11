#!/usr/bin/env node
/**
 * Generatore del CSV dei redirect per i prodotti dismessi.
 *
 * Uso:
 *   node scripts/redirects.mjs init <export-prodotti.csv>   # crea la mappa da compilare
 *   node scripts/redirects.mjs genera                        # produce docs/shopify/redirects-shopify.csv
 *
 * La mappa (docs/shopify/prodotti-da-dismettere.csv) ha le colonne:
 *   handle,titolo,stato,azione,destinazione,note
 * azione: "tieni" oppure "dismetti". Solo le righe "dismetti" con destinazione
 * valida finiscono nel CSV dei redirect.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const MAPPA = 'docs/shopify/prodotti-da-dismettere.csv';
const OUT = 'docs/shopify/redirects-shopify.csv';
const COLONNE = ['handle', 'titolo', 'stato', 'azione', 'destinazione', 'note'];

function parseCsv(text) {
  const clean = text.replace(/^\uFEFF/, '');
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < clean.length; i += 1) {
    const c = clean[i];
    if (inQuotes) {
      if (c === '"' && clean[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (c !== '\r') {
      field += c;
    }
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => String(f).trim() !== ''));
}

function toCsv(rows) {
  return `${rows
    .map((r) =>
      r
        .map((f) => {
          const v = String(f ?? '');
          return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
        })
        .join(','),
    )
    .join('\n')}\n`;
}

function init(exportPath) {
  if (!existsSync(exportPath)) {
    console.error(`Export non trovato: ${exportPath}`);
    process.exit(1);
  }
  const rows = parseCsv(readFileSync(exportPath, 'utf8'));
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const iHandle = header.indexOf('handle');
  const iTitle = header.indexOf('title');
  const iStatus = header.indexOf('status');
  if (iHandle === -1) {
    console.error('Colonna "Handle" non trovata: usa l\'export Prodotti di Shopify.');
    process.exit(1);
  }
  const out = [COLONNE];
  for (const r of rows.slice(1)) {
    const handle = String(r[iHandle] ?? '').trim();
    if (!handle) continue;
    out.push([
      handle,
      iTitle >= 0 ? String(r[iTitle] ?? '').trim() : '',
      iStatus >= 0 ? String(r[iStatus] ?? '').trim() : '',
      'tieni',
      '',
      '',
    ]);
  }
  writeFileSync(MAPPA, toCsv(out));
  console.log(`Mappa creata: ${MAPPA} (${out.length - 1} prodotti)`);
  console.log('Compila la colonna azione con "dismetti" e la destinazione, poi lancia: genera');
}

function genera() {
  if (!existsSync(MAPPA)) {
    console.error(`Mappa non trovata: ${MAPPA}\n  Prima esegui: node scripts/redirects.mjs init <export-prodotti.csv>`);
    process.exit(1);
  }
  const rows = parseCsv(readFileSync(MAPPA, 'utf8'));
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const idx = {};
  for (const col of COLONNE) idx[col] = header.indexOf(col);
  if (idx.handle === -1 || idx.azione === -1 || idx.destinazione === -1) {
    console.error(`La mappa deve avere le colonne: ${COLONNE.join(',')}`);
    process.exit(1);
  }

  const errori = [];
  const avvisi = [];
  const redirect = [];
  const visti = new Set();

  for (let n = 1; n < rows.length; n += 1) {
    const r = rows[n];
    const handle = String(r[idx.handle] ?? '').trim();
    const azione = String(r[idx.azione] ?? '').trim().toLowerCase();
    const dest = String(r[idx.destinazione] ?? '').trim();
    const riga = n + 1;

    if (!handle) continue;

    if (azione !== 'dismetti') {
      if (dest) avvisi.push(`riga ${riga} (${handle}): azione "${azione || 'vuota'}" ma destinazione compilata`);
      continue;
    }

    if (!/^[a-z0-9][a-z0-9-]*$/.test(handle)) {
      errori.push(`riga ${riga}: handle non valido "${handle}"`);
      continue;
    }
    if (!dest) {
      errori.push(`riga ${riga} (${handle}): manca la destinazione`);
      continue;
    }
    if (dest.includes('://')) {
      errori.push(`riga ${riga} (${handle}): la destinazione deve essere un path relativo, non un URL`);
      continue;
    }
    if (!dest.startsWith('/')) {
      errori.push(`riga ${riga} (${handle}): la destinazione deve iniziare con "/"`);
      continue;
    }
    if (dest === `/products/${handle}`) {
      errori.push(`riga ${riga} (${handle}): destinazione uguale alla sorgente`);
      continue;
    }
    if (['/products', '/collections', '/collections/all', '/apps', '/a'].includes(dest.replace(/\/$/, ''))) {
      if (dest.replace(/\/$/, '') !== '/collections/all') {
        avvisi.push(`riga ${riga} (${handle}): destinazione riservata "${dest}"`);
      }
    }

    const from = `/products/${handle}`;
    if (visti.has(from)) {
      errori.push(`riga ${riga} (${handle}): sorgente duplicata ${from}`);
      continue;
    }
    visti.add(from);
    redirect.push([from, dest]);
  }

  writeFileSync(OUT, toCsv([['Redirect from', 'Redirect to'], ...redirect]));

  console.log(`Scritto ${OUT}: ${redirect.length} redirect`);
  for (const [f, t] of redirect) console.log(`  ${f}  ->  ${t}`);
  if (avvisi.length) {
    console.log('\nAvvisi:');
    for (const a of avvisi) console.log(`  - ${a}`);
  }
  if (errori.length) {
    console.error('\nErrori:');
    for (const e of errori) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log('\nNessun errore. Importa il CSV in: Contenuti -> Menu -> Visualizza redirect URL -> Importa (dopo aver messo i prodotti in bozza).');
}

const [, , comando, argomento] = process.argv;
if (comando === 'init') {
  if (!argomento) {
    console.error('Uso: node scripts/redirects.mjs init <export-prodotti.csv>');
    process.exit(1);
  }
  init(argomento);
} else if (comando === 'genera') {
  genera();
} else {
  console.error('Comandi: init <export-prodotti.csv> | genera');
  process.exit(1);
}
