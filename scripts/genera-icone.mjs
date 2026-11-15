#!/usr/bin/env node
// Genera il set di icone del sito dal marchio quadrato.
// Uso: node scripts/genera-icone.mjs [sorgente] [--out public] [--bg "#171a1c"] [--with-og]
import { mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

function parseArgs(argv) {
  const opts = {
    src: "logo-bw-square.svg",
    out: "public",
    bg: "#171a1c",
    lum: 125,
    spread: 26,
    margin: 0.005,
    logoMargin: 0.02,
    withOg: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--out") opts.out = argv[++i];
    else if (arg === "--bg") opts.bg = argv[++i];
    else if (arg === "--lum") opts.lum = Number(argv[++i]);
    else if (arg === "--spread") opts.spread = Number(argv[++i]);
    else if (arg === "--margin") opts.margin = Number(argv[++i]);
    else if (arg === "--logo-margin") opts.logoMargin = Number(argv[++i]);
    else if (arg === "--with-og") opts.withOg = true;
    else if (arg.startsWith("--")) throw new Error(`Opzione sconosciuta: ${arg}`);
    else opts.src = arg;
  }

  if (!opts.src) {
    throw new Error("Serve il file sorgente: node scripts/genera-icone.mjs logo-bw-square.svg");
  }
  return opts;
}

function hexToRgb(hex) {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!match) throw new Error(`Colore non valido: ${hex}`);
  const value = Number.parseInt(match[1], 16);
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255, alpha: 1 };
}

// Rende trasparente lo sfondo scuro: i grigi scuri (sfondo, incluse le zone chiuse
// tra le lettere) diventano trasparenti, i marroni del contorno del marchio restano.
async function cutBackground(src, opts) {
  const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const pixels = width * height;
  const alpha = new Uint8Array(pixels).fill(255);

  for (let index = 0; index < pixels; index += 1) {
    const offset = index * 4;
    if (data[offset + 3] < 16) {
      alpha[index] = 0;
      continue;
    }
    const r = data[offset];
    const g = data[offset + 1];
    const b = data[offset + 2];
    const lum = (r * 299 + g * 587 + b * 114) / 1000;
    const spread = Math.max(r, g, b) - Math.min(r, g, b);
    if (lum < opts.lum && spread < opts.spread) alpha[index] = 0;
  }

  let left = width;
  let upper = height;
  let right = -1;
  let lower = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (alpha[y * width + x] === 0) continue;
      if (x < left) left = x;
      if (y < upper) upper = y;
      if (x > right) right = x;
      if (y > lower) lower = y;
    }
  }
  if (right < 0) throw new Error("Nessun contenuto trovato: lo sfondo ha coperto tutto il logo.");

  const cutWidth = right - left + 1;
  const cutHeight = lower - upper + 1;
  const rgba = Buffer.alloc(cutWidth * cutHeight * 4);
  for (let y = 0; y < cutHeight; y += 1) {
    for (let x = 0; x < cutWidth; x += 1) {
      const from = (upper + y) * width + (left + x);
      const to = (y * cutWidth + x) * 4;
      rgba[to] = data[from * 4];
      rgba[to + 1] = data[from * 4 + 1];
      rgba[to + 2] = data[from * 4 + 2];
      rgba[to + 3] = alpha[from];
    }
  }

  return sharp(rgba, { raw: { width: cutWidth, height: cutHeight, channels: 4 } }).png().toBuffer();
}

// Centra il marchio ritagliato in una tela quadrata trasparente.
async function toSquare(trimmed, margin) {
  const { width, height } = await sharp(trimmed).metadata();
  const side = Math.max(width, height);
  const pad = Math.round(side * margin);
  const canvas = side + pad * 2;
  return sharp(trimmed)
    .extend({
      top: Math.floor((canvas - height) / 2),
      bottom: Math.ceil((canvas - height) / 2),
      left: Math.floor((canvas - width) / 2),
      right: Math.ceil((canvas - width) / 2),
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();
}

// Stessa tela, ma su sfondo pieno: iOS e le icone maskable non gestiscono la trasparenza.
async function onSolidBackground(square, size, scale, rgb) {
  const inner = Math.round(size * scale);
  const logo = await sharp(square).resize(inner, inner, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).toBuffer();
  return sharp({ create: { width: size, height: size, channels: 4, background: rgb } })
    .composite([{ input: logo, gravity: "center" }])
    .removeAlpha()
    .png()
    .toBuffer();
}

const opts = parseArgs(process.argv.slice(2));
const bg = hexToRgb(opts.bg);
const outDir = path.resolve(opts.out);
await mkdir(outDir, { recursive: true });

const trimmed = await cutBackground(path.resolve(opts.src), opts);
const square = await toSquare(trimmed, opts.margin);
const squareLogo = opts.logoMargin === opts.margin ? square : await toSquare(trimmed, opts.logoMargin);
const square512 = await sharp(square).resize(512, 512, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
const logo512 = await sharp(squareLogo).resize(512, 512, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();

const written = [];
async function write(name, buffer) {
  await sharp(buffer).toFile(path.join(outDir, name));
  written.push(name);
}

await write("logo.png", logo512);
await write("icon-512.png", square512);
await write("icon-192.png", await sharp(square512).resize(192, 192).png().toBuffer());
await write("favicon.png", await sharp(square512).resize(64, 64).png().toBuffer());
await write("apple-touch-icon.png", await onSolidBackground(square, 180, 0.78, bg));
await write("icon-512-maskable.png", await onSolidBackground(square, 512, 0.8, bg));

if (opts.withOg) {
  const logo = await sharp(square512).resize(360, 360, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).toBuffer();
  await write(
    "og.png",
    await sharp({ create: { width: 1200, height: 630, channels: 4, background: bg } })
      .composite([{ input: logo, gravity: "center" }])
      .png()
      .toBuffer()
  );
}

console.log(`Icone generate in ${outDir}:`);
for (const name of written) console.log(`  ${name}`);
