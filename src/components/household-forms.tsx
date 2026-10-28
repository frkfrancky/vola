"use client";

import { useActionState } from "react";
import type { FormState } from "@/app/actions/auth";
import { createHousehold, joinHousehold } from "@/app/actions/households";

export function CreateHouseholdForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(createHousehold, undefined);
  return (
    <form action={action} className="card space-y-3">
      <h2 className="font-medium">Créer un compte partagé</h2>
      <p className="text-sm text-muted">Par exemple « Appart rue Oberkampf ». Tu pourras inviter tes colocs ensuite.</p>
      <input name="name" required maxLength={60} placeholder="Nom du compte" className="input" />
      {state?.error && <p className="text-sm text-danger">{state.error}</p>}
      <button className="btn-primary" disabled={pending}>
        Créer
      </button>
    </form>
  );
}

export function JoinHouseholdForm({ defaultCode }: { defaultCode?: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(joinHousehold, undefined);
  return (
    <form action={action} className="card space-y-3">
      <h2 className="font-medium">Rejoindre un compte</h2>
      <p className="text-sm text-muted">Saisis le code d&apos;invitation qu&apos;un coloc t&apos;a envoyé.</p>
      <input
        name="code"
        required
        defaultValue={defaultCode}
        placeholder="ABCD2345"
        className="input font-mono uppercase tracking-widest"
      />
      {state?.error && <p className="text-sm text-danger">{state.error}</p>}
      <button className="btn-ghost" disabled={pending}>
        Rejoindre
      </button>
    </form>
  );
}
