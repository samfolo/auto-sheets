import type { Step } from '../contracts/case.ts';

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
    default:
      return step.do;
  }
};
