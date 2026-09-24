import nodemailer, { type Transporter } from "nodemailer";
import { config } from "../config.ts";

let transporter: Transporter | undefined;

/** SMTP: Resend `eu-west-1` în producție, Mailpit local și în CI (research.md R4, R17). */
export function transport(): Transporter {
  if (!transporter) {
    const smtp = config.smtp;
    transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.port === 465,
      ...(smtp.user && smtp.pass ? { auth: { user: smtp.user, pass: smtp.pass } } : {}),
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
    });
  }
  return transporter;
}

/** Pentru teste: forțează recrearea transportului după schimbarea configurației. */
export function resetTransport(): void {
  transporter?.close();
  transporter = undefined;
}

export async function sendMail(message: { to: string; subject: string; text: string; html: string }): Promise<void> {
  await transport().sendMail({ from: config.smtp.from, ...message });
}
