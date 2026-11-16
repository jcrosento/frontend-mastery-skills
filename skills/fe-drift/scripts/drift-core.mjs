// Shared craft check for a family of products. Numbers must match the family file.
// Brand palettes must not share a color when the family says brands differ.
// This does not look at a screen. A listed state is a claim, not proof it was designed.

export const CRAFT_KEYS = [
  'space_steps',
  'control_heights',
  'radius',
  'icon_px',
  'motion_ms',
  'focus_ring_px',
  'tap_min_px',
  'body_min_px',
  'type_ratio',
];

const STEP_KEYS = new Set(['space_steps', 'control_heights', 'radius', 'icon_px', 'motion_ms']);
const PX_KEYS = new Set(['focus_ring_px', 'tap_min_px', 'body_min_px']);
const FLOORS = { tap_min_px: 44, body_min_px: 16, focus_ring_px: 2 };
export const STATE_IDS = ['loading', 'empty', 'error', 'success', 'offline', 'denied'];
const STATE_SET = new Set(STATE_IDS);
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const PRODUCT_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function fail(failures, code, product, key, message) {
  failures.push({ code, product: product || '', key: key || '', message });
}

function whole(n) {
  return typeof n === 'number' && Number.isInteger(n) && n > 0;
}

function label(product, key) {
  return product ? `${product} ${key}` : key;
}

function checkSteps(value, key, product, failures) {
  const where = label(product, key);
  if (!Array.isArray(value) || value.length < 1 || value.length > 12) {
    fail(failures, 'shape', product, key, `${where} must be a list of 1 to 12 whole numbers`);
    return false;
  }
  for (let i = 0; i < value.length; i += 1) {
    if (!whole(value[i])) {
      fail(failures, 'shape', product, key, `${where}[${i}] must be a whole number above 0`);
      return false;
    }
    if (i > 0 && value[i] <= value[i - 1]) {
      fail(failures, 'shape', product, key, `${where} must increase (${value[i - 1]} then ${value[i]})`);
      return false;
    }
  }
  return true;
}

function checkCraft(craft, product, failures, { floors = false } = {}) {
  if (!craft || typeof craft !== 'object' || Array.isArray(craft)) {
    fail(failures, 'shape', product, 'craft', `${label(product, 'craft')} must be an object`);
    return false;
  }
  let ok = true;
  const keys = Object.keys(craft);
  for (const key of keys) {
    if (!CRAFT_KEYS.includes(key)) {
      fail(failures, 'shape', product, key, `${label(product, key)} is not a shared craft key`);
      ok = false;
    }
  }
  for (const key of CRAFT_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(craft, key)) {
      fail(failures, 'shape', product, key, `${label(product, key)} is missing`);
      ok = false;
      continue;
    }
    const value = craft[key];
    if (STEP_KEYS.has(key)) {
      if (!checkSteps(value, key, product, failures)) ok = false;
    } else if (PX_KEYS.has(key)) {
      if (!whole(value)) {
        fail(failures, 'shape', product, key, `${label(product, key)} must be a whole number above 0`);
        ok = false;
      } else if (floors && value < FLOORS[key]) {
        fail(failures, 'floor', product, key, `${label(product, key)} is ${value}, below the floor of ${FLOORS[key]}`);
        ok = false;
      }
    } else if (key === 'type_ratio') {
      if (typeof value !== 'number' || !Number.isFinite(value) || value <= 1 || value > 1.5) {
        fail(failures, 'shape', product, key, `${label(product, key)} must be a number above 1 and at most 1.5`);
        ok = false;
      }
    }
  }
  return ok;
}

function checkPalette(palette, product, failures) {
  if (!Array.isArray(palette) || palette.length < 1 || palette.length > 12) {
    fail(failures, 'shape', product, 'palette', `${product} palette must list 1 to 12 brand colors`);
    return null;
  }
  const colors = [];
  for (const color of palette) {
    if (typeof color !== 'string' || !HEX.test(color)) {
      fail(failures, 'shape', product, 'palette', `${product} palette has a color that is not a #RGB or #RRGGBB hex`);
      return null;
    }
    colors.push(color.toLowerCase());
  }
  return colors;
}

function checkProduct(product, requiredStates, failures) {
  if (!product || typeof product !== 'object' || Array.isArray(product)) {
    fail(failures, 'shape', '', 'product', 'a product entry must be an object');
    return null;
  }
  const name = product.product;
  if (typeof name !== 'string' || !PRODUCT_NAME.test(name)) {
    fail(failures, 'shape', typeof name === 'string' ? name : '', 'product', 'product name must be lowercase words joined by hyphens');
    return null;
  }
  if (product.kind !== 'site' && product.kind !== 'app') {
    fail(failures, 'shape', name, 'kind', `${name} kind must be site or app`);
  }
  const craftOk = checkCraft(product.craft, name, failures);
  if (!Array.isArray(product.states)) {
    fail(failures, 'shape', name, 'states', `${name} states must be a list`);
  } else {
    for (const state of product.states) {
      if (!STATE_SET.has(state)) {
        fail(failures, 'shape', name, 'states', `${name} state "${state}" is not one of ${STATE_IDS.join(', ')}`);
      }
    }
    for (const state of requiredStates) {
      if (!product.states.includes(state)) {
        fail(failures, 'state', name, state, `${name} is missing the ${state} state`);
      }
    }
  }
  const brand = product.brand;
  if (!brand || typeof brand !== 'object' || Array.isArray(brand)) {
    fail(failures, 'shape', name, 'brand', `${name} brand must be an object`);
    return { name, craftOk, colors: null };
  }
  const colors = checkPalette(brand.palette, name, failures);
  const fonts = brand.font_families;
  if (!Array.isArray(fonts) || fonts.length < 1 || fonts.length > 3 || fonts.some(font => typeof font !== 'string' || font.trim() === '' || font.length > 60)) {
    fail(failures, 'shape', name, 'font_families', `${name} font_families must list 1 to 3 typefaces`);
  }
  return { name, craftOk, colors };
}

export function evaluateFamily(family, products) {
  const failures = [];
  if (!family || typeof family !== 'object' || Array.isArray(family)) {
    fail(failures, 'shape', '', 'family', 'family file must be an object');
    return { ok: false, failures };
  }
  if (typeof family.name !== 'string' || family.name.trim() === '') {
    fail(failures, 'shape', '', 'name', 'family name is missing');
  }
  const craftOk = checkCraft(family.craft, '', failures, { floors: true });
  let requiredStates = [];
  if (!Array.isArray(family.states_required) || family.states_required.length < 1) {
    fail(failures, 'shape', '', 'states_required', 'states_required must list the states every product claims');
  } else {
    requiredStates = family.states_required;
    for (const state of requiredStates) {
      if (!STATE_SET.has(state)) {
        fail(failures, 'shape', '', 'states_required', `states_required has unknown state "${state}"`);
      }
    }
  }
  let differ = [];
  if (!Array.isArray(family.brand_must_differ)) {
    fail(failures, 'shape', '', 'brand_must_differ', 'brand_must_differ must be a list (use [] only when every product is the same brand)');
  } else {
    differ = family.brand_must_differ;
    for (const key of differ) {
      if (key !== 'palette') fail(failures, 'shape', '', 'brand_must_differ', `brand_must_differ cannot require "${key}"`);
    }
  }
  if (!Array.isArray(products)) {
    fail(failures, 'shape', '', 'products', 'products must be a list');
    return { ok: false, failures };
  }
  if (products.length < 2) {
    fail(failures, 'empty', '', 'products', 'a family check needs at least two products');
    return { ok: false, failures };
  }
  if (products.length > 40) {
    fail(failures, 'shape', '', 'products', 'a family check accepts at most 40 products');
    return { ok: false, failures };
  }

  const seen = new Map();
  const checked = [];
  for (const product of products) {
    const row = checkProduct(product, requiredStates, failures);
    if (!row) continue;
    if (seen.has(row.name)) {
      fail(failures, 'shape', row.name, 'product', `${row.name} is listed more than once`);
      continue;
    }
    seen.set(row.name, true);
    checked.push(row);
    if (craftOk && row.craftOk) {
      for (const key of CRAFT_KEYS) {
        const expected = family.craft[key];
        const actual = product.craft[key];
        if (JSON.stringify(expected) !== JSON.stringify(actual)) {
          fail(failures, 'drift', row.name, key, `${row.name} ${key} is ${JSON.stringify(actual)}, family says ${JSON.stringify(expected)}`);
        }
      }
    }
  }

  if (differ.includes('palette')) {
    for (let i = 0; i < checked.length; i += 1) {
      for (let j = i + 1; j < checked.length; j += 1) {
        const a = checked[i];
        const b = checked[j];
        if (!a.colors || !b.colors) continue;
        const shared = a.colors.find(color => b.colors.includes(color));
        if (shared) {
          fail(failures, 'brand', a.name, 'palette', `${a.name} and ${b.name} share brand color ${shared}. List brand colors only, not black, white or gray. Same brand on two domains is fe-consistency, not this check.`);
        }
      }
    }
  }

  return { ok: failures.length === 0, failures };
}

export function formatReport(family, products, result) {
  const lines = [];
  const failedNames = new Set(result.failures.map(item => item.product).filter(Boolean));
  const names = [];
  if (Array.isArray(products)) {
    for (const product of products) {
      if (product && typeof product.product === 'string') names.push(product.product);
    }
  }
  for (const name of names) {
    lines.push(failedNames.has(name) ? `FAIL ${name}` : `PASS ${name}`);
  }
  for (const item of result.failures) lines.push(`FAIL ${item.message}`);
  if (result.ok) {
    const count = names.length;
    lines.push(`FAMILY PASSED ${count} products${family && family.name ? ` (${family.name})` : ''}`);
  } else {
    lines.push(`FAMILY FAILED ${result.failures.length}`);
  }
  return lines.join('\n');
}
