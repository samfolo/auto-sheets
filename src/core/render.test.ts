import { describe, expect, it } from 'vitest';
import { render } from './render.ts';
import { fail, ok } from './result.ts';

const unused = (): never => {
  throw new Error('renderData should not be called');
};

describe('render', () => {
  it('prints the whole Result as one line of JSON with --json', () => {
    expect(render(ok({ checks: 3 }), true, unused)).toEqual({
      stdout: '{"success":true,"data":{"checks":3}}\n',
      stderr: '',
      exitCode: 0,
    });
  });

  it('renders success through the command’s own renderer', () => {
    expect(render(ok(['a', 'b']), false, (items) => items.join('\n'))).toEqual({
      stdout: 'a\nb\n',
      stderr: '',
      exitCode: 0,
    });
  });

  it.each([
    { code: 'INVALID_USAGE', exitCode: 2 },
    { code: 'ENVIRONMENT_NOT_READY', exitCode: 3 },
    { code: 'INTERNAL', exitCode: 4 },
  ] as const)('exits $exitCode for $code', ({ code, exitCode }) => {
    expect(render(fail(code, 'Failed.'), true, unused).exitCode).toBe(exitCode);
  });

  it('sends failures to stderr with location, details and hint', () => {
    const failure = fail('ENVIRONMENT_NOT_READY', 'Settings are missing.', {
      location: '.env',
      details: ['OPENROUTER_API_KEY is not set'],
      hint: 'Set it in .env.',
    });
    expect(render(failure, false, unused)).toEqual({
      stdout: '',
      stderr: [
        '✖ ENVIRONMENT_NOT_READY Settings are missing.',
        '  at .env',
        '  OPENROUTER_API_KEY is not set',
        '  hint: Set it in .env.',
        '',
      ].join('\n'),
      exitCode: 3,
    });
  });
});
