import "server-only";
import QRCode from "qrcode";
import { ActionError } from "../actions/result";
import { serverEnv } from "../server-env";
import { requireAdmin } from "./guard";

/** Parametrii codului QR (contracts/web-interface.md › Route Handlers, FR-005). */
const QR_OPTIONS = { errorCorrectionLevel: "Q", margin: 4 } as const;
export const QR_PNG_SIZE = 2400;

export async function uploadUrlForAdmin(eventId: string): Promise<string> {
  const supabase = await requireAdmin();
  const { data, error } = await supabase.rpc("admin_event_token", { p_event_id: eventId });
  if (error || !data) throw new ActionError(error?.message === "FORBIDDEN" ? "FORBIDDEN" : "NOT_FOUND");
  return new URL(`/e/${data}`, serverEnv.appUrl).toString();
}

export function qrSvg(url: string): Promise<string> {
  return QRCode.toString(url, { ...QR_OPTIONS, type: "svg" });
}

export function qrPng(url: string): Promise<Buffer> {
  return QRCode.toBuffer(url, { ...QR_OPTIONS, type: "png", width: QR_PNG_SIZE });
}

export function errorResponse(error: unknown): Response {
  if (error instanceof ActionError) {
    return new Response(null, { status: error.code === "FORBIDDEN" ? 403 : 404 });
  }
  throw error;
}
