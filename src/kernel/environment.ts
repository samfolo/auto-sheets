import { existsSync } from 'node:fs';
import * as z from 'zod';
import { PATHS } from './project.ts';
import { fail, ok, type Result } from './result.ts';

/*
 * The only module that reads the process environment. Everything else receives typed,
 * validated settings from here, with idiomatic names. The linter enforces this with
 * node/no-process-env.
 */

type Source = Readonly<Record<string, string | undefined>>;

/** Loads .env with Node's built-in loader. Variables that are already set win. */
export const loadEnvFile = (): void => {
  if (existsSync(PATHS.envFile)) process.loadEnvFile(PATHS.envFile);
};

/**
 * What a child process needs to run, such as the agent or a clone: where programs are, the home
 * directory and the language. Nothing secret; a caller adds only the secrets that child needs.
 */
export const childEnvironment = (): Readonly<Record<string, string | undefined>> => ({
  PATH: process.env.PATH,
  HOME: process.env.HOME,
  LANG: process.env.LANG,
});

const runtimeSchema = z
  .object({
    FACTORY_LOG: z.string().min(1, { error: 'is empty' }).optional().meta({
      description: 'The file telemetry lines are appended to. A build sets it to its own log.',
    }),
    FACTORY_RUN_ID: z.string().min(1, { error: 'is empty' }).optional().meta({
      description: 'The build this process belongs to. Unset outside a build.',
    }),
  })
  .meta({
    description: 'How this process reports. A build sets both, so its commands share one log.',
  })
  .transform((env) => ({
    /** Where telemetry lines go. */
    logFile: env.FACTORY_LOG ?? PATHS.defaultLog,
    /** The build this process belongs to, or null outside a build. */
    runId: env.FACTORY_RUN_ID ?? null,
  }));

export type Runtime = z.output<typeof runtimeSchema>;

const requiredString = () => z.string({ error: 'is not set' }).min(1, { error: 'is empty' });

/** Secrets. Never log them, and never parse them with reportInput. */
const credentialsSchema = z
  .object({
    OPENROUTER_API_KEY: requiredString().meta({
      description: 'Pays for the model calls made by the factory’s agent.',
    }),
    MICROSOFT_ACCOUNT_EMAIL: z
      .email({
        error: (issue) => (issue.input === undefined ? 'is not set' : 'is not an email address'),
      })
      .meta({ description: 'The dedicated test account used to sign in to Excel for the web.' }),
    MICROSOFT_ACCOUNT_PASSWORD: requiredString().meta({
      description:
        'The test account’s password. The account is passwordless in practice, so sign-in uses an emailed code.',
    }),
  })
  .meta({ description: 'Credentials for the services the factory uses.' })
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
    location: existsSync(PATHS.envFile) ? PATHS.envFile : `${PATHS.envFile} (not found)`,
    hint: 'Set them in .env at the repository root.',
  });
