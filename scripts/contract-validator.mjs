// Dependency-free validator for the JSON Schema keywords used by this repository's evidence contract.
// Keep the schema limited to these keywords, or replace this helper with a standards-compliant validator.
export function validateAgainstSchema(value, schema, at = "$", errors = [], root = schema) {
  if (schema.$ref) {
    const target = schema.$ref.split("/").slice(1).reduce((node, part) => node?.[part.replaceAll("~1", "/").replaceAll("~0", "~")], root);
    if (!target) errors.push(`${at}: unresolved local $ref ${schema.$ref}`);
    else validateAgainstSchema(value, target, at, errors, root);
    return errors;
  }
  const types = schema.type === undefined ? [] : Array.isArray(schema.type) ? schema.type : [schema.type];
  if (types.length && !types.some(type => matchesType(value, type))) {
    errors.push(`${at}: expected ${types.join(" or ")}`);
    return errors;
  }
  if (Object.hasOwn(schema, "const") && !deepEqual(value, schema.const)) errors.push(`${at}: must equal ${JSON.stringify(schema.const)}`);
  if (schema.enum && !schema.enum.some(item => deepEqual(value, item))) errors.push(`${at}: value is not an allowed enum member`);

  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const key of schema.required || []) if (!Object.hasOwn(value, key)) errors.push(`${at}.${key}: required property missing`);
    const properties = schema.properties || {};
    for (const [key, child] of Object.entries(properties)) {
      if (Object.hasOwn(value, key)) validateAgainstSchema(value[key], child, `${at}.${key}`, errors, root);
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) if (!Object.hasOwn(properties, key)) errors.push(`${at}.${key}: unexpected property`);
    }
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) errors.push(`${at}: needs at least ${schema.minItems} item(s)`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems) errors.push(`${at}: allows at most ${schema.maxItems} item(s)`);
    if (schema.uniqueItems && new Set(value.map(item => JSON.stringify(item))).size !== value.length) errors.push(`${at}: items must be unique`);
    if (schema.items) value.forEach((item, index) => validateAgainstSchema(item, schema.items, `${at}[${index}]`, errors, root));
  }
  if (typeof value === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength) errors.push(`${at}: string is too short`);
    if (schema.maxLength !== undefined && value.length > schema.maxLength) errors.push(`${at}: string is too long`);
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) errors.push(`${at}: does not match required pattern`);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) errors.push(`${at}: must be finite`);
    if (schema.minimum !== undefined && value < schema.minimum) errors.push(`${at}: must be >= ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum) errors.push(`${at}: must be <= ${schema.maximum}`);
  }
  return errors;
}

function matchesType(value, type) {
  if (type === "null") return value === null;
  if (type === "array") return Array.isArray(value);
  if (type === "object") return value !== null && typeof value === "object" && !Array.isArray(value);
  if (type === "integer") return Number.isInteger(value);
  if (type === "number") return typeof value === "number" && Number.isFinite(value);
  if (type === "boolean") return typeof value === "boolean";
  if (type === "string") return typeof value === "string";
  return false;
}

function deepEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}
