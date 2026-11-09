import Link from "next/link";
import type { ReactNode } from "react";

export function LegalShell({
  kicker,
  title,
  updated,
  children,
}: {
  kicker: string;
  title: string;
  updated: string;
  children: ReactNode;
}) {
  return (
    <div className="legal-page">
      <header className="legal-top">
        <Link href="/" className="legal-brand">
          <span className="legal-mark" aria-hidden="true"><i /><i /><i /><i /></span>
          bleachwears
        </Link>
        <Link href="/" className="legal-back">Torna al sito <span aria-hidden="true">→</span></Link>
      </header>

      <main className="legal-body">
        <span className="section-kicker">{kicker}</span>
        <h1>{title}</h1>
        <p className="legal-updated">Ultimo aggiornamento: {updated}</p>

        {children}

        <nav className="legal-nav" aria-label="Altre informazioni">
          <Link href="/legale/termini">Termini di vendita</Link>
          <Link href="/legale/spedizioni-e-resi">Spedizioni e resi</Link>
          <Link href="/legale/privacy">Privacy</Link>
          <a href="https://www.instagram.com/bleach_wears/" target="_blank" rel="noopener noreferrer">@bleach_wears ↗</a>
        </nav>
      </main>

      <footer className="legal-foot">
        <span>Fatto a mano in Italia · © 2026 Bleachwears</span>
        <Link href="/">bleachwears.vercel.app</Link>
      </footer>
    </div>
  );
}
