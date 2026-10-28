import "server-only";
import nodemailer from "nodemailer";

export function isMailConfigured() {
  return Boolean(process.env.SMTP_USER && process.env.SMTP_PASS);
}

/** Envoie un e-mail via SMTP (Gmail par défaut). Sans configuration, l'affiche dans la console en dev. */
export async function sendMail({ to, subject, text, html }: { to: string; subject: string; text: string; html: string }) {
  if (!isMailConfigured()) {
    if (process.env.NODE_ENV !== "production") {
      console.log(`\n[mail non configuré] À : ${to}\nSujet : ${subject}\n${text}\n`);
      return;
    }
    throw new Error("L'envoi d'e-mails n'est pas configuré (SMTP_USER / SMTP_PASS).");
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: Number(process.env.SMTP_PORT || 465),
    secure: Number(process.env.SMTP_PORT || 465) === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  await transporter.sendMail({
    from: process.env.MAIL_FROM || `Vola <${process.env.SMTP_USER}>`,
    to,
    subject,
    text,
    html,
  });
}
