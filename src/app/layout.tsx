import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { logout } from "./actions/auth";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Vola — les comptes entre colocs",
  description: "Importe tes relevés Revolut et partage les dépenses de la coloc.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const user = await getCurrentUser();

  return (
    <html lang="fr" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans">
        <header className="border-b border-border bg-card">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
            <Link href="/" className="text-lg font-semibold tracking-tight">
              Vola<span className="text-accent">.</span>
            </Link>
            {user && (
              <form action={logout} className="flex items-center gap-3 text-sm">
                <Link href="/account" className="text-muted hover:text-foreground">
                  {user.name}
                </Link>
                <button className="btn-ghost py-1.5">Déconnexion</button>
              </form>
            )}
          </div>
        </header>
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
