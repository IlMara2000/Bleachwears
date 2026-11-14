/**
 * The prompt compiler.
 *
 * A model never receives the sentence the user typed. It receives a brief: the
 * user's words kept verbatim inside it, the invariants spelled out, and the
 * shape that specific model follows best. Three image models do not read the
 * same prose the same way — FLUX ignores long narrative, Qwen-Image-Edit obeys
 * a single directive and drifts when given a list of "don'ts", Gemini handles
 * structure.
 *
 * Deterministic on purpose: no second model, no extra cost, no extra latency,
 * and the same input always compiles to the same prompt.
 */

export type PromptProvider = "local" | "gemini" | "cloudflare";

/** Mirrors the route's own limit: the brief is built from at most this much. */
export const MAX_INTENT_CHARS = 600;

const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g;

/**
 * Normalises without rewriting: the user's meaning must survive intact, so
 * only whitespace and control characters are touched.
 */
function normalise(raw: string): string {
  return raw
    .replace(CONTROL_CHARS, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_INTENT_CHARS);
}

/**
 * The instruction is data, not structure: quotes and newlines inside it must
 * not be able to open or close the brief around it.
 */
function quoted(intent: string): string {
  return intent.replace(/["\u201C\u201D]/g, "'");
}

/**
 * Ends the instruction so the next clause cannot be read as part of it: without
 * a delimiter "rendi il cielo rosso" merges into "Change only what that names".
 */
function terminator(intent: string): string {
  return /[.!?;:]$/.test(intent) ? intent : `${intent}.`;
}

/** What must hold for every edit, whatever the user asked for. */
const INVARIANTS = [
  "Keep the subject's identity, face, body proportions and pose unchanged unless the instruction explicitly asks to change them.",
  "Keep the original framing, camera angle and aspect ratio.",
  "Do not add text, captions, watermarks, borders or objects the instruction did not ask for.",
  "Return one finished image, not a description of it.",
];

/**
 * Qwen-Image-Edit (local, GGUF + 4-step LoRA): a single imperative line
 * followed by "change only this" works; a long list of prohibitions makes the
 * small quantised model wander.
 */
function localBrief(intent: string): string {
  return [
    `Edit the input image: ${terminator(intent)}`,
    "Change only what that sentence names; everything else stays exactly as in the input.",
    ...INVARIANTS,
  ].join(" ");
}

/**
 * Gemini: tolerates structure, so each rule gets its own line and the request
 * is stated once, plainly, before the constraints.
 */
function geminiBrief(intent: string): string {
  return [
    "Edit the attached photograph as an image editor, not as a writer.",
    `Requested change: ${terminator(intent)}`,
    "",
    "Rules:",
    ...INVARIANTS.map((rule) => `- ${rule}`),
    "- Keep photographic quality and natural light where the instruction does not ask otherwise.",
  ].join("\n");
}

/**
 * FLUX (Cloudflare Workers AI) weights the opening tokens heavily: one dense
 * paragraph, directive first, constraints compressed to their shortest form.
 */
function cloudflareBrief(intent: string): string {
  return [
    `Edit the input image: ${terminator(intent)}`,
    "Change only that; preserve the identity, face, pose and framing of the subject,",
    "keep the aspect ratio, add no text or watermark, and return one finished image.",
  ].join(" ");
}

const BRIEFS: Record<PromptProvider, (intent: string) => string> = {
  local: localBrief,
  gemini: geminiBrief,
  cloudflare: cloudflareBrief,
};

export type CompiledPrompt = {
  /** The text that actually goes to the model. */
  text: string;
  /** The user's instruction, normalised, kept for logs and for the UI. */
  intent: string;
};

/**
 * Compiles a user instruction into the prompt for one provider. An empty
 * instruction is a caller bug, and it compiles to an empty brief rather than
 * to some silent default.
 */
export function compileEditPrompt(raw: string, provider: PromptProvider): CompiledPrompt {
  const intent = normalise(raw);

  if (!intent) return { text: "", intent: "" };

  return { text: BRIEFS[provider](quoted(intent)), intent };
}
