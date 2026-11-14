"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import styles from "../stencil.module.css";

const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];
const MAX_INPUT_BYTES = 45 * 1024 * 1024;
/** Enough detail for the model, small enough to upload fast. */
const MAX_EDGE = 1600;
/** Vercel refuses request bodies over 4.5 MB, so aim well below it. */
const TARGET_UPLOAD_BYTES = 3_600_000;
/** Mirrors the server's own limit, so the counter never lies. */
const MAX_PROMPT = 600;
/**
 * The local model takes ~5 minutes per image and the server keeps a 600 s
 * budget: aborting earlier would kill a generation that was about to finish.
 */
const CLIENT_TIMEOUT_MS = 660_000;

type Prepared = { file: File; url: string; width: number; height: number; name: string };

type Status = {
  configured: boolean;
  provider?: string;
  model: string;
  resolution: string;
  budget?: { cap: number; used: number; remaining: number };
};

/**
 * The notice has to match what the server actually does. A local model has no
 * daily cap, so promising one would be a lie printed in the UI.
 */
function timingLine(status: Status | null): string {
  if (!status) return "Ogni immagine richiede da uno a cinque minuti, secondo il modello in uso.";
  return status.provider === "local"
    ? "Su questa macchina una modifica richiede circa 5 minuti."
    : "Una modifica richiede circa un minuto.";
}

function quotaLine(status: Status | null): string {
  if (!status) return "";

  const cap = status.budget?.cap ?? 0;
  const remaining = status.budget?.remaining ?? -1;

  if (cap === 0) return "Nessun tetto giornaliero: il modello gira su questa macchina.";
  if (remaining >= 0) return `Consuma una delle ${cap} generazioni di oggi: ne restano ${remaining}.`;
  return `Consuma una delle ${cap} generazioni di oggi.`;
}

type Generated = { url: string; width: number; height: number; ms: number; fileName: string };

const cx = (...values: Array<string | false | undefined>) => values.filter(Boolean).join(" ");

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function messageFor(error: unknown) {
  if (error instanceof DOMException && error.name === "AbortError") {
    return "La generazione ci ha messo troppo e l'ho interrotta. Riprova con un'immagine più piccola.";
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

/** Upright, re-encoded, under the upload limit: the model gets a clean JPEG. */
async function prepare(file: File): Promise<Prepared> {
  const looksAccepted = ACCEPTED.includes(file.type) || /\.(jpe?g|png|webp)$/i.test(file.name);

  if (!looksAccepted) throw new Error("Questo file non è un'immagine JPG, PNG o WEBP.");
  if (file.size > MAX_INPUT_BYTES) throw new Error(`Il file pesa ${formatBytes(file.size)}. Resta sotto i 45 MB.`);

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

  let quality = 0.94;
  let blob = await encode(quality);
  while (blob.size > TARGET_UPLOAD_BYTES && quality > 0.56) {
    quality -= 0.12;
    blob = await encode(quality);
  }

  const prepared = new File([blob], "prompt-input.jpg", { type: "image/jpeg" });

  return { file: prepared, url: URL.createObjectURL(prepared), width, height, name: file.name };
}

export default function PromptLab() {
  const [source, setSource] = useState<Prepared | null>(null);
  const [prompt, setPrompt] = useState("");
  const [generated, setGenerated] = useState<Generated | null>(null);
  const [busy, setBusy] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [status, setStatus] = useState<Status | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const sourceRef = useRef<Prepared | null>(null);
  const generatedRef = useRef<Generated | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  /* The footer states facts about this deploy: read them, never assume them. */
  useEffect(() => {
    fetch("/api/bwslab/status", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((value: Status | null) => setStatus(value))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (sourceRef.current) URL.revokeObjectURL(sourceRef.current.url);
      if (generatedRef.current) URL.revokeObjectURL(generatedRef.current.url);
    };
  }, []);

  /* Real elapsed time: the model takes minutes, a fake bar would lie. */
  useEffect(() => {
    if (!busy) return;
    const started = Date.now();
    const timer = window.setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 500);
    return () => window.clearInterval(timer);
  }, [busy]);

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
    } catch (prepareError) {
      setError(messageFor(prepareError));
    } finally {
      setPreparing(false);
    }
  }, []);

  const run = useCallback(async () => {
    const current = sourceRef.current;
    const instruction = prompt.trim();
    if (!current || instruction.length < 3) return;

    setError(null);
    setElapsed(0);
    setBusy(true);

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
      body.append("prompt", instruction);

      const response = await fetch("/api/bwslab/edit", {
        method: "POST",
        body,
        signal: controller.signal,
      });

      if (!response.ok) {
        const detail = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(detail?.error || `Il server ha risposto ${response.status}.`);
      }

      const url = URL.createObjectURL(await response.blob());
      const size = await loadSize(url);

      const next: Generated = {
        url,
        width: size.width,
        height: size.height,
        ms: Math.round(performance.now() - started),
        fileName: `prompt-press-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.png`,
      };
      generatedRef.current = next;
      setGenerated(next);
    } catch (runError) {
      setError(messageFor(runError));
    } finally {
      window.clearTimeout(timeout);
      abortRef.current = null;
      setBusy(false);
    }
  }, [prompt]);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    if (sourceRef.current) URL.revokeObjectURL(sourceRef.current.url);
    if (generatedRef.current) URL.revokeObjectURL(generatedRef.current.url);
    sourceRef.current = null;
    generatedRef.current = null;
    setSource(null);
    setGenerated(null);
    setError(null);
    setPrompt("");
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
      if (file && !busy) void accept(file);
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [accept, busy]);

  const canRun = Boolean(source) && prompt.trim().length >= 3 && !busy;

  return (
    <div className={styles.root}>
      <div className={styles.shell}>
        <header className={cx("flex flex-wrap items-end justify-between gap-6 pb-6", styles.hairlineBottom)}>
          <div>
            <h1 className={styles.wordmark}>Prompt Press</h1>
            <p className={cx(styles.measure, "mt-3")}>One image. Your words.</p>
          </div>
          <div className="flex flex-wrap items-center gap-4 sm:gap-6">
            <span className={styles.micro}>Testo libero</span>
            <span className={styles.micro}>{MAX_PROMPT} caratteri</span>
            <Link href="/bwslab" className={styles.backLink}>
              ← Stencil Lab
            </Link>
            <Link href="/" className={styles.backLink}>
              ← Bleachwears
            </Link>
          </div>
        </header>

        <section className="grid gap-8 py-8 lg:grid-cols-[1.35fr_1fr] lg:gap-12 lg:py-10">
          <div className="min-w-0">
            {!source ? (
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
                    <span className={styles.smoke}>scrivi cosa cambiare</span>
                  </p>
                  <p className={cx(styles.measure, "mt-5")}>JPG · PNG · WEBP</p>
                  <span className={cx(styles.btn, styles.btnPrimary, "mt-7 inline-flex")}>Carica immagine</span>
                </div>
                <span className={styles.dropzoneHint}>
                  <span>Trascina, incolla o sfoglia</span>
                  <span>Max 45 MB</span>
                </span>
              </div>
            ) : (
              <div className={styles.frame}>
                <div className={cx(styles.canvasPlate, "relative")}>
                  <img
                    src={source.url}
                    alt="Immagine caricata"
                    style={{ opacity: busy ? 0.55 : 1, transition: "opacity 320ms ease" }}
                  />
                  {busy ? <div className={styles.scanline} /> : null}
                  <span className={styles.plateTag}>{busy ? "In lavorazione" : generated ? "Originale" : "Input"}</span>
                </div>
              </div>
            )}

            {busy ? (
              <div className="mt-4 space-y-2">
                <div className={styles.progress}>
                  <div className={styles.progressBar} />
                </div>
                <p className={cx(styles.micro, styles.numeric)}>
                  {elapsed}s · il modello sta disegnando, non chiudere la pagina
                </p>
              </div>
            ) : null}

            {error ? (
              <div className={cx(styles.notice, "mt-4")} role="alert">
                <span className={cx(styles.micro, "pt-[0.15rem]")}>Errore</span>
                <p>{error}</p>
              </div>
            ) : null}

            {generated ? (
              <figure className="mt-6">
                <div className={styles.frame}>
                  <div className={cx(styles.canvasPlate, "relative")}>
                    <img src={generated.url} alt="Immagine modificata" />
                    <span className={styles.plateTag}>Risultato</span>
                  </div>
                </div>
                <figcaption className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <span className={cx(styles.micro, styles.numeric)}>
                    {generated.width} × {generated.height} px · PNG
                  </span>
                  <span className={cx(styles.micro, styles.numeric)}>{(generated.ms / 1000).toFixed(1)} s</span>
                  <a className={cx(styles.btn, styles.btnPrimary)} href={generated.url} download={generated.fileName}>
                    Scarica PNG
                  </a>
                </figcaption>
              </figure>
            ) : null}
          </div>

          <aside className="min-w-0 lg:pt-2">
            <div className="space-y-5">
              <div className="space-y-2">
                <p className={styles.measure}>02 / Istruzione</p>
                <label className={cx(styles.headline, "block")} htmlFor="prompt">
                  Cosa deve cambiare
                </label>
              </div>

              <textarea
                id="prompt"
                className={styles.promptBox}
                value={prompt}
                maxLength={MAX_PROMPT}
                disabled={busy}
                placeholder="Es: trasforma lo sfondo in un tramonto rosso, aggiungi una giacca di pelle, rendi l'immagine un poster anni '70."
                onChange={(event) => setPrompt(event.target.value)}
              />

              <div className="flex items-center justify-between gap-3">
                <span className={cx(styles.micro, styles.numeric)}>
                  {prompt.trim().length} / {MAX_PROMPT}
                </span>
                {source ? (
                  <span className={cx(styles.micro, "truncate")}>
                    {source.name} · {formatBytes(source.file.size)}
                  </span>
                ) : (
                  <span className={styles.micro}>Nessuna immagine</span>
                )}
              </div>

              <div className={styles.dock}>
                <button
                  type="button"
                  className={cx(styles.btn, styles.btnPrimary, styles.btnWide)}
                  onClick={() => void run()}
                  disabled={!canRun}
                >
                  {busy ? `In corso · ${elapsed}s` : "Applica il prompt"}
                </button>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    className={styles.btn}
                    onClick={() => inputRef.current?.click()}
                    disabled={busy}
                  >
                    {source ? "Cambia" : "Carica"}
                  </button>
                  <button
                    type="button"
                    className={cx(styles.btn, styles.btnGhost)}
                    onClick={reset}
                    disabled={busy}
                  >
                    Ricomincia
                  </button>
                </div>
              </div>

              <div className={styles.notice}>
                <p>
                  Il prompt non arriva grezzo al modello: viene prima riscritto in un brief che chiede
                  solo la modifica indicata e lascia intatto il resto dell&apos;immagine.{" "}
                  <strong>{timingLine(status)}</strong> {quotaLine(status)}
                </p>
              </div>
            </div>
          </aside>
        </section>

        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void accept(file);
          }}
        />

        <footer className={cx("flex flex-wrap items-center justify-between gap-3 pt-5", styles.hairlineTop)}>
          <span className={styles.micro}>Elaborata in memoria · mai salvata</span>
          <span className={styles.micro}>Prompt Press · Bleachwears</span>
        </footer>
      </div>
    </div>
  );
}
