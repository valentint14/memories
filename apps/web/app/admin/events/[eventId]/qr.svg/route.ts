import { errorResponse, qrSvg, uploadUrlForAdmin } from "@/lib/admin/qr";

/** Codul QR vectorial, pentru tipografie (FR-005). */
export async function GET(_request: Request, { params }: { params: Promise<{ eventId: string }> }): Promise<Response> {
  const { eventId } = await params;
  try {
    const svg = await qrSvg(await uploadUrlForAdmin(eventId));
    return new Response(svg, {
      headers: {
        "Content-Type": "image/svg+xml; charset=utf-8",
        "Content-Disposition": `attachment; filename="qr-${eventId.slice(0, 8)}.svg"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
