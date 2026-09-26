import { describe, expect, it } from 'vitest';
import { runFactory } from '../testing/cli.ts';

describe('factory doctor', () => {
  it('passes when every prerequisite is in place, and logs the invocation', () => {
    const run = runFactory(['doctor']);
    expect(run).toSucceed();

    const [start, end] = run.events();
    expect(start).toMatchObject({ msg: 'command.start', command: 'doctor' });
    expect(end).toMatchObject({ msg: 'command.end', success: true, invocation: start?.invocation });
  });

  it.each([
    { setting: 'OPENROUTER_API_KEY', value: '', problem: 'is empty' },
    { setting: 'MICROSOFT_ACCOUNT_EMAIL', value: 'sam', problem: 'is not an email address' },
  ])('fails when $setting $problem', ({ setting, value, problem }) => {
    expect(runFactory(['doctor'], { [setting]: value })).toFailWith('ENVIRONMENT_NOT_READY', {
      details: expect.arrayContaining([`✖ Credentials: ${setting} ${problem}`]),
    });
  });
});
