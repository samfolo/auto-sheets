/**
 * The shape of a parsed formula, shared by the parser, the evaluator and the reference shifter.
 */
import type { CellError } from '../values.js';

/** One endpoint of a reference, with the `$` flags Excel remembers. */
export interface RefPart {
  col: number;
  row: number;
  absCol: boolean;
  absRow: boolean;
}

/** Operators a binary expression can carry, in all their spellings. */
export type BinaryOp = '+' | '-' | '*' | '/' | '^' | '&' | '=' | '<>' | '<' | '>' | '<=' | '>=';

/** A parsed formula expression. */
export type Expr =
  | { t: 'number'; v: number }
  | { t: 'string'; v: string }
  | { t: 'bool'; v: boolean }
  | { t: 'error'; v: CellError }
  | { t: 'ref'; ref: RefPart }
  | { t: 'range'; from: RefPart; to: RefPart }
  | { t: 'unary'; op: '-' | '+'; operand: Expr }
  | { t: 'percent'; operand: Expr }
  | { t: 'binary'; op: BinaryOp; left: Expr; right: Expr }
  | { t: 'func'; name: string; args: Expr[] };
