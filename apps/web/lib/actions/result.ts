import "server-only";
import { mapDbError, type DbErrorLike, type ErrorCode } from "@memories/shared";
import type { z } from "zod";

/** Rezultatul oricărei Server Action: niciodată excepții brute către client (contracts/web-interface.md). */
export type ActionResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: ErrorCode;
      retryAfterSec?: number;
      fields?: Record<string, ErrorCode>;
      detail?: Record<string, unknown>;
    };

export class ActionError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly detail: Record<string, unknown> = {},
  ) {
    super(code);
  }
}

/** Aruncă ActionError din eroarea Supabase, dacă există. */
export function throwIfDbError(error: DbErrorLike | null): void {
  if (error) {
    const mapped = mapDbError(error);
    throw new ActionError(mapped.code, mapped.detail);
  }
}

function fieldErrors(issues: z.core.$ZodIssue[]): Record<string, ErrorCode> {
  const fields: Record<string, ErrorCode> = {};
  for (const issue of issues) {
    const path = issue.path.join(".");
    const code = typeof issue.message === "string" && issue.message.length > 0 && /^[A-Z_]+$/.test(issue.message)
      ? (issue.message as ErrorCode)
      : "VALIDATION";
    fields[path] ??= code;
  }
  return fields;
}

/** Validează intrarea cu zod, rulează acțiunea și mapează erorile la coduri stabile. */
export async function runAction<S extends z.ZodType, T>(
  schema: S,
  input: unknown,
  action: (data: z.infer<S>) => Promise<T>,
): Promise<ActionResult<T>> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "VALIDATION", fields: fieldErrors(parsed.error.issues) };
  }
  try {
    return { ok: true, data: await action(parsed.data) };
  } catch (error) {
    if (error instanceof ActionError) {
      const retry = error.detail.retryAfterSec;
      return {
        ok: false,
        error: error.code,
        detail: error.detail,
        ...(typeof retry === "number" ? { retryAfterSec: retry } : {}),
      };
    }
    // Next.js folosește excepții pentru redirect()/notFound(); le lăsăm să treacă.
    if (error instanceof Error && "digest" in error) throw error;
    console.error(error);
    return { ok: false, error: "INTERNAL" };
  }
}
