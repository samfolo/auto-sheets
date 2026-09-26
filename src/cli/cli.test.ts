import { describe, expect, it } from 'vitest';
import { runFactory } from '../testing/cli.ts';

describe('factory CLI', () => {
  it('lists its commands in --help', () => {
    const run = runFactory(['--help']);
    expect(run.status).toBe(0);
    expect(run.stdout).toMatch(/doctor\s+check that everything the factory needs is in place/);
  });

  it.each([
    {
      name: 'a misspelt command',
      args: ['docter'],
      error: { message: "Unknown command 'docter'.", details: ['(Did you mean doctor?)'] },
    },
    {
      name: 'an unknown option',
      args: ['doctor', '--verbose'],
      error: { message: "Unknown option '--verbose'." },
    },
  ])('rejects $name with INVALID_USAGE', ({ args, error }) => {
    expect(runFactory(args)).toFailWith('INVALID_USAGE', error);
  });

  it('rejects invalid runtime settings before running any command', () => {
    expect(runFactory(['doctor'], { FACTORY_RUN_ID: '' })).toFailWith('ENVIRONMENT_NOT_READY', {
      details: ['FACTORY_RUN_ID is empty'],
    });
  });
});
