import type { Metadata } from "next";
import { socialMetadata } from "@/lib/seo";
import PromptLab from "./PromptLab";

const title = "PROMPT PRESS — Un'immagine, le tue parole | Bleachwears";
const description =
  "Carica un'immagine, scrivi cosa deve cambiare e scarica il risultato: il modello legge la tua istruzione, non uno stile fisso.";

export const metadata: Metadata = {
  title,
  description,
  ...socialMetadata({ title, description, path: "/bwslab/nfsw" }),
};

export default function PromptPressPage() {
  return <PromptLab />;
}
