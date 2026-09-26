/**
 * Steps as text: a short phrase for traces and output, and the command-line form used by
 * `factory excel do <step> <arguments…>`, which runs one step exactly as a case would. The
 * contract in contract.ts decides what's valid; the table here only says how each step's
 * arguments are written, and `--help` lists them with their descriptions.
 */
import { STEP_SCHEMAS, stepSchema, type Step, type StepName } from './contract.ts';
import { describe, validate, fail, type Result } from '../kernel/index.ts';

interface StepUsage {
  /** Argument names, in order. A name ending in `...` takes one or more values. */
  readonly arguments: readonly string[];
  /** Turns the argument values into the step's fields. */
  readonly build: (values: readonly string[]) => Record<string, unknown>;
}

const NO_ARGUMENTS: StepUsage = { arguments: [], build: () => ({}) };

/** A pointer target typed on the command line: a row header is a number, the rest are text. */
const targetOf = (value: string | undefined): string | number | undefined =>
  value !== undefined && /^\d+$/.test(value) ? Number(value) : value;

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
  click: { arguments: ['cell'], build: ([cell]) => ({ cell }) },
  'double-click': { arguments: ['cell'], build: ([cell]) => ({ cell }) },
  drag: {
    arguments: ['from', 'to'],
    build: ([from, to]) => ({ from: targetOf(from), to: targetOf(to) }),
  },
  'click-column': { arguments: ['column'], build: ([column]) => ({ column }) },
  'click-row': { arguments: ['row'], build: ([row]) => ({ row: Number(row) }) },
  'drag-columns': { arguments: ['from', 'to'], build: ([from, to]) => ({ from, to }) },
  'drag-rows': {
    arguments: ['from', 'to'],
    build: ([from, to]) => ({ from: Number(from), to: Number(to) }),
  },
  'click-corner': NO_ARGUMENTS,
  press: { arguments: ['key'], build: ([key]) => ({ key }) },
  'select-all': NO_ARGUMENTS,
  type: { arguments: ['text'], build: ([text]) => ({ text }) },
  'edit-in-formula-bar': { arguments: ['text'], build: ([text]) => ({ text }) },
  'press-mouse': { arguments: ['on'], build: ([on]) => ({ on: targetOf(on) }) },
  'move-mouse': { arguments: ['to'], build: ([to]) => ({ to: targetOf(to) }) },
  'release-mouse': NO_ARGUMENTS,
  'observe-selection': NO_ARGUMENTS,
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

/** A step as a short phrase, for traces, errors and command output. */
export const formatStep = (step: Step): string => {
  switch (step.do) {
    case 'select':
      return `select ${step.range}`;
    case 'enter':
      return `enter ${JSON.stringify(step.text)} in ${step.cell}`;
    case 'enter-in-selection':
      return `enter ${JSON.stringify(step.text)} in the selection`;
    case 'observe':
      return `observe ${step.cells.join(', ')}`;
    case 'press':
      return `press ${[...(step.hold ?? []), step.key].join('+')}`;
    default:
      return step.do;
  }
};
