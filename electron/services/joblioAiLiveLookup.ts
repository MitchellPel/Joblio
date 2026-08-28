/**
 * Live lookups for Joblio AI — weather, rates, time, news, and general web.
 * Joblio extras stay for jobs/prices; these cover "what's happening out there".
 */

export type LiveLookupKind = 'weather' | 'fx' | 'time' | 'web';

export type LiveLookup = {
  kind: LiveLookupKind;
  status: string;
  title: string;
};

const SA_PLACES = [
  'cape town',
  'johannesburg',
  'pretoria',
  'durban',
  'gqeberha',
  'port elizabeth',
  'bloemfontein',
  'polokwane',
  'nelspruit',
  'mbombela',
  'east london',
  'pietermaritzburg',
  'kimberley',
  'rustenburg',
  'sandton',
  'centurion',
  'soweto',
];

export function isWeatherQuestion(q: string): boolean {
  return /\b(weather|forecast|temperature|rain|raining|sunny|cloudy|degrees|°c|°f|how hot|how cold|umbrella|jacket|outside today|weather (today|tomorrow|now|report)|what'?s it like outside)\b/i.test(
    q
  );
}

export function isFxQuestion(q: string): boolean {
  return /\b(exchange rate|forex|currency|usd|gbp|eur|us dollar|the dollar|a dollar|dollars? to|to zar|to rand|yen|yuan|pound sterling|euro to|rand to (the )?(dollar|usd|euro|pound|gbp))\b/i.test(
    q
  );
}

export function isTimeQuestion(q: string): boolean {
  return /\b(what time is it|current time|time now|time in (cape|johannesburg|durban|pretoria|london|new york))\b/i.test(
    q
  );
}

export function wantsExplicitWeb(q: string): boolean {
  return /\b(search online|look online|find online|google|on the (web|internet)|cheaper online|find a cheaper|look (it|this|that) up online)\b/i.test(
    q
  );
}

export function isNewsOrCurrentQuestion(q: string): boolean {
  return /\b(news|headlines|breaking|current events?|who won|score|load.?shedding|eskom|petrol price|diesel price|fuel price|traffic|road closed|public holiday|is (it|today) a holiday|gold price|bitcoin|brent|jse)\b/i.test(
    q
  );
}

/** Needs facts from outside Joblio (jobs/prices/notes). Add a kind here when staff ask a new live topic. */
export function needsLiveLookup(q: string): boolean {
  return (
    isWeatherQuestion(q) ||
    isFxQuestion(q) ||
    isTimeQuestion(q) ||
    isNewsOrCurrentQuestion(q) ||
    wantsExplicitWeb(q)
  );
}

export function classifyLiveLookup(q: string): LiveLookup | null {
  if (isWeatherQuestion(q)) {
    return { kind: 'weather', status: 'Looking up live weather…', title: 'Live weather' };
  }
  if (isTimeQuestion(q)) {
    return { kind: 'time', status: 'Checking the time…', title: 'Current time' };
  }
  if (isFxQuestion(q)) {
    return { kind: 'fx', status: 'Looking up exchange rates…', title: 'Live exchange rates' };
  }
  if (isNewsOrCurrentQuestion(q) || wantsExplicitWeb(q)) {
    return { kind: 'web', status: 'Searching the web…', title: 'Live web search' };
  }
  return null;
}

function extractPlace(question: string): string {
  const q = question.toLowerCase();
  for (const p of SA_PLACES) {
    if (q.includes(p)) return p;
  }
  const m = question.match(
    /\b(?:in|for|at|near)\s+([A-Za-z][A-Za-z' -]{1,36}?)(?:\s+(?:today|tomorrow|now|please)|\s*[?.!]|$)/i
  );
  return m?.[1]?.trim() || '';
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchLiveWeather(question: string): Promise<string> {
  const place = extractPlace(question);
  const loc = place ? encodeURIComponent(place) : '';
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(`https://wttr.in/${loc}?format=j1`, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'curl/8.0', Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`wttr ${res.status}`);
    const data = (await res.json()) as {
      nearest_area?: { areaName?: { value: string }[]; region?: { value: string }[]; country?: { value: string }[] }[];
      current_condition?: {
        temp_C?: string;
        FeelsLikeC?: string;
        humidity?: string;
        windspeedKmph?: string;
        weatherDesc?: { value: string }[];
        precipMM?: string;
      }[];
      weather?: { maxtempC?: string; mintempC?: string; hourly?: { chanceofrain?: string }[] }[];
    };
    const area = data.nearest_area?.[0];
    const where = [area?.areaName?.[0]?.value, area?.region?.[0]?.value, area?.country?.[0]?.value]
      .filter(Boolean)
      .join(', ');
    const cur = data.current_condition?.[0];
    const today = data.weather?.[0];
    const tomorrow = data.weather?.[1];
    if (!cur) throw new Error('no current');
    const desc = cur.weatherDesc?.[0]?.value || '';
    const rainNow = today?.hourly?.map((h) => Number(h.chanceofrain || 0)).reduce((a, b) => Math.max(a, b), 0);
    const lines = [
      `Location: ${where || place || 'this PC'}`,
      `Now: ${desc}, ${cur.temp_C}°C (feels ${cur.FeelsLikeC}°C), wind ${cur.windspeedKmph} km/h, humidity ${cur.humidity}%, rain ${cur.precipMM} mm`,
    ];
    if (today) {
      lines.push(
        `Today: high ${today.maxtempC}°C / low ${today.mintempC}°C${
          rainNow ? `, up to ${rainNow}% chance of rain` : ''
        }`
      );
    }
    if (tomorrow) lines.push(`Tomorrow: high ${tomorrow.maxtempC}°C / low ${tomorrow.mintempC}°C`);
    return lines.join('\n');
  } catch {
    try {
      const ctrl2 = new AbortController();
      const t2 = setTimeout(() => ctrl2.abort(), 6000);
      const plain = await fetch(`https://wttr.in/${loc}?format=3`, {
        signal: ctrl2.signal,
        headers: { 'User-Agent': 'curl/8.0' },
      });
      clearTimeout(t2);
      const text = (await plain.text()).trim();
      if (text && !/unknown|sorry/i.test(text)) return text;
    } catch {
      // fall through
    }
    return '(Live weather lookup failed — this PC needs internet. Try again in a moment.)';
  } finally {
    clearTimeout(t);
  }
}

function fxPair(question: string): { from: string; to: string } {
  const q = question.toUpperCase();
  const code = (s: string) => (/\bUSD\b/.test(s) ? 'USD' : /\bEUR\b|\bEURO\b/.test(s) ? 'EUR' : /\bGBP\b|\bPOUND\b/.test(s) ? 'GBP' : null);
  if (/\bZAR\b|\bRAND/.test(q) && /\bto (usd|dollar|eur|euro|gbp|pound)/i.test(question)) {
    const to = code(q) || 'USD';
    return { from: 'ZAR', to };
  }
  const from = code(q) || 'USD';
  return { from, to: 'ZAR' };
}

async function fetchFx(question: string): Promise<string> {
  const { from, to } = fxPair(question);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(`https://api.frankfurter.app/latest?from=${from}&to=${to}`, {
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`fx ${res.status}`);
    const data = (await res.json()) as { date?: string; rates?: Record<string, number> };
    const rate = data.rates?.[to];
    if (!rate) throw new Error('no rate');
    return `${from} → ${to}: ${rate} (ECB, ${data.date || 'today'}). Ballpark only — banks add a spread.`;
  } catch {
    return '(Exchange rate lookup failed — this PC needs internet. Try again in a moment.)';
  } finally {
    clearTimeout(t);
  }
}

function fetchLocalTime(question: string): string {
  const zone = /\b(cape town|durban)\b/i.test(question)
    ? 'Africa/Johannesburg'
    : /\b(london|uk|britain)\b/i.test(question)
      ? 'Europe/London'
      : /\b(new york|usa|eastern)\b/i.test(question)
        ? 'America/New_York'
        : 'Africa/Johannesburg';
  const now = new Date();
  const text = new Intl.DateTimeFormat('en-ZA', {
    timeZone: zone,
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(now);
  return `${text} (${zone}).`;
}

export function webSearchQuery(question: string): string {
  const q = question.trim();
  if (/\b(load.?shedding|eskom)\b/i.test(q)) {
    const place = extractPlace(q);
    return `load shedding ${place || 'South Africa'} today Eskom`.slice(0, 180);
  }
  if (/\b(petrol|diesel|fuel) price\b/i.test(q)) {
    return 'petrol diesel price South Africa today'.slice(0, 180);
  }
  if (/\b(public holiday|holiday today)\b/i.test(q)) {
    return 'South Africa public holiday today'.slice(0, 180);
  }
  if (/\b(news|headlines)\b/i.test(q)) {
    return `${q} South Africa`.slice(0, 180);
  }
  if (/\b(weather|forecast|temperature)\b/i.test(q)) return q.slice(0, 180);
  if (
    /\b(cheaper|better price|best price|shop around|supplier|vinyl|acrylic)\b/i.test(q)
  ) {
    return `${q} South Africa`.slice(0, 180);
  }
  return q.slice(0, 180);
}

export async function webSearch(question: string): Promise<string> {
  const q = webSearchQuery(question);
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 7000);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Accept: 'text/html',
      },
    });
    const html = await res.text();
    const blocks: string[] = [];
    const re =
      /class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?class="result__snippet"[^>]*>([\s\S]*?)<\/div>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) && blocks.length < 5) {
      const title = decodeEntities(m[2]);
      const snip = decodeEntities(m[3]);
      if (title) blocks.push(`- ${title}: ${snip}`);
    }
    if (!blocks.length) return '(Web search returned no snippets. Try rephrasing.)';
    return blocks.join('\n');
  } catch {
    return '(Web search failed — check this PC has internet.)';
  } finally {
    clearTimeout(t);
  }
}

export async function fetchLiveLookup(question: string, kind: LiveLookupKind): Promise<string> {
  if (kind === 'weather') return fetchLiveWeather(question);
  if (kind === 'fx') return fetchFx(question);
  if (kind === 'time') return fetchLocalTime(question);
  return webSearch(question);
}
