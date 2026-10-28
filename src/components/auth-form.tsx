"use client";

import Link from "next/link";
import { useActionState } from "react";
import { login, register, type FormState } from "@/app/actions/auth";

export function AuthForm({ mode, next }: { mode: "login" | "register"; next?: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    mode === "login" ? login : register,
    undefined,
  );
  const query = next ? `?next=${encodeURIComponent(next)}` : "";

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="mb-6 text-2xl font-semibold">{mode === "login" ? "Connexion" : "Créer un compte"}</h1>
      <form action={action} className="card space-y-4">
        <input type="hidden" name="next" value={next ?? ""} />
        {mode === "register" && (
          <label className="block space-y-1 text-sm">
            <span>Prénom</span>
            <input name="name" required maxLength={50} className="input" autoComplete="given-name" />
          </label>
        )}
        <label className="block space-y-1 text-sm">
          <span>E-mail</span>
          <input name="email" type="email" required className="input" autoComplete="email" />
        </label>
        <label className="block space-y-1 text-sm">
          <span>Mot de passe</span>
          <input
            name="password"
            type="password"
            required
            minLength={mode === "register" ? 8 : undefined}
            className="input"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
          />
        </label>
        {mode === "login" && (
          <Link href="/forgot-password" className="block text-right text-xs text-muted underline">
            Mot de passe oublié ?
          </Link>
        )}
        {state?.error && <p className="text-sm text-danger">{state.error}</p>}
        <button className="btn-primary w-full" disabled={pending}>
          {pending ? "…" : mode === "login" ? "Se connecter" : "Créer mon compte"}
        </button>
      </form>
      <p className="mt-4 text-center text-sm text-muted">
        {mode === "login" ? (
          <>
            Pas encore de compte ?{" "}
            <Link href={`/register${query}`} className="text-accent underline">
              Inscris-toi
            </Link>
          </>
        ) : (
          <>
            Déjà inscrit ?{" "}
            <Link href={`/login${query}`} className="text-accent underline">
              Connecte-toi
            </Link>
          </>
        )}
      </p>
    </div>
  );
}
