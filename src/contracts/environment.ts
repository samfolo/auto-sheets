import { existsSync } from 'node:fs';
import * as z from 'zod';
import { paths } from '../core/project.ts';
import { fail, ok, type Result } from '../core/result.ts';

/*
 * The only module that reads the process environment. Everything else receives typed,
 * validated settings from here, with idiomatic names. The linter enforces this with
 * node/no-process-env.
 */

type Source = Readonly<Record<string, string | undefined>>;

/** Loads .env with Node's built-in loader. Variables that are already set win. */
export const loadEnvFile = (): void => {
  if (existsSync(paths.envFile)) process.loadEnvFile(paths.envFile);
};

/** How this process reports. A build sets both, so every command it runs shares one log. */
const runtimeSchema = z
  .object({
    FACTORY_LOG: z.string().min(1, { error: 'is empty' }).optional(),
    FACTORY_RUN_ID: z.string().min(1, { error: 'is empty' }).optional(),
  })
  .transform((env) => ({
    /** Where telemetry lines go. */
    logFile: env.FACTORY_LOG ?? paths.defaultLog,
    /** The build this process belongs to, or null outside a build. */
    runId: env.FACTORY_RUN_ID ?? null,
  }));

export type Runtime = z.output<typeof runtimeSchema>;

const requiredString = () => z.string({ error: 'is not set' }).min(1, { error: 'is empty' });

/** Secrets. Never log them, and never parse them with reportInput. */
const credentialsSchema = z
  .object({
    OPENROUTER_API_KEY: requiredString(),
    MICROSOFT_ACCOUNT_EMAIL: z.email({
      error: (issue) => (issue.input === undefined ? 'is not set' : 'is not an email address'),
    }),
    MICROSOFT_ACCOUNT_PASSWORD: requiredString(),
  })
  .transform((env) => ({
    /** Pays for the model calls made by the factory's agent. */
    openRouterApiKey: env.OPENROUTER_API_KEY,
    /** The dedicated test account the harness signs in to Excel for the web with. */
    microsoftAccount: {
      email: env.MICROSOFT_ACCOUNT_EMAIL,
      password: env.MICROSOFT_ACCOUNT_PASSWORD,
    },
  }));

export type Credentials = z.output<typeof credentialsSchema>;

const parse = <Schema extends z.ZodType>(
  schema: Schema,
  source: Source,
  report: { message: string; hint: string; location?: string },
): Result<z.output<Schema>> => {
  const parsed = schema.safeParse(source);
  if (parsed.success) return ok(parsed.data);
  return fail('ENVIRONMENT_NOT_READY', report.message, {
    ...report,
    details: parsed.error.issues.map((issue) => `${issue.path.join('.')} ${issue.message}`),
  });
};

export const readRuntime = (source: Source = process.env): Result<Runtime> =>
  parse(runtimeSchema, source, {
    message: 'The factory’s runtime settings are invalid.',
    hint: 'Unset them to use the defaults.',
  });

export const readCredentials = (source: Source = process.env): Result<Credentials> =>
  parse(credentialsSchema, source, {
    message: 'Required credentials are missing or invalid.',
    location: existsSync(paths.envFile) ? paths.envFile : `${paths.envFile} (not found)`,
    hint: 'Set them in .env at the repository root.',
  });
