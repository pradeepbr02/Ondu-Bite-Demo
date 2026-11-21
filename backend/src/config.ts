import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  MONGODB_URI: z.string().regex(/^mongodb(\+srv)?:\/\//),
  CORS_ORIGIN: z.url().default('http://localhost:3000'),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
  GEMINI_API_KEY: z.string().trim().optional(),
  GEMINI_MODEL: z
    .string()
    .regex(/^gemini-[a-z0-9.-]+$/)
    .default('gemini-3.1-flash-lite'),
});

export function readConfig() {
  const parsed = schema.safeParse(process.env);
  // Never print database URIs, which may contain credentials.
  if (!parsed.success)
    throw new Error(
      `Invalid environment fields: ${parsed.error.issues.map((i) => i.path.join('.')).join(', ')}`,
    );
  return parsed.data;
}
