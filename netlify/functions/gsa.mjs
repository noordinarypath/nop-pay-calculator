// Looks up GSA per diem limits (lodging by month + meals) for a city and state.
// GET /.netlify/functions/gsa?city=Omaha&state=NE&fy=2027
// Netlify environment variable: GSA_API_KEY (free key from api.data.gov).
// GSA publishes new rates every October 1 (the federal fiscal year), so this never needs updating.

const json = (obj, status = 200, cache = true) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: {
      'content-type': 'application/json',
      // Rates only change once a year, so let browsers and Netlify's CDN keep answers for a day.
      ...(cache ? { 'cache-control': 'public, max-age=86400' } : {})
    }
  });

const clean = (s) => String(s || '').toLowerCase().replace(/^(st\.?|saint)\s+/, 'saint ').replace(/[^a-z ]/g, '').trim();

export default async (req) => {
  const q = new URL(req.url).searchParams;
  const city = (q.get('city') || '').trim().slice(0, 60);
  const state = (q.get('state') || '').trim().toUpperCase();
  const zip = (q.get('zip') || '').trim();
  let fy = Number(q.get('fy'));
  if (!/^[A-Z]{2}$/.test(state)) return json({ error: 'Pick a state' }, 400, false);
  if (!fy) { const d = new Date(); fy = d.getMonth() >= 9 ? d.getFullYear() + 1 : d.getFullYear(); }
  if (!process.env.GSA_API_KEY) return json({ error: 'GSA_API_KEY is not set' }, 500, false);

  const base = 'https://api.gsa.gov/travel/perdiem/v2/rates/';
  const path = /^\d{5}$/.test(zip) ? `zip/${zip}/year/${fy}`
    : city ? `city/${encodeURIComponent(city)}/state/${state}/year/${fy}`
    : `state/${state}/year/${fy}`;

  let data;
  try {
    const res = await fetch(base + path + '?api_key=' + process.env.GSA_API_KEY);
    if (!res.ok) {
      console.error('GSA error', res.status, await res.text());
      return json({ error: 'GSA lookup failed' }, 502, false);
    }
    data = await res.json();
  } catch (e) {
    console.error(e);
    return json({ error: 'GSA lookup failed' }, 502, false);
  }

  const rows = (data.rates || []).flatMap((r) => r.rate || []);
  if (!rows.length) return json({ error: 'No rates found' }, 404, false);

  // Prefer the row whose city matches, then any named (non-standard) area, then the standard rate.
  const want = clean(city);
  const isStd = (r) => String(r.standardRate) === 'true' || /standard rate/i.test(r.city || '');
  const names = (r) => String(r.city || '').split(/\s*[\/,]\s*|\s+or\s+|\s+and\s+/i).map(clean);
  let pick = rows.find((r) => want && names(r).includes(want))
    || (zip ? rows.find((r) => !isStd(r)) : null)
    || rows.find(isStd)
    || rows[0];

  // Suburbs (Mesa, Henderson) aren't named in GSA's list, so a city lookup falls back to the
  // standard rate even when the county has a higher one. GSA's ZIP lookup knows the county,
  // so find a ZIP for the city and try again. Any failure keeps the answer we already have.
  if (isStd(pick) && city && !zip) {
    try {
      const zr = await fetch(`https://api.zippopotam.us/us/${state.toLowerCase()}/${encodeURIComponent(city.toLowerCase())}`);
      if (zr.ok) {
        const places = (await zr.json()).places || [];
        const z = places.map((p) => p['post code']).find((c) => /^\d{5}$/.test(c));
        if (z) {
          const gr = await fetch(`${base}zip/${z}/year/${fy}?api_key=${process.env.GSA_API_KEY}`);
          if (gr.ok) {
            const zrows = ((await gr.json()).rates || []).flatMap((r) => r.rate || []);
            const named = zrows.find((r) => !isStd(r));
            if (named) pick = named;
          }
        }
      }
    } catch (e) {
      console.error('ZIP fallback failed', e);
    }
  }

  const months = ((pick.months && pick.months.month) || [])
    .map((m) => ({ n: Number(m.number), v: Number(m.value) }))
    .sort((a, b) => a.n - b.n);

  return json({
    fy,
    state,
    area: pick.city || '',
    county: pick.county || '',
    standard: isStd(pick),
    meals: Number(pick.meals) || 0,
    lodging: months.map((m) => m.v)   // index 0 = January ... 11 = December
  });
};
