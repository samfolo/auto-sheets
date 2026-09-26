/**
 * Steps on the command line: `factory excel do <step> <arguments…>` runs one step, exactly as a
 * case would. The contract in src/contracts/case.ts still decides what's valid; this table only
 * says how each step's arguments are written, and `--help` lists them with their descriptions.
 */
import { STEP_SCHEMAS, stepSchema, type Step, type StepName } from '../contracts/case.ts';
import { describe, validate } from '../contracts/validate.ts';
import { fail, type Result } from '../core/result.ts';

interface StepUsage {
  /** Argument names, in order. A name ending in `...` takes one or more values. */
  readonly arguments: readonly string[];
  /** Turns the argument values into the step's fields. */
  readonly build: (values: readonly string[]) => Record<string, unknown>;
}

const NO_ARGUMENTS: StepUsage = { arguments: [], build: () => ({}) };

const STEP_USAGE: Readonly<Record<StepName, StepUsage>> = {
  select: { arguments: ['range'], build: ([range]) => ({ range }) },
  enter: { arguments: ['cell', 'text'], build: ([cell, text]) => ({ cell, text }) },
  'enter-in-selection': { arguments: ['text'], build: ([text]) => ({ text }) },
  clear: NO_ARGUMENTS,
  'fill-down': NO_ARGUMENTS,
  copy: NO_ARGUMENTS,
  paste: NO_ARGUMENTS,
  undo: NO_ARGUMENTS,
  redo: NO_ARGUMENTS,
  observe: { arguments: ['cells...'], build: (cells) => ({ cells }) },
};

const isStepName = (name: string): name is StepName => Object.hasOwn(STEP_USAGE, name);

/** Builds a step from command-line values and checks it against the case contract. */
export const parseStep = (name: string, values: readonly string[]): Result<Step> => {
  if (!isStepName(name)) {
    return fail('INVALID_USAGE', `There is no step called ${JSON.stringify(name)}.`, {
      hint: `The steps are: ${Object.keys(STEP_USAGE).join(', ')}.`,
    });
  }
  return validate(stepSchema, { do: name, ...STEP_USAGE[name].build(values) }, `the ${name} step`);
};

/** Every step with its arguments and what it does, for `--help`. */
export const stepHelp = (): string =>
  Object.entries(STEP_USAGE)
    .map(([name, usage]) => {
      const usageLine = [name, ...usage.arguments.map((argument) => `<${argument}>`)].join(' ');
      const description = isStepName(name) ? describe(STEP_SCHEMAS[name]) : undefined;
      return `  ${usageLine.padEnd(30)} ${description ?? ''}`;
    })
    .join('\n');
