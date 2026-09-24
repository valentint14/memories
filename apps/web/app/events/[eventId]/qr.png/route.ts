import { errorResponse, qrPng } from "@/lib/admin/qr";
import { uploadUrlForOrganizer } from "@/lib/organizer/qr";

/** Codul QR al evenimentului propriu, PNG 2400×2400 px (001/FR-005, 002/FR-009). */
export async function GET(_request: Request, { params }: { params: Promise<{ eventId: string }> }): Promise<Response> {
  const { eventId } = await params;
  try {
    const png = await qrPng(await uploadUrlForOrganizer(eventId));
    return new Response(new Uint8Array(png), {
      headers: {
        "Content-Type": "image/png",
        "Content-Disposition": `attachment; filename="qr-${eventId.slice(0, 8)}.png"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
