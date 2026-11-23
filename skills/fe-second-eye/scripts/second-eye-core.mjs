// Rules for an independent judge. Pure: no files, no network.
// The builder never grades its own work, and neither does a model from the builder's family.

export const DIMENSIONS = ['task', 'hierarchy', 'readable', 'clean', 'reference'];
export const QUESTIONS = {
  task: 'On which screen can a first-time user tell what to do next, faster?',
  hierarchy: 'Which screen has one clear most-important thing?',
  readable: 'On which screen is the text easier to read (size, contrast, density)?',
  clean: 'Which screen has fewer leftovers: duplicates, placeholders, misaligned or cut-off pieces?',
  reference: 'Which screen is closer to the brief and the approved reference?',
};
const CHOICES = new Set(['A', 'B', 'same']);

const FAMILIES = [
  ['anthropic', /claude|fable|opus|sonnet|haiku/],
  ['openai', /gpt|codex|\bo[134]\b|astra|\bsol\b|terra/],
  ['google', /gemini|gemma|palm/],
  ['xai', /grok/],
  ['meta', /llama|muse/],
  ['cursor', /composer|cursor/],
  ['mistral', /mistral|codestral|pixtral/],
  ['deepseek', /deepseek/],
  ['moonshot', /kimi|moonshot/],
  ['alibaba', /qwen/],
  ['zhipu', /\bglm\b|zhipu/],
];

// The family comes from the model name, so a card cannot claim a different family than its model has.
export function familyOf(who) {
  if (!who || typeof who !== 'object') return null;
  if (typeof who.human === 'string' && who.human.trim().length >= 2) return 'human';
  if (typeof who.model !== 'string' || who.model.trim().length < 3) return null;
  const model = who.model.toLowerCase();
  const hit = FAMILIES.find(([, pattern]) => pattern.test(model));
  if (hit) return hit[0];
  return typeof who.family === 'string' && /^[a-z0-9-]{2,30}$/.test(who.family) ? who.family : null;
}

// Returns null when the judge may judge this builder, or the reason it may not.
export function independence(builder, judge) {
  const made = familyOf(builder);
  const judged = familyOf(judge);
  if (!made) return 'builder must name the model that built the screen (or a person).';
  if (!judged) return 'judge must name the model that judged the screen (or a person).';
  if (made === 'human' && judged === 'human') {
    return String(builder.human).trim().toLowerCase() === String(judge.human).trim().toLowerCase() ? 'the judge is the person who built it.' : null;
  }
  if (judged === 'human') return null;
  if (made === judged) return `the judge and the builder are both ${made} models. Use a model from another family, or a person.`;
  return null;
}

export function assign(random = Math.random) {
  return random() < 0.5 ? { A: 'before', B: 'after' } : { A: 'after', B: 'before' };
}

export function blankBallot(order) {
  return {
    order,
    judge: { model: '' },
    choices: Object.fromEntries(DIMENSIONS.map(id => [id, ''])),
    reasons: Object.fromEntries(DIMENSIONS.map(id => [id, ''])),
    defects: [],
  };
}

function ballotProblems(ballot, order) {
  const out = [];
  if (!ballot || typeof ballot !== 'object') return [`ballot ${order} is missing.`];
  if (ballot.order !== order) out.push(`ballot ${order} must say order "${order}".`);
  for (const id of DIMENSIONS) {
    if (!CHOICES.has(ballot.choices?.[id])) out.push(`ballot ${order}: ${id} must be "A", "B" or "same".`);
    const reason = ballot.reasons?.[id];
    if (typeof reason !== 'string' || reason.trim().length < 24) out.push(`ballot ${order}: ${id} needs a reason of 24 characters or more that names what was seen.`);
  }
  return out;
}

export function tally({ key, builder, ballots }) {
  const problems = [];
  if (!key || !['before', 'after'].includes(key.A) || !['before', 'after'].includes(key.B) || key.A === key.B) problems.push('the key is missing or damaged. Pack again.');
  const [first, second] = [ballots?.AB, ballots?.BA];
  problems.push(...ballotProblems(first, 'AB'), ...ballotProblems(second, 'BA'));
  for (const [order, ballot] of [['AB', first], ['BA', second]]) {
    const reason = ballot ? independence(builder, ballot.judge) : null;
    if (reason) problems.push(`ballot ${order}: ${reason}`);
  }
  if (problems.length) return { status: 2, verdict: null, problems };
  const dimensions = {};
  let after = 0; let before = 0; let split = 0;
  for (const id of DIMENSIONS) {
    const one = first.choices[id] === 'same' ? 'same' : key[first.choices[id]];
    const two = second.choices[id] === 'same' ? 'same' : key[second.choices[id]];
    // A choice counts only when it survives showing the screens in the other order.
    const result = one === two ? one : 'split';
    dimensions[id] = result;
    if (result === 'after') after += 1; else if (result === 'before') before += 1; else if (result === 'split') split += 1;
  }
  const verdict = after >= 3 && before === 0 ? 'AFTER BETTER' : before >= 3 ? 'BEFORE BETTER' : 'NOT PROVEN';
  return {
    status: verdict === 'AFTER BETTER' ? 0 : 1,
    verdict,
    dimensions,
    reversals: split,
    builder: { ...builder, family: familyOf(builder) },
    judges: [first.judge, second.judge].map(judge => ({ ...judge, family: familyOf(judge) })),
    defects: [...(first.defects || []), ...(second.defects || [])].map(item => ({ ...item, screen: key[item.screen] || item.screen })),
    problems: [],
  };
}

export function formatVerdict(result) {
  if (result.status === 2) return ['SECOND EYE  refused', ...result.problems.map(item => `REFUSED ${item}`)].join('\n');
  const lines = [`SECOND EYE  built by ${result.builder.family}, judged by ${result.judges.map(judge => judge.family).join(' and ')}`];
  for (const id of DIMENSIONS) lines.push(`${result.dimensions[id].toUpperCase().padEnd(6)} ${id}`);
  lines.push(`REVERSALS ${result.reversals}/${DIMENSIONS.length} choices changed when the order changed`);
  lines.push(`VERDICT ${result.verdict}`);
  return lines.join('\n');
}

export const INSTRUCTIONS = `# You are the second eye

You did not build either screen. You do not know which is newer. Do not try to find out.

Open only the files in this folder: \`A.png\`, \`B.png\`, \`brief.md\`, and \`reference.png\` when it is there.
Do not read the pull request, the commit messages, the code, or anyone's scorecard.

Fill the ballot you were given. Look at the screens in the order the ballot names.
For each question, answer \`"A"\`, \`"B"\` or \`"same"\`, then write one sentence naming what you saw on the screen that decided it.
Decide every question on its own. Do not pick an overall winner first.
List any defect you can point to in \`defects\`: \`{ "screen": "A", "what": "the total shows the peso sign twice" }\`.
Put the exact model you are in \`judge.model\`.

Questions:
${DIMENSIONS.map(id => `- ${id}: ${QUESTIONS[id]}`).join('\n')}
`;
