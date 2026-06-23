/**
 * Input validation helpers — validates request shape before the data layer.
 * Returns { valid, errors } — never throws, never calls res directly.
 * Designed to be used in route handlers:
 *
 *   const v = validate(req.body, { type: 'int', name: 'string', date: 'date?' });
 *   if (!v.ok) return res.status(400).json({ errors: v.errors });
 */

const checks = {
  string: v => typeof v === 'string' && v.trim().length > 0,
  text:    v => typeof v === 'string',                         // can be empty
  int:     v => !isNaN(parseInt(v)),
  float:   v => !isNaN(parseFloat(v)),
  date:    v => typeof v === 'string' && v.length >= 10,       // "YYYY-MM-DD" or "YYYY-MM-DD HH:MM:SS"
  bool:    v => v === true || v === false || v === 0 || v === 1 || v === '0' || v === '1',
  coords:  v => typeof v === 'string' && /^[NS]\s*\d+\s+\d+\.\d+\s+[EW]\s*\d+\s+(\d+\.\d+)$/.test(v),
};

/**
 * @param {object} input  req.body or req.query
 * @param {object} shape  { fieldName: 'int' | 'string' | 'float' | 'date' | 'bool' | 'coords' | 'text' }
 *                        Append '?' for optional: 'string?', 'int?'
 * @returns {{ ok: boolean, values: object, errors: object }}
 */
export function validate(input, shape) {
  const values = {};
  const errors = {};

  for (const [field, rule] of Object.entries(shape)) {
    const required = !rule.endsWith('?');
    const type = required ? rule : rule.slice(0, -1);
    const check = checks[type];
    const raw = input[field];

    if (!check) {
      errors[field] = `unknown type: ${type}`;
      continue;
    }

    if (raw === undefined || raw === null || raw === '') {
      if (required) {
        errors[field] = 'required';
      }
      continue;
    }

    if (!check(raw)) {
      errors[field] = `expected ${type}`;
      continue;
    }

    values[field] = type === 'int' ? parseInt(raw) : type === 'float' ? parseFloat(raw) : raw;
  }

  return { ok: Object.keys(errors).length === 0, values, errors };
}
