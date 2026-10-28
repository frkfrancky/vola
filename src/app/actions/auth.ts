"use server";

import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { and, eq, gt, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { passwordResetTokens, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { sendMail } from "@/lib/mail";
import { createSession, deleteSession } from "@/lib/session";

export type FormState = { error?: string; success?: string } | undefined;

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;
const RESET_RESEND_DELAY_MS = 2 * 60 * 1000;

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

/** URL publique de l'app. Jamais déduite de l'en-tête Host, qui peut être falsifié. */
function appUrl() {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return "http://localhost:3000";
}

function checkNewPassword(password: string, confirm: string): string | null {
  if (password.length < 8) return "Le mot de passe doit faire au moins 8 caractères.";
  if (password !== confirm) return "Les deux mots de passe ne correspondent pas.";
  return null;
}

/** N'accepte que des chemins internes, pour éviter les redirections ouvertes. */
function safeNext(value: FormDataEntryValue | null) {
  const next = typeof value === "string" ? value : "";
  return next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

export async function register(_: FormState, formData: FormData): Promise<FormState> {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!name || name.length > 50) return { error: "Indique un prénom (50 caractères max)." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Adresse e-mail invalide." };
  if (password.length < 8) return { error: "Le mot de passe doit faire au moins 8 caractères." };

  const db = getDb();
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (existing) return { error: "Un compte existe déjà avec cette adresse." };

  const [user] = await db
    .insert(users)
    .values({ name, email, passwordHash: await bcrypt.hash(password, 10) })
    .returning({ id: users.id });

  await createSession(user.id);
  redirect(safeNext(formData.get("next")));
}

export async function login(_: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  const [user] = await getDb().select().from(users).where(eq(users.email, email));
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return { error: "E-mail ou mot de passe incorrect." };
  }

  await createSession(user.id);
  redirect(safeNext(formData.get("next")));
}

export async function logout() {
  await deleteSession();
  redirect("/login");
}

export async function requestPasswordReset(_: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const done = { success: "Si un compte existe avec cette adresse, un e-mail avec un lien vient de t'être envoyé." };

  const db = getDb();
  const [user] = await db.select({ id: users.id, name: users.name }).from(users).where(eq(users.email, email));
  if (!user) return done;

  // Évite d'envoyer plusieurs e-mails d'affilée.
  const [recent] = await db
    .select({ expiresAt: passwordResetTokens.expiresAt })
    .from(passwordResetTokens)
    .where(
      and(
        eq(passwordResetTokens.userId, user.id),
        isNull(passwordResetTokens.usedAt),
        gt(passwordResetTokens.expiresAt, new Date(Date.now() + RESET_TOKEN_TTL_MS - RESET_RESEND_DELAY_MS)),
      ),
    );
  if (recent) return done;

  const token = randomBytes(32).toString("base64url");
  await db.insert(passwordResetTokens).values({
    tokenHash: hashToken(token),
    userId: user.id,
    expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
  });

  const link = `${appUrl()}/reset-password/${token}`;
  try {
    await sendMail({
      to: email,
      subject: "Réinitialiser ton mot de passe Vola",
      text: `Bonjour ${user.name},

Pour choisir un nouveau mot de passe, ouvre ce lien (valable 1 heure) :
${link}

Si tu n'es pas à l'origine de cette demande, ignore cet e-mail.`,
      html: `<p>Bonjour ${escapeHtml(user.name)},</p><p>Pour choisir un nouveau mot de passe, clique sur ce lien (valable 1 heure) :</p><p><a href="${link}">Réinitialiser mon mot de passe</a></p><p>Si tu n'es pas à l'origine de cette demande, ignore cet e-mail.</p>`,
    });
  } catch (err) {
    console.error(err);
    return { error: "L'e-mail n'a pas pu être envoyé. Réessaie plus tard." };
  }
  return done;
}

export async function resetPassword(_: FormState, formData: FormData): Promise<FormState> {
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const invalid = checkNewPassword(password, String(formData.get("confirm") ?? ""));
  if (invalid) return { error: invalid };

  const db = getDb();
  const [row] = await db
    .select({ userId: passwordResetTokens.userId })
    .from(passwordResetTokens)
    .where(
      and(
        eq(passwordResetTokens.tokenHash, hashToken(token)),
        isNull(passwordResetTokens.usedAt),
        gt(passwordResetTokens.expiresAt, new Date()),
      ),
    );
  if (!row) return { error: "Ce lien a expiré ou a déjà été utilisé. Refais une demande." };

  const now = new Date();
  await db.batch([
    db
      .update(users)
      .set({ passwordHash: await bcrypt.hash(password, 10), passwordChangedAt: now })
      .where(eq(users.id, row.userId)),
    db.update(passwordResetTokens).set({ usedAt: now }).where(eq(passwordResetTokens.userId, row.userId)),
  ]);

  await createSession(row.userId);
  redirect("/");
}

export async function changePassword(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const current = String(formData.get("current") ?? "");
  const password = String(formData.get("password") ?? "");
  const invalid = checkNewPassword(password, String(formData.get("confirm") ?? ""));
  if (invalid) return { error: invalid };

  const db = getDb();
  const [row] = await db.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, user.id));
  if (!row || !(await bcrypt.compare(current, row.passwordHash))) {
    return { error: "Mot de passe actuel incorrect." };
  }

  await db
    .update(users)
    .set({ passwordHash: await bcrypt.hash(password, 10), passwordChangedAt: new Date() })
    .where(eq(users.id, user.id));
  // Les autres appareils sont déconnectés ; celui-ci reçoit une nouvelle session.
  await createSession(user.id);
  return { success: "Mot de passe modifié." };
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
