import { createReadStream, createWriteStream } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { s3, type Bucket } from "./client.ts";

/** Descarcă un obiect în streaming pe disc (fără a-l ține în memorie — principiul IV). */
export async function downloadToFile(bucket: Bucket, key: string, path: string): Promise<void> {
  const res = await s3().send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  if (!(res.Body instanceof Readable)) throw new Error("corp S3 neașteptat");
  await pipeline(res.Body, createWriteStream(path));
}

/** Încarcă un fișier sau un buffer; multipart în streaming pentru fișiere mari. */
export async function uploadObject(
  bucket: Bucket,
  key: string,
  body: Buffer | { path: string },
  contentType: string,
): Promise<void> {
  const upload = new Upload({
    client: s3(),
    params: {
      Bucket: bucket,
      Key: key,
      Body: Buffer.isBuffer(body) ? body : createReadStream(body.path),
      ContentType: contentType,
      CacheControl: "private, max-age=3600",
    },
    partSize: 16 * 1024 * 1024,
    queueSize: 2,
  });
  await upload.done();
}
