import * as z from 'zod';
import { fail, ok, type Result } from './result.ts';

/*
 * Validation whose errors explain themselves. Each Zod issue names the failing field,
 * and this module adds the field's description, found by following the issue's path
 * through the schema. Someone reading only an error, in a terminal or a log collector,
 * learns what was wrong and what the field was for.
 */

type Schema = z.core.$ZodType;

const isIndexable = (value: unknown): value is Readonly<Record<PropertyKey, unknown>> =>
  typeof value === 'object' && value !== null;

const childOf = (value: unknown, key: PropertyKey): unknown =>
  isIndexable(value) ? value[key] : undefined;

/** The member of a discriminated union that the input claims to be, if any. */
const chosenOption = (union: z.ZodDiscriminatedUnion, value: unknown): Schema | undefined => {
  const { discriminator } = union.def;
  const tag = childOf(value, discriminator);
  return union.options.find((option) => {
    const literal = option instanceof z.ZodObject ? option.shape[discriminator] : undefined;
    return (
      literal instanceof z.ZodLiteral && [...literal.values].some((allowed) => allowed === tag)
    );
  });
};

/** A schema followed by everything it wraps, outermost first. */
const layersOf = (schema: Schema, value: unknown): Schema[] => {
  if (
    schema instanceof z.ZodOptional ||
    schema instanceof z.ZodNullable ||
    schema instanceof z.ZodDefault ||
    schema instanceof z.ZodReadonly
  ) {
    return [schema, ...layersOf(schema.unwrap(), value)];
  }
  if (schema instanceof z.ZodPipe) return [schema, ...layersOf(schema.in, value)];
  if (schema instanceof z.ZodDiscriminatedUnion) {
    const option = chosenOption(schema, value);
    return option ? [schema, ...layersOf(option, value)] : [schema];
  }
  return [schema];
};

const descriptionOf = (schema: Schema, value: unknown): string | undefined =>
  layersOf(schema, value)
    .map((layer) => z.globalRegistry.get(layer)?.description)
    .find((description) => description !== undefined);

/** Follows a path through the schema, alongside the input, as far as the schema goes. */
const describePath = (
  schema: Schema,
  path: readonly PropertyKey[],
  value: unknown,
): string | undefined => {
  const [key, ...rest] = path;
  if (key === undefined) return descriptionOf(schema, value);
  const inner = layersOf(schema, value).at(-1);
  const next =
    inner instanceof z.ZodObject && typeof key === 'string'
      ? inner.shape[key]
      : inner instanceof z.ZodArray
        ? inner.element
        : inner instanceof z.ZodRecord
          ? inner.valueType
          : undefined;
  return next === undefined ? undefined : describePath(next, rest, childOf(value, key));
};

/** A schema's own description, as given with `.meta({ description })`. */
export const describe = (schema: Schema): string | undefined =>
  z.globalRegistry.get(schema)?.description;

/** Formats a path the way it would be written in JavaScript, such as steps[3].cell. */
export const formatPath = (path: readonly PropertyKey[]): string =>
  path.reduce<string>(
    (text, key) =>
      typeof key === 'number' ? `${text}[${key}]` : text ? `${text}.${String(key)}` : String(key),
    '',
  ) || 'the top level';

const formatIssue = (issue: z.core.$ZodIssue, schema: Schema, input: unknown): string[] => {
  const description = describePath(schema, issue.path, input);
  return [
    `✖ ${issue.message}`,
    `  → at ${formatPath(issue.path)}${description ? `: ${description}` : ''}`,
  ];
};

/** Checks data against its contract. `location` says where the data came from. */
export const validate = <S extends z.ZodType>(
  schema: S,
  input: unknown,
  location: string,
): Result<z.output<S>> => {
  const parsed = schema.safeParse(input);
  if (parsed.success) return ok(parsed.data);
  return fail('CONTRACT_VIOLATION', `${location} does not match its contract.`, {
    location,
    details: parsed.error.issues.flatMap((issue) => formatIssue(issue, schema, input)),
  });
};
