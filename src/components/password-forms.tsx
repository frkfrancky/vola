"use client";

import Link from "next/link";
import { useActionState } from "react";
import { changePassword, requestPasswordReset, resetPassword, type FormState } from "@/app/actions/auth";

function Feedback({ state }: { state: FormState }) {
  if (state?.error) return <p className="text-sm text-danger">{state.error}</p>;
  if (state?.success) return <p className="text-sm text-accent">{state.success}</p>;
  return null;
}

function NewPasswordFields() {
  return (
    <>
      <label className="block space-y-1 text-sm">
        <span>Nouveau mot de passe</span>
        <input name="password" type="password" required minLength={8} className="input" autoComplete="new-password" />
      </label>
      <label className="block space-y-1 text-sm">
        <span>Confirme le nouveau mot de passe</span>
        <input name="confirm" type="password" required minLength={8} className="input" autoComplete="new-password" />
      </label>
    </>
  );
}

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(requestPasswordReset, undefined);
  return (
    <div className="mx-auto max-w-sm">
      <h1 className="mb-2 text-2xl font-semibold">Mot de passe oublié</h1>
      <p className="mb-6 text-sm text-muted">Indique ton adresse e-mail : on t&apos;envoie un lien pour en choisir un nouveau.</p>
      <form action={action} className="card space-y-4">
        <label className="block space-y-1 text-sm">
          <span>E-mail</span>
          <input name="email" type="email" required className="input" autoComplete="email" />
        </label>
        <Feedback state={state} />
        <button className="btn-primary w-full" disabled={pending}>
          {pending ? "Envoi…" : "Envoyer le lien"}
        </button>
      </form>
      <p className="mt-4 text-center text-sm">
        <Link href="/login" className="text-accent underline">
          Retour à la connexion
        </Link>
      </p>
    </div>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(resetPassword, undefined);
  return (
    <div className="mx-auto max-w-sm">
      <h1 className="mb-6 text-2xl font-semibold">Nouveau mot de passe</h1>
      <form action={action} className="card space-y-4">
        <input type="hidden" name="token" value={token} />
        <NewPasswordFields />
        <Feedback state={state} />
        <button className="btn-primary w-full" disabled={pending}>
          {pending ? "…" : "Enregistrer et me connecter"}
        </button>
      </form>
      {state?.error && (
        <p className="mt-4 text-center text-sm">
          <Link href="/forgot-password" className="text-accent underline">
            Demander un nouveau lien
          </Link>
        </p>
      )}
    </div>
  );
}

export function ChangePasswordForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(changePassword, undefined);
  return (
    <form action={action} className="card space-y-4">
      <h2 className="font-medium">Changer de mot de passe</h2>
      <label className="block space-y-1 text-sm">
        <span>Mot de passe actuel</span>
        <input name="current" type="password" required className="input" autoComplete="current-password" />
      </label>
      <NewPasswordFields />
      <p className="text-xs text-muted">Tes autres appareils seront déconnectés.</p>
      <Feedback state={state} />
      <button className="btn-primary" disabled={pending}>
        {pending ? "…" : "Changer le mot de passe"}
      </button>
    </form>
  );
}
