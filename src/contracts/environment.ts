import { existsSync } from 'node:fs';
import { join } from 'node:path';
import * as z from 'zod';
import { factoryRoot } from '../core/paths.ts';
import { fail, ok, type Result } from '../core/result.ts';

/** Local settings and secrets. Gitignored. */
export const envFile = join(factoryRoot, '.env');

const requiredString = () => z.string({ error: 'is not set' }).min(1, { error: 'is empty' });

/**
 * Settings the factory reads from the environment, usually via .env.
 * The values are secrets: never log them, and never parse with reportInput.
 */
export const environmentSchema = z.object({
  /** Pays for the model calls made by the factory's agent. */
  OPENROUTER_API_KEY: requiredString(),
  /** The dedicated test account the harness signs in to Excel for the web with. */
  MICROSOFT_ACCOUNT_EMAIL: z.email({
    error: (issue) => (issue.input === undefined ? 'is not set' : 'is not an email address'),
  }),
  MICROSOFT_ACCOUNT_PASSWORD: requiredString(),
});

export type Environment = z.output<typeof environmentSchema>;

/** Loads .env into process.env if it exists. Variables that are already set win. */
export function loadEnvFile(): void {
  if (existsSync(envFile)) process.loadEnvFile(envFile);
}

export function readEnvironment(): Result<Environment> {
  const parsed = environmentSchema.safeParse(process.env);
  if (parsed.success) return ok(parsed.data);
  return fail('ENVIRONMENT_NOT_READY', 'Required settings are missing or invalid.', {
    location: existsSync(envFile) ? envFile : `${envFile} (not found)`,
    details: parsed.error.issues.map((issue) => `${issue.path.join('.')} ${issue.message}`),
    hint: 'Set them in .env at the repository root.',
  });
}
