import { S3Client } from "@aws-sdk/client-s3";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "../config.ts";

let s3Client: S3Client | undefined;
let supabaseClient: SupabaseClient | undefined;

/** S3 pe endpoint-ul Supabase Storage — pentru streaming (GetObject, upload multipart). */
export function s3(): S3Client {
  const c = config.s3;
  s3Client ??= new S3Client({
    endpoint: c.endpoint,
    region: c.region,
    forcePathStyle: true,
    credentials: { accessKeyId: c.accessKeyId, secretAccessKey: c.secretAccessKey },
  });
  return s3Client;
}

/** Client service role: Storage API (remove/list) și Auth admin. */
export function supabase(): SupabaseClient {
  supabaseClient ??= createClient(config.supabaseUrl, config.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return supabaseClient;
}

export type Bucket = "incoming" | "media" | "archives";
