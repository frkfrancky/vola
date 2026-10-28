"use client";

import { useRef, useState, useTransition } from "react";
import { addManualExpense } from "@/app/actions/expenses";

type Member = { id: string; name: string };

export function AddExpenseForm({
  householdId,
  members,
  currentUserId,
}: {
  householdId: string;
  members: Member[];
  currentUserId: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const today = new Date().toISOString().slice(0, 10);

  function submit(formData: FormData) {
    startTransition(async () => {
      const result = await addManualExpense(householdId, formData);
      if (result.ok) {
        setError(null);
        formRef.current?.reset();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <form ref={formRef} action={submit} className="card space-y-3">
      <h2 className="font-medium">Ajouter une dépense</h2>
      <input name="description" required maxLength={300} placeholder="Courses, électricité…" className="input" />
      <div className="flex gap-2">
        <input name="amount" required inputMode="decimal" placeholder="Montant €" className="input" />
        <input name="date" type="date" required defaultValue={today} className="input" />
      </div>
      <fieldset className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <legend className="mb-1 text-muted">Pour</legend>
        {members.map((m) => (
          <label key={m.id} className="flex items-center gap-1.5">
            <input type="checkbox" name="participants" value={m.id} defaultChecked />
            {m.id === currentUserId ? "Moi" : m.name}
          </label>
        ))}
      </fieldset>
      {error && <p className="text-sm text-danger">{error}</p>}
      <button className="btn-ghost" disabled={pending}>
        {pending ? "Ajout…" : "Ajouter"}
      </button>
    </form>
  );
}
