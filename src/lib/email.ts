/**
 * Transactional email (PRD §14: order updates, proof status, completion).
 * Sent over SMTP with nodemailer. Every attempt is written to email_log so
 * staff can see what went out — and a mail failure never breaks an order.
 */
import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { adminClient } from "@/lib/supabase/server";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
export const STUDIO_EMAIL = process.env.EMAIL_FROM?.match(/<(.+)>/)?.[1] ?? process.env.SMTP_USER ?? "";

let transport: Transporter | null = null;
function getTransport() {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) return null;
  transport ??= nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 465),
    secure: Number(process.env.SMTP_PORT ?? 465) === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  return transport;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** One plain, readable layout for every message. */
function layout(heading: string, paragraphs: string[], cta?: { label: string; path: string }) {
  const body = paragraphs.map((p) => `<p style="margin:0 0 14px;line-height:1.5">${esc(p)}</p>`).join("");
  const button = cta ? `<p style="margin:22px 0"><a href="${APP_URL}${cta.path}" style="background:#C4105F;color:#fff;padding:11px 18px;border-radius:6px;text-decoration:none;font-weight:600">${esc(cta.label)}</a></p>` : "";
  return `<div style="font-family:Arial,sans-serif;color:#1B1F24;max-width:560px;margin:0 auto;padding:24px">
    <p style="font-weight:700;font-size:15px;margin:0 0 20px">Digital Heroes Print</p>
    <h1 style="font-size:20px;margin:0 0 16px">${esc(heading)}</h1>${body}${button}
    <p style="color:#5B6470;font-size:12px;margin-top:28px">You are receiving this because you placed an order with Digital Heroes Print.</p></div>`;
}

export interface Mail { to: string; template: string; orderId?: string | null; subject: string; heading: string; paragraphs: string[]; cta?: { label: string; path: string } }

export async function sendEmail(mail: Mail): Promise<void> {
  const db = adminClient();
  const t = getTransport();
  let status: "sent" | "failed" | "skipped" = "skipped";
  let error: string | null = t ? null : "SMTP is not configured";
  if (t && mail.to) {
    try {
      await t.sendMail({
        from: process.env.EMAIL_FROM ?? process.env.SMTP_USER,
        to: mail.to,
        subject: mail.subject,
        text: [mail.heading, ...mail.paragraphs, mail.cta ? `${mail.cta.label}: ${APP_URL}${mail.cta.path}` : ""].join("\n\n"),
        html: layout(mail.heading, mail.paragraphs, mail.cta),
      });
      status = "sent";
    } catch (e) {
      status = "failed";
      error = e instanceof Error ? e.message.slice(0, 500) : "unknown error";
    }
  }
  await db.from("email_log").insert({ to_email: mail.to || "(none)", template: mail.template, order_id: mail.orderId ?? null, status, error });
}
