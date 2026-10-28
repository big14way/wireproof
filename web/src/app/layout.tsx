import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "WireProof",
  description: "Proof your wiring is safe before the plaster goes on.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans">
        <header className="no-print bg-ink text-white">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
            <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
              <span aria-hidden className="grid h-7 w-7 place-items-center rounded-md bg-copper text-sm">⚡</span>
              WireProof
            </Link>
            <nav className="flex gap-4 text-sm text-white/80">
              <Link href="/jobs/demo" className="hover:text-white">Demo job</Link>
              <Link href="/jobs/demo/copilot" className="hover:text-white">Copilot</Link>
              <Link href="/jobs/demo/walls" className="hover:text-white">Wall map</Link>
              <Link href="/panel" className="hover:text-white">Read a panel</Link>
            </nav>
          </div>
        </header>
        <main className="flex-1">{children}</main>
        <footer className="no-print border-t border-line px-4 py-6 text-center text-xs text-muted">
          Screening, not certification. A licensed electrician signs off every job. Built on Meta&apos;s models for the
          Meta Global AI Developer Hackathon.
        </footer>
      </body>
    </html>
  );
}
