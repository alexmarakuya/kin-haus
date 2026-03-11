/** Lightweight input validation for API routes. */

type Rule = (value: unknown, key: string) => string | null;

export const required: Rule = (v, key) =>
  v === undefined || v === null || v === '' ? `${key} is required` : null;

export const isString: Rule = (v, key) =>
  v !== undefined && typeof v !== 'string' ? `${key} must be a string` : null;

export const isNumber: Rule = (v, key) =>
  v !== undefined && (typeof v !== 'number' || isNaN(v)) ? `${key} must be a number` : null;

export const isDateStr: Rule = (v, key) =>
  v !== undefined && typeof v === 'string' && !/^\d{4}-\d{2}-\d{2}$/.test(v)
    ? `${key} must be YYYY-MM-DD`
    : null;

export function oneOf(allowed: readonly string[]): Rule {
  return (v, key) =>
    v !== undefined && !allowed.includes(v as string)
      ? `${key} must be one of: ${allowed.join(', ')}`
      : null;
}

interface FieldRules {
  [field: string]: Rule[];
}

/** Validate a body object against field rules. Returns first error or null. */
export function validate(body: Record<string, unknown>, rules: FieldRules): string | null {
  for (const [field, fieldRules] of Object.entries(rules)) {
    for (const rule of fieldRules) {
      const err = rule(body[field], field);
      if (err) return err;
    }
  }
  return null;
}
