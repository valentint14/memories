function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === "") throw new Error(`Lipsește variabila de mediu ${name}`);
  return value;
}

export const config = {
  get databaseUrl(): string {
    return required("DATABASE_URL");
  },
  get supabaseUrl(): string {
    return required("SUPABASE_URL");
  },
  get serviceRoleKey(): string {
    return required("SUPABASE_SERVICE_ROLE_KEY");
  },
  get s3(): { endpoint: string; region: string; accessKeyId: string; secretAccessKey: string } {
    return {
      endpoint: required("S3_ENDPOINT"),
      region: process.env.S3_REGION ?? "local",
      accessKeyId: required("S3_ACCESS_KEY_ID"),
      secretAccessKey: required("S3_SECRET_ACCESS_KEY"),
    };
  },
  get smtp(): { host: string; port: number; user: string | undefined; pass: string | undefined; from: string } {
    return {
      host: required("SMTP_HOST"),
      port: Number(required("SMTP_PORT")),
      user: process.env.SMTP_USER || undefined,
      pass: process.env.SMTP_PASS || undefined,
      from: required("SMTP_FROM"),
    };
  },
  get appUrl(): string {
    return required("APP_URL");
  },
  sentryDsn: process.env.SENTRY_DSN,
};
