/**
 * A small recursive-descent parser for Excel formulas. Each level of the grammar is one
 * method, in the same order as Excel's precedence table.
 */
import type { BinaryOp, Expr, RefPart } from './ast.js';
import { tokenize, type Token } from './lexer.js';

/** The comparison operators, for the parser's lowest-precedence level. */
const COMPARISON_OPS: Record<string, BinaryOp> = {
  '=': '=',
  '<>': '<>',
  '<=': '<=',
  '>=': '>=',
  '<': '<',
  '>': '>',
};
const CONCAT_OPS: Record<string, BinaryOp> = { '&': '&' };
const ADDITIVE_OPS: Record<string, BinaryOp> = { '+': '+', '-': '-' };
const MULTIPLICATIVE_OPS: Record<string, BinaryOp> = { '*': '*', '/': '/' };
const POWER_OPS: Record<string, BinaryOp> = { '^': '^' };

/** Walks a token list, one grammar level at a time. */
class Parser {
  private pos = 0;

  constructor(private readonly tokens: Token[]) {}

  parse(): Expr | null {
    const result = this.parseExpr();
    if (!result || this.peek().k !== 'end') return null;
    return result;
  }

  private peek(): Token {
    return this.tokens[this.pos]!;
  }

  private eat(value: string): boolean {
    const token = this.peek();
    if (token.k === 'op' && token.v === value) {
      this.pos += 1;
      return true;
    }
    return false;
  }

  private parseExpr(): Expr | null {
    return this.parseLevel(() => this.parseConcat(), COMPARISON_OPS);
  }

  private parseConcat(): Expr | null {
    return this.parseLevel(() => this.parseAddSub(), CONCAT_OPS);
  }

  private parseAddSub(): Expr | null {
    return this.parseLevel(() => this.parseMulDiv(), ADDITIVE_OPS);
  }

  private parseMulDiv(): Expr | null {
    return this.parseLevel(() => this.parsePower(), MULTIPLICATIVE_OPS);
  }

  private parsePower(): Expr | null {
    return this.parseLevel(() => this.parseUnary(), POWER_OPS);
  }

  private parseLevel(next: () => Expr | null, ops: Record<string, BinaryOp>): Expr | null {
    let left = next();
    if (!left) return null;
    for (;;) {
      const token = this.peek();
      const op = token.k === 'op' ? ops[token.v] : undefined;
      if (!op) break;
      this.pos += 1;
      const right = next();
      if (!right) return null;
      left = { t: 'binary', op, left, right };
    }
    return left;
  }

  private parseUnary(): Expr | null {
    const token = this.peek();
    if (token.k === 'op' && (token.v === '-' || token.v === '+')) {
      this.pos += 1;
      const operand = this.parseUnary();
      return operand ? { t: 'unary', op: token.v === '-' ? '-' : '+', operand } : null;
    }
    return this.parsePercent();
  }

  private parsePercent(): Expr | null {
    let value = this.parsePrimary();
    if (!value) return null;
    while (this.eat('%')) value = { t: 'percent', operand: value };
    return value;
  }

  private parsePrimary(): Expr | null {
    const token = this.peek();
    if (token.k === 'number') return this.take({ t: 'number', v: token.v });
    if (token.k === 'string') return this.take({ t: 'string', v: token.v });
    if (token.k === 'error') return this.take({ t: 'error', v: token.v });
    if (token.k === 'ref') return this.parseReference(token.v);
    if (token.k === 'ident') return this.parseIdentifier(token.v);
    if (token.k === 'op' && token.v === '(') return this.parseGroup();
    return null;
  }

  private take(expr: Expr): Expr {
    this.pos += 1;
    return expr;
  }

  private parseReference(from: RefPart): Expr | null {
    this.pos += 1;
    if (!this.eat(':')) return { t: 'ref', ref: from };
    const to = this.peek();
    if (to.k !== 'ref') return null;
    this.pos += 1;
    return { t: 'range', from, to: to.v };
  }

  private parseIdentifier(name: string): Expr | null {
    this.pos += 1;
    const upper = name.toUpperCase();
    if (upper === 'TRUE') return { t: 'bool', v: true };
    if (upper === 'FALSE') return { t: 'bool', v: false };
    if (!this.eat('(')) return null;
    return { t: 'func', name: upper, args: this.parseArguments() };
  }

  private parseArguments(): Expr[] {
    const args: Expr[] = [];
    if (this.eat(')')) return args;
    for (;;) {
      const arg = this.parseExpr();
      if (!arg) return [];
      args.push(arg);
      if (this.eat(',')) continue;
      if (this.eat(')')) return args;
      return [];
    }
  }

  private parseGroup(): Expr | null {
    this.pos += 1;
    const inner = this.parseExpr();
    if (!inner || !this.eat(')')) return null;
    return inner;
  }
}

/** Parse a whole formula (leading `=` already present). Returns null when it is malformed. */
export const parseFormula = (text: string): Expr | null => {
  if (!text.startsWith('=')) return null;
  const tokens = tokenize(text.slice(1));
  if (!tokens) return null;
  return new Parser(tokens).parse();
};
