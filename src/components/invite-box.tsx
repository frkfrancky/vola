"use client";

import { useState } from "react";

export function InviteBox({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    await navigator.clipboard.writeText(`${window.location.origin}/join/${code}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-muted">Code d&apos;invitation</span>
      <code className="rounded-md border border-border bg-card px-2 py-1 font-mono tracking-widest">{code}</code>
      <button type="button" onClick={copyLink} className="btn-ghost py-1">
        {copied ? "Lien copié ✓" : "Copier le lien"}
      </button>
    </div>
  );
}
