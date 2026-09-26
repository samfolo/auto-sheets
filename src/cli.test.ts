import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const cli = fileURLToPath(new URL('./cli.ts', import.meta.url));

/** Settings that satisfy the environment contract without touching real secrets. */
const validSettings = {
  OPENROUTER_API_KEY: 'test-key',
  MICROSOFT_ACCOUNT_EMAIL: 'test@example.com',
  MICROSOFT_ACCOUNT_PASSWORD: 'test-password',
};

/** Runs the real CLI in a child process, with its telemetry sent to a temporary file. */
function factory(args: string[], env: Record<string, string> = {}) {
  const log = join(mkdtempSync(join(tmpdir(), 'factory-test-')), 'events.jsonl');
  const child = spawnSync(process.execPath, [cli, ...args], {
    encoding: 'utf8',
    env: { ...process.env, ...validSettings, ...env, FACTORY_LOG: log },
  });
  const events = () =>
    readFileSync(log, 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as { msg: string; [key: string]: unknown });
  return { ...child, events };
}

describe('factory CLI', () => {
  it('lists its commands in --help', () => {
    const { status, stdout } = factory(['--help']);
    assert.equal(status, 0);
    assert.match(stdout, /doctor\s+check that everything the factory needs is in place/);
  });

  it('rejects an unknown command with INVALID_USAGE and exit code 2', () => {
    const { status, stdout } = factory(['--json', 'docter']);
    assert.equal(status, 2);
    const result = JSON.parse(stdout);
    assert.equal(result.success, false);
    assert.equal(result.error.code, 'INVALID_USAGE');
    assert.deepEqual(result.error.details, ['(Did you mean doctor?)']);
  });

  it('passes doctor when every prerequisite is present, and logs the invocation', () => {
    const { status, stdout, events } = factory(['doctor', '--json']);
    assert.equal(status, 0);
    assert.equal(JSON.parse(stdout).success, true);
    const [start, end] = events();
    assert.equal(start?.msg, 'command.start');
    assert.equal(end?.msg, 'command.end');
    assert.equal(end?.success, true);
    assert.equal(start?.invocation, end?.invocation);
  });

  it('fails doctor with ENVIRONMENT_NOT_READY and exit code 3 when a setting is missing', () => {
    const { status, stdout } = factory(['doctor', '--json'], { OPENROUTER_API_KEY: '' });
    assert.equal(status, 3);
    const result = JSON.parse(stdout);
    assert.equal(result.error.code, 'ENVIRONMENT_NOT_READY');
    assert.ok(
      result.error.details.some((line: string) => line.includes('OPENROUTER_API_KEY is empty')),
    );
  });
});
