import { errorResponse, qrPng, uploadUrlForAdmin } from "@/lib/admin/qr";

/** Codul QR la rezoluție de tipar: PNG 2400×2400 px (FR-005). */
export async function GET(_request: Request, { params }: { params: Promise<{ eventId: string }> }): Promise<Response> {
  const { eventId } = await params;
  try {
    const png = await qrPng(await uploadUrlForAdmin(eventId));
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
