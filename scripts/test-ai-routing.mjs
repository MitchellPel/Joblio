/**
 * Smoke-test Joblio AI routing without launching Electron.
 * Run after: npx tsc -p electron/tsconfig.json
 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const {
  extractJobNumber,
  wantsJobContext,
  wantsPriceContext,
} = require(path.join(root, 'dist-electron', 'services', 'joblioAiSession.js'));
const {
  classifyLiveLookup,
  needsLiveLookup,
} = require(path.join(root, 'dist-electron', 'services', 'joblioAiLiveLookup.js'));

function wouldAskForJobNumber(q) {
  const needPrices = wantsPriceContext(q);
  const jobsExplicitlyAsked = wantsJobContext(q) && !needPrices;
  return jobsExplicitlyAsked;
}

const cases = [
  {
    name: 'staff print-cost note (the reported bug)',
    q: 'We pay R2402.91 ex vat for a 50m Digital print Roll you can use R13.45 for our square meter print cost for the printer',
    expect: { jobNo: null, jobs: false, prices: true, askJobNumber: false },
  },
  {
    name: 'hello / general chat',
    q: 'What is a good way to quote vinyl on a vehicle?',
    expect: { jobs: false, askJobNumber: false },
  },
  {
    name: 'explicit job lookup by number',
    q: 'What stage is job 1234 on?',
    expect: { jobNo: '1234', jobs: true, askJobNumber: true },
  },
  {
    name: 'price question that still names a job',
    q: 'How much did we charge on job 1234?',
    expect: { jobNo: '1234', jobs: true, prices: true, askJobNumber: false },
  },
  {
    name: 'who is assigned',
    q: 'Who is assigned to job 5566?',
    expect: { jobNo: '5566', jobs: true },
  },
  {
    name: 'bare job number',
    q: '1234',
    expect: { jobNo: '1234', jobs: true },
  },
  {
    name: 'weather is live, not a job lookup',
    q: 'tell me about the weather in Cape Town',
    expect: { jobs: false, live: 'weather' },
  },
  {
    name: 'load shedding is live, not a job lookup',
    q: 'look up load shedding today',
    expect: { jobs: false, live: 'web' },
  },
  {
    name: 'petrol price is live, not supplier vinyl',
    q: 'what is the petrol price today',
    expect: { jobs: false, live: 'web' },
  },
  {
    name: 'dollar to rand is live fx',
    q: 'what is the USD to ZAR rate',
    expect: { jobs: false, live: 'fx' },
  },
  {
    name: 'what time is it is live time',
    q: 'what time is it',
    expect: { jobs: false, live: 'time' },
  },
  {
    name: 'vinyl price stays on supplier lists',
    q: 'how much is vinyl per sqm',
    expect: { jobs: false, prices: true, live: null },
  },
];

let failed = 0;
for (const c of cases) {
  const got = {
    jobNo: extractJobNumber(c.q),
    jobs: wantsJobContext(c.q),
    prices: wantsPriceContext(c.q),
    askJobNumber: wouldAskForJobNumber(c.q),
    live: classifyLiveLookup(c.q)?.kind ?? null,
    needsLive: needsLiveLookup(c.q),
  };
  const misses = [];
  for (const [k, v] of Object.entries(c.expect)) {
    if (got[k] !== v) misses.push(`${k}: got ${JSON.stringify(got[k])} expected ${JSON.stringify(v)}`);
  }
  if (misses.length) {
    failed++;
    console.log(`FAIL  ${c.name}`);
    misses.forEach((m) => console.log(`      ${m}`));
  } else {
    console.log(`PASS  ${c.name}`);
  }
}

if (failed) {
  console.log(`\n${failed} case(s) failed`);
  process.exit(1);
}
console.log('\nAll routing cases passed.');
