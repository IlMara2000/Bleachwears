import type { Metadata } from "next";
import PromptLab from "./PromptLab";

export const metadata: Metadata = {
  title: "PROMPT PRESS — Un'immagine, le tue parole | Bleachwears",
  description:
    "Carica un'immagine, scrivi cosa deve cambiare e scarica il risultato: il modello legge la tua istruzione, non uno stile fisso.",
};

export default function PromptPressPage() {
  return <PromptLab />;
}
