#!/usr/bin/env node
/**
 * Verifica statica delle promesse commerciali nei documenti.
 *
 * Uso: node scripts/promesse.mjs
 *
 * Cosa fa:
 *  - trova ogni frase su spedizione gratuita e resi nei file .md/.csv di docs/shopify
 *  - estrae la soglia (€) e i giorni
 *  - segnala i valori diversi dai canonici e le promesse senza soglia
 *
 * Non parla con Shopify: verifica che i testi siano coerenti tra loro.
 * La corrispondenza con le impostazioni del negozio va controllata in admin
 * (vedi docs/shopify/verifica-promesse.md).
 */

import { readdirSync, readFileSync } from 'node:fs';

const CANONICO = {
  spedizioneGratuitaSopra: 120,
  giorniReso: 14,
};

const DIR = 'docs/shopify';
// il documento di verifica contiene esempi ipotetici (100 €, 14 giorni): va escluso dalla scansione
const ESCLUSI = new Set(['verifica-promesse.md']);
const file = readdirSync(DIR)
  .filter((f) => /\.(md|csv)$/.test(f) && !ESCLUSI.has(f))
  .sort();

const occorrenze = [];

for (const f of file) {
  const righe = readFileSync(`${DIR}/${f}`, 'utf8').split('\n');
  righe.forEach((riga, i) => {
    const testo = riga.trim();
    if (!testo) return;

    // spedizione gratuita: cerco il primo importo dopo la parola "gratuit"
    if (/spedizione[^.\n]{0,40}gratuit/i.test(testo) || /gratuit[^.\n]{0,20}spedizione/i.test(testo)) {
      const pos = testo.toLowerCase().indexOf('gratuit');
      const dopo = testo.slice(pos);
      const m = dopo.match(/(\d{1,3})\s*€/);
      occorrenze.push({
        file: f,
        riga: i + 1,
        tipo: 'spedizione',
        valore: m ? Number(m[1]) : null,
        testo,
      });
    }

    // resi: numero seguito da "giorni" sulla stessa riga
    if (/\bresi|\breso\b/i.test(testo) && /\bgiorni/i.test(testo)) {
      const m = testo.match(/(\d{1,3})\s*giorni/i);
      if (m) {
        occorrenze.push({
          file: f,
          riga: i + 1,
          tipo: 'resi',
          valore: Number(m[1]),
          testo,
        });
      }
    }
  });
}

const spedizione = occorrenze.filter((o) => o.tipo === 'spedizione');
const resi = occorrenze.filter((o) => o.tipo === 'resi');

const errori = [];
const avvisi = [];

console.log('=== Occorrenze ===\n');
for (const o of occorrenze) {
  const valore = o.valore === null ? 'senza soglia' : o.valore;
  console.log(`${o.file}:${o.riga}  [${o.tipo}] ${valore}`);
  console.log(`    ${o.testo.slice(0, 150)}`);
  if (o.valore === null) avvisi.push(`${o.file}:${o.riga}  promessa senza soglia/valore`);
  if (o.tipo === 'spedizione' && o.valore !== null && o.valore !== CANONICO.spedizioneGratuitaSopra) {
    errori.push(`${o.file}:${o.riga}  spedizione gratuita a ${o.valore} €, canonico ${CANONICO.spedizioneGratuitaSopra} €`);
  }
  if (o.tipo === 'resi' && o.valore !== CANONICO.giorniReso) {
    errori.push(`${o.file}:${o.riga}  resi a ${o.valore} giorni, canonico ${CANONICO.giorniReso}`);
  }
}

console.log('\n=== Riepilogo ===\n');
const conta = (arr, chiave) => {
  const m = new Map();
  for (const o of arr) m.set(o.valore, (m.get(o.valore) ?? 0) + 1);
  return [...m.entries()].map(([k, v]) => `${k ?? 'senza soglia'} ×${v}`).join(' · ') || 'nessuna';
};
console.log(`spedizione gratuita: ${spedizione.length} occorrenze · ${conta(spedizione)}`);
console.log(`resi: ${resi.length} occorrenze · ${conta(resi)}`);
console.log(`canonico: spedizione gratuita sopra ${CANONICO.spedizioneGratuitaSopra} € · resi ${CANONICO.giorniReso} giorni`);

if (avvisi.length) {
  console.log('\n=== Avvisi ===');
  for (const a of avvisi) console.log(`  - ${a}`);
}
if (errori.length) {
  console.error('\n=== Errori (valori non canonici) ===');
  for (const e of errori) console.error(`  - ${e}`);
  process.exit(1);
}
console.log('\nNessun valore non canonico. Ricorda: la coerenza con le impostazioni del negozio va verificata in admin.');
