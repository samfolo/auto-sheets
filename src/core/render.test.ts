import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { render } from './render.ts';
import { fail, ok } from './result.ts';

describe('render', () => {
  it('prints the whole Result as one line of JSON with --json, for success and failure alike', () => {
    const success = render(ok({ checks: 3 }), true, () => 'unused');
    assert.equal(success.stdout, '{"success":true,"data":{"checks":3}}\n');
    assert.equal(success.exitCode, 0);

    const failure = render(fail('INVALID_USAGE', 'Unknown command.'), true, () => 'unused');
    assert.deepEqual(JSON.parse(failure.stdout), {
      success: false,
      error: { code: 'INVALID_USAGE', message: 'Unknown command.' },
    });
    assert.equal(failure.stderr, '');
  });

  it('renders success through the command’s own renderer', () => {
    const output = render(ok(['a', 'b']), false, (items) => items.join('\n'));
    assert.deepEqual(output, { stdout: 'a\nb\n', stderr: '', exitCode: 0 });
  });

  it('sends failures to stderr with location, details and hint, and exits by category', () => {
    const output = render(
      fail('ENVIRONMENT_NOT_READY', 'Settings are missing.', {
        location: '.env',
        details: ['OPENROUTER_API_KEY is not set'],
        hint: 'Set it in .env.',
      }),
      false,
      () => 'unused',
    );
    assert.equal(output.stdout, '');
    assert.equal(
      output.stderr,
      [
        '✖ ENVIRONMENT_NOT_READY Settings are missing.',
        '  at .env',
        '  OPENROUTER_API_KEY is not set',
        '  hint: Set it in .env.',
        '',
      ].join('\n'),
    );
    assert.equal(output.exitCode, 3);
  });
});
