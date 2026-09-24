import { EVENT_NAME_MAX, MAX_FILES_PER_GUEST_LIMIT, MAX_PHOTO_BYTES, MAX_VIDEO_BYTES, leiToMinor } from "@memories/shared";
import { z } from "zod";

const MB = 1024 * 1024;

/** Datele unui eveniment introduse de administrator (FR-001, FR-001a, FR-002, FR-039). */
export const eventInputSchema = z
  .object({
    name: z.string().trim().min(1, "validation.required").max(EVENT_NAME_MAX, "validation.nameTooLong"),
    eventDate: z.iso.date("validation.date"),
    organizerEmail: z.string().trim().toLowerCase().pipe(z.email("validation.email")),
    uploadStartsAt: z.iso.datetime({ offset: true, message: "validation.datetime" }),
    uploadEndsAt: z.iso.datetime({ offset: true, message: "validation.datetime" }),
    maxFilesPerGuest: z.coerce
      .number("validation.maxFiles")
      .int("validation.maxFiles")
      .min(1, "validation.maxFiles")
      .max(MAX_FILES_PER_GUEST_LIMIT, "validation.maxFiles"),
    maxPhotoMb: z.coerce
      .number("validation.maxPhotoMb")
      .positive("validation.maxPhotoMb")
      .max(MAX_PHOTO_BYTES / MB, "validation.maxPhotoMb"),
    maxVideoMb: z.coerce
      .number("validation.maxVideoMb")
      .positive("validation.maxVideoMb")
      .max(MAX_VIDEO_BYTES / MB, "validation.maxVideoMb"),
    basePriceLei: z.coerce.number("validation.price").min(0, "validation.price").max(1_000_000, "validation.price"),
    retentionOptionId: z.uuid("validation.option"),
  })
  .superRefine((value, ctx) => {
    if (new Date(value.uploadEndsAt) <= new Date(value.uploadStartsAt)) {
      ctx.addIssue({ code: "custom", path: ["uploadEndsAt"], message: "validation.endBeforeStart" });
    }
  })
  .transform((value) => ({
    name: value.name,
    eventDate: value.eventDate,
    organizerEmail: value.organizerEmail,
    uploadStartsAt: value.uploadStartsAt,
    uploadEndsAt: value.uploadEndsAt,
    maxFilesPerGuest: value.maxFilesPerGuest,
    maxPhotoBytes: Math.min(Math.round(value.maxPhotoMb * MB), MAX_PHOTO_BYTES),
    maxVideoBytes: Math.min(Math.round(value.maxVideoMb * MB), MAX_VIDEO_BYTES),
    basePriceMinor: leiToMinor(value.basePriceLei),
    retentionOptionId: value.retentionOptionId,
  }));

export type EventInput = z.input<typeof eventInputSchema>;
export type EventData = z.output<typeof eventInputSchema>;
