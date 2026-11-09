"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./stencil.module.css";

type Phase = "idle" | "ready" | "working" | "done";

type Prepared = {
  file: File;
  url: string;
  width: number;
  height: number;
  name: string;
  bytes: number;
};

type Generated = {
  url: string;
  width: number;
  height: number;
  ms: number;
  fileName: string;
};

type Status = { configured: boolean; model: string; resolution: string };

/** Long edge sent upstream: enough for a 2K output, small enough to upload fast. */
const MAX_EDGE = 2400;
const MAX_INPUT_BYTES = 45 * 1024 * 1024;
/** Vercel refuses request bodies over 4.5 MB, so aim well below it. */
const TARGET_UPLOAD_BYTES = 3_600_000;
const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];
const CLIENT_TIMEOUT_MS = 240_000;

const PHASES = ["LEGGO LA LUCE", "TAGLIO LE OMBRE", "STENDO L'INCHIOSTRO"] as const;

const cx = (...values: Array<string | false | undefined>) => values.filter(Boolean).join(" ");

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function messageFor(error: unknown) {
  if (error instanceof DOMException && error.name === "AbortError") {
    return "La trasformazione ci ha messo troppo e l'ho interrotta. Riprova con una foto più leggera.";
  }
  if (error instanceof Error) return error.message;
  return "Qualcosa è andato storto. Riprova.";
}

function loadSize(url: string) {
  return new Promise<{ width: number; height: number }>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => reject(new Error("Non riesco a leggere l'immagine generata."));
    image.src = url;
  });
}

/**
 * Orientation, transparency and size are settled in the browser: the model gets
 * an upright JPEG and the upload stays under the platform limit. The artwork
 * itself is the model's job, never CSS.
 */
async function prepare(file: File): Promise<Prepared> {
  const looksAccepted = ACCEPTED.includes(file.type) || /\.(jpe?g|png|webp)$/i.test(file.name);

  if (!looksAccepted) {
    throw new Error("Questo file non è un'immagine JPG, PNG o WEBP.");
  }

  if (file.size > MAX_INPUT_BYTES) {
    throw new Error(`Il file pesa ${formatBytes(file.size)}. Resta sotto i 45 MB.`);
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    try {
      bitmap = await createImageBitmap(file);
    } catch {
      throw new Error("Non riesco ad aprire questa immagine. Se è una foto HEIC, esportala in JPG.");
    }
  }

  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");

  if (!context) {
    bitmap.close();
    throw new Error("Questo browser non riesce a preparare l'immagine.");
  }

  /* Mid grey keeps both light and dark artwork visible when transparency is lost. */
  context.fillStyle = "#7a7a7a";
  context.fillRect(0, 0, width, height);
  context.imageSmoothingQuality = "high";
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const encode = (quality: number) =>
    new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (value) => (value ? resolve(value) : reject(new Error("Non riesco a codificare l'immagine."))),
        "image/jpeg",
        quality,
      );
    });

  /* Lighter encode only when needed: quality stays high for normal photos. */
  let quality = 0.94;
  let blob = await encode(quality);
  while (blob.size > TARGET_UPLOAD_BYTES && quality > 0.56) {
    quality -= 0.12;
    blob = await encode(quality);
  }

  const prepared = new File([blob], "stencil-input.jpg", { type: "image/jpeg" });

  return {
    file: prepared,
    url: URL.createObjectURL(prepared),
    width,
    height,
    name: file.name,
    bytes: prepared.size,
  };
}

export default function Studio() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [source, setSource] = useState<Prepared | null>(null);
  const [generated, setGenerated] = useState<Generated | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [split, setSplit] = useState(50);
  const [run, setRun] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const sourceRef = useRef<Prepared | null>(null);
  const generatedRef = useRef<Generated | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/bwslab/status")
      .then((response) => (response.ok ? response.json() : null))
      .then((value: Status | null) => {
        if (alive && value) setStatus(value);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  /* Real elapsed time, never a guessed percentage. */
  useEffect(() => {
    if (phase !== "working") return;
    const started = Date.now();
    const timer = window.setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 500);
    return () => window.clearInterval(timer);
  }, [phase, run]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (sourceRef.current) URL.revokeObjectURL(sourceRef.current.url);
      if (generatedRef.current) URL.revokeObjectURL(generatedRef.current.url);
    };
  }, []);

  const accept = useCallback(async (file: File) => {
    setError(null);
    setPreparing(true);
    try {
      const prepared = await prepare(file);
      if (sourceRef.current) URL.revokeObjectURL(sourceRef.current.url);
      if (generatedRef.current) URL.revokeObjectURL(generatedRef.current.url);
      generatedRef.current = null;
      sourceRef.current = prepared;
      setGenerated(null);
      setSource(prepared);
      setPhase("ready");
      setSplit(50);
    } catch (prepareError) {
      setError(messageFor(prepareError));
    } finally {
      setPreparing(false);
    }
  }, []);

  const transform = useCallback(async () => {
    const current = sourceRef.current;
    if (!current) return;

    setError(null);
    setElapsed(0);
    setPhase("working");
    setRun((value) => value + 1);

    if (generatedRef.current) {
      URL.revokeObjectURL(generatedRef.current.url);
      generatedRef.current = null;
      setGenerated(null);
    }

    const controller = new AbortController();
    abortRef.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), CLIENT_TIMEOUT_MS);
    const started = performance.now();

    try {
      const body = new FormData();
      body.append("image", current.file);

      const response = await fetch("/api/bwslab/transform", {
        method: "POST",
        body,
        signal: controller.signal,
      });

      if (!response.ok) {
        const detail = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(detail?.error || `Il server ha risposto ${response.status}.`);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const size = await loadSize(url);

      const next: Generated = {
        url,
        width: size.width,
        height: size.height,
        ms: Math.round(performance.now() - started),
        fileName: `stencil-lab-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.png`,
      };
      generatedRef.current = next;
      setGenerated(next);
      setPhase("done");
      setSplit(50);
    } catch (transformError) {
      setError(messageFor(transformError));
      setPhase("ready");
    } finally {
      window.clearTimeout(timeout);
      abortRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    if (sourceRef.current) URL.revokeObjectURL(sourceRef.current.url);
    if (generatedRef.current) URL.revokeObjectURL(generatedRef.current.url);
    sourceRef.current = null;
    generatedRef.current = null;
    setSource(null);
    setGenerated(null);
    setError(null);
    setPhase("idle");
    setSplit(50);
    if (inputRef.current) inputRef.current.value = "";
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setDragging(false);
      const file = event.dataTransfer.files?.[0];
      if (file) void accept(file);
    },
    [accept],
  );

  /* Paste a screenshot straight from the clipboard. */
  useEffect(() => {
    function onPaste(event: ClipboardEvent) {
      const file = Array.from(event.clipboardData?.files ?? [])[0];
      if (file && phase !== "working") void accept(file);
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [accept, phase]);

  const notConfigured = status?.configured === false;
  const working = phase === "working";

  return (
    <div className={styles.root}>
      <div className={styles.shell}>
        <header className={cx("flex flex-wrap items-end justify-between gap-6 pb-6", styles.hairlineBottom)}>
          <div>
            <h1 className={styles.wordmark}>Stencil Lab</h1>
            <p className={cx(styles.measure, "mt-3")}>One image. One style.</p>
          </div>
          <div className="flex flex-wrap items-center gap-4 sm:gap-6">
            <span className={styles.micro}>{status?.resolution ?? "1K"}</span>
            <span className={styles.micro}>
              {status?.model ? status.model.replace(/^gemini-/, "") : "nano-banana-2.1"}
            </span>
            <Link href="/" className={styles.backLink}>
              ← bleachwears
            </Link>
          </div>
        </header>

        <section className="grid gap-8 py-8 lg:grid-cols-[1.35fr_1fr] lg:gap-12 lg:py-10">
          <div className="min-w-0">
            {phase === "idle" ? (
              <div
                className={styles.dropzone}
                role="button"
                tabIndex={0}
                aria-label="Carica immagine"
                data-dragging={dragging}
                data-busy={preparing}
                onClick={() => inputRef.current?.click()}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    inputRef.current?.click();
                  }
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
              >
                <span className={styles.dropzoneIndex}>01 / INPUT</span>
                <div className="pointer-events-none">
                  <p className={cx(styles.headline, "mx-auto max-w-[22ch]")}>
                    Carica un&apos;immagine
                    <br />
                    <span className={styles.smoke}>entra nella pressa</span>
                  </p>
                  <p className={cx(styles.measure, "mt-5")}>JPG · PNG · WEBP</p>
                  <span className={cx(styles.btn, styles.btnPrimary, "mt-7 inline-flex")}>
                    Carica immagine
                  </span>
                </div>
                <span className={styles.dropzoneHint}>
                  <span>Trascina, incolla o sfoglia</span>
                  <span>Max 45 MB</span>
                </span>
              </div>
            ) : (
              <div className={styles.frame}>
                <div className={cx(styles.canvasPlate, "relative")}>
                  {source ? (
                    <img
                      src={source.url}
                      alt="Immagine caricata"
                      style={{ opacity: working ? 0.55 : 1, transition: "opacity 320ms ease" }}
                    />
                  ) : null}
                  {working ? <div className={styles.scanline} /> : null}
                  <span className={styles.plateTag}>
                    {working ? "In lavorazione" : phase === "done" ? "Originale" : "Input"}
                  </span>
                </div>
              </div>
            )}

            {error ? (
              <div className={cx(styles.notice, "mt-4")} role="alert">
                <span className={cx(styles.micro, "pt-[0.15rem]")}>Errore</span>
                <p>{error}</p>
              </div>
            ) : null}

            {phase === "done" && generated ? (
              <figure className="mt-6">
                <div
                  className={cx(styles.compare, "mx-auto")}
                  style={{
                    width: `min(100%, calc(62vh * ${(generated.width / generated.height).toFixed(4)}))`,
                    aspectRatio: `${generated.width} / ${generated.height}`,
                  }}
                >
                  <div className={styles.compareLayer}>
                    {source ? <img src={source.url} alt="Originale" /> : null}
                  </div>
                  <div className={styles.compareAfter} style={{ clipPath: `inset(0 0 0 ${split}%)` }}>
                    <img src={generated.url} alt="Illustrazione stencil generata" />
                  </div>
                  <div className={styles.compareHandle} style={{ left: `${split}%` }}>
                    <span className={styles.compareGrip}>↔</span>
                  </div>
                  <input
                    className={styles.compareRange}
                    type="range"
                    min={0}
                    max={100}
                    step={0.5}
                    value={split}
                    aria-label="Confronta originale e stencil"
                    onChange={(event) => setSplit(Number(event.target.value))}
                  />
                  <span className={styles.compareFocus} />
                  <span className={cx(styles.compareTag, styles.compareTagLeft)}>Originale</span>
                  <span className={cx(styles.compareTag, styles.compareTagRight)}>Stencil</span>
                </div>
                <figcaption className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <span className={styles.micro}>
                    {generated.width} × {generated.height} px · PNG
                  </span>
                  <span className={cx(styles.micro, styles.numeric)}>
                    {(generated.ms / 1000).toFixed(1)} s · run {run}
                  </span>
                </figcaption>
              </figure>
            ) : null}
          </div>

          <aside className="min-w-0 lg:pt-2">
            {phase === "idle" ? (
              <div className="space-y-6">
                <p className={styles.lead}>
                  Una fotografia entra, un&apos;illustrazione serigrafica esce: nero piatto, luce dura,
                  nessun colore, nessun filtro. Il soggetto mantiene la sua faccia.
                </p>
                <ol className={styles.stepList}>
                  <li>
                    <span>01</span>
                    <p>Carica un ritratto, un animale, un&apos;auto, un edificio: qualcosa con un soggetto chiaro.</p>
                  </li>
                  <li>
                    <span>02</span>
                    <p>Premi trasforma. Il modello legge la luce e la ridisegna a inchiostro.</p>
                  </li>
                  <li>
                    <span>03</span>
                    <p>Trascina la linea per confrontare. Scarica il PNG o rigenera per un altro taglio.</p>
                  </li>
                </ol>
              </div>
            ) : null}

            {phase === "ready" && source ? (
              <div className="space-y-6">
                <div className="space-y-2">
                  <p className={styles.measure}>02 / Pronto</p>
                  <p className={styles.headline}>La pressa è calda</p>
                </div>
                <dl className={cx("grid grid-cols-2 gap-x-4 gap-y-3 py-4 text-sm", styles.hairlineBoth)}>
                  <div className="col-span-2 min-w-0">
                    <dt className={styles.micro}>File</dt>
                    <dd className={cx("truncate", styles.paper)}>{source.name}</dd>
                  </div>
                  <div>
                    <dt className={styles.micro}>Formato</dt>
                    <dd className={cx(styles.numeric, styles.ash)}>
                      {source.width} × {source.height}
                    </dd>
                  </div>
                  <div>
                    <dt className={styles.micro}>Upload</dt>
                    <dd className={cx(styles.numeric, styles.ash)}>{formatBytes(source.bytes)}</dd>
                  </div>
                </dl>
                <div className={styles.dock}>
                  <button
                    type="button"
                    className={cx(styles.btn, styles.btnPrimary, styles.btnWide)}
                    onClick={() => void transform()}
                    disabled={notConfigured}
                  >
                    Trasforma
                  </button>
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" className={styles.btn} onClick={() => inputRef.current?.click()}>
                      Cambia
                    </button>
                    <button
                      type="button"
                      className={cx(styles.btn, styles.btnGhost)}
                      onClick={reset}
                    >
                      Annulla
                    </button>
                  </div>
                </div>
                <p className={cx(styles.micro, "leading-relaxed")}>
                  Identità, posa e accessori restano. Lo sfondo diventa inchiostro nero.
                </p>
              </div>
            ) : null}

            {working ? (
              <div className="space-y-5">
                <div className="space-y-2">
                  <p className={styles.measure}>03 / Stampa</p>
                  <p className={styles.headline}>
                    {PHASES[Math.min(PHASES.length - 1, Math.floor(elapsed / 4.5))]}
                  </p>
                </div>
                <div
                  className={styles.progress}
                  role="progressbar"
                  aria-label="Elaborazione in corso"
                  aria-valuetext={`${elapsed} secondi`}
                >
                  <div className={styles.progressBar} />
                </div>
                <div className="flex items-center justify-between">
                  <span className={cx(styles.micro, styles.numeric)}>{elapsed}s trascorsi</span>
                  <button
                    type="button"
                    className={cx(styles.btn, styles.btnGhost, "min-h-0 px-0 py-1")}
                    onClick={reset}
                  >
                    Annulla
                  </button>
                </div>
                <p className={cx(styles.micro, "leading-relaxed")}>
                  Una generazione richiede di solito 15–40 secondi. Nulla viene salvato.
                </p>
              </div>
            ) : null}

            {phase === "done" && generated ? (
              <div className="space-y-6">
                <div className="space-y-2">
                  <p className={styles.measure}>04 / Inchiostro fresco</p>
                  <p className={styles.headline}>Appena stampato</p>
                </div>
                <div className={styles.dock}>
                  <a
                    className={cx(styles.btn, styles.btnPrimary, styles.btnWide)}
                    href={generated.url}
                    download={generated.fileName}
                  >
                    Scarica PNG
                  </a>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      className={styles.btn}
                      onClick={() => void transform()}
                      disabled={notConfigured}
                    >
                      Rigenera
                    </button>
                    <button
                      type="button"
                      className={cx(styles.btn, styles.btnGhost)}
                      onClick={reset}
                    >
                      Nuova immagine
                    </button>
                  </div>
                </div>
                <p className={cx(styles.micro, "leading-relaxed")}>
                  Stessa foto, taglio nuovo: ogni run è un&apos;interpretazione, mai la copia della precedente.
                </p>
              </div>
            ) : null}

            {notConfigured ? (
              <div className={cx(styles.notice, "mt-6")}>
                <span className={cx(styles.micro, "pt-[0.15rem]")}>Setup</span>
                <p>
                  <strong>Manca la chiave.</strong> Aggiungi <code className={styles.codeChip}>GEMINI_API_KEY</code>{" "}
                  alle variabili d&apos;ambiente (in locale <code className={styles.codeChip}>.env.local</code>, su Vercel
                  in Project Settings) e riavvia. Finché non c&apos;è, l&apos;app non finge nulla.
                </p>
              </div>
            ) : null}
          </aside>
        </section>

        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          style={{ position: "absolute", width: 1, height: 1, opacity: 0, pointerEvents: "none" }}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void accept(file);
            event.target.value = "";
          }}
        />

        <footer className={cx("flex flex-wrap items-center justify-between gap-3 pt-5", styles.hairlineTop)}>
          <span className={styles.micro}>Elaborata in memoria · mai salvata</span>
          <span className={styles.micro}>Nessun filtro · ridisegno AI</span>
        </footer>
      </div>
    </div>
  );
}
