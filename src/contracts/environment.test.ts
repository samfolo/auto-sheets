import { describe, expect, it } from 'vitest';
import { PATHS } from '../core/project.ts';
import { ok } from '../core/result.ts';
import { TEST_CREDENTIALS } from '../testing/settings.ts';
import { readCredentials, readRuntime } from './environment.ts';

describe('readCredentials', () => {
  it('gives the settings idiomatic names', () => {
    expect(readCredentials(TEST_CREDENTIALS)).toEqual(
      ok({
        openRouterApiKey: 'test-key',
        microsoftAccount: { email: 'test@example.com', password: 'test-password' },
      }),
    );
  });

  it.each([
    {
      problem: 'a missing key',
      source: { ...TEST_CREDENTIALS, OPENROUTER_API_KEY: undefined },
      detail: 'OPENROUTER_API_KEY is not set',
    },
    {
      problem: 'an empty password',
      source: { ...TEST_CREDENTIALS, MICROSOFT_ACCOUNT_PASSWORD: '' },
      detail: 'MICROSOFT_ACCOUNT_PASSWORD is empty',
    },
    {
      problem: 'a malformed email',
      source: { ...TEST_CREDENTIALS, MICROSOFT_ACCOUNT_EMAIL: 'sam' },
      detail: 'MICROSOFT_ACCOUNT_EMAIL is not an email address',
    },
  ])('rejects $problem', ({ source, detail }) => {
    expect(readCredentials(source)).toFailWith('ENVIRONMENT_NOT_READY', { details: [detail] });
  });
});

describe('readRuntime', () => {
  it('writes to the shared log outside a build', () => {
    expect(readRuntime({})).toEqual(ok({ logFile: PATHS.defaultLog, runId: null }));
  });

  it('writes to the build’s own log inside a build', () => {
    expect(readRuntime({ FACTORY_LOG: '/tmp/run.jsonl', FACTORY_RUN_ID: 'run-1' })).toEqual(
      ok({ logFile: '/tmp/run.jsonl', runId: 'run-1' }),
    );
  });
});
