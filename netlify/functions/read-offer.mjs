// Reads a pay package screenshot and returns the numbers as JSON.
// Netlify environment variables:
//   ANTHROPIC_API_KEY  required
//   OFFER_MODEL        optional, defaults to claude-haiku-5-5. Change it here when a model retires,
//                      no code edit needed.
//   ALLOWED_ORIGINS    optional, comma-separated, e.g. https://www.noordinarypath.com,https://nop-pay.netlify.app
//                      When set, only those sites can use this reader (keeps strangers off your API bill).

const PROMPT = 'This image is a travel healthcare (travel nurse) pay package or job offer. Read it and reply with ONLY a JSON object with these keys. Use null for anything not shown. Numbers only, no $ signs.\n' +
  '{"taxable_hourly": number (the rate for regular hours, not the overtime or blended rate), "hours_per_week": number, ' +
  '"weekly_meals": number (weekly meals and incidentals stipend, tax-free), "weekly_housing": number (weekly housing stipend, tax-free), ' +
  '"weekly_stipends": number (all tax-free weekly stipends added together, whatever the agency calls them: housing, lodging, M&IE, per diem, meals; convert daily or monthly amounts to weekly), ' +
  '"weekly_gross": number (total weekly pay including stipends), "contract_weeks": number, ' +
  '"travel_pay": number (total tax-free travel stipend or reimbursement for the contract, add first and last check together), "bonus": number (total taxable sign-on, completion or extension bonuses), "state": "two-letter US state code of the assignment", ' +
  '"city": string (city of the facility), "zip": "5-digit ZIP of the facility if shown", "start_date": "YYYY-MM-DD", "specialty": string, "agency": string (the staffing agency or company name, from a logo, header, signature or email address), "recruiter_contact": string (the recruiter\'s name, phone and email if shown, joined with commas), "notes": string (one short sentence about anything unusual, like a blended rate only)}';

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json' } });

export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  const allowed = (process.env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  const origin = req.headers.get('origin') || '';
  if (allowed.length && !allowed.includes(origin)) return json({ error: 'Not allowed from this site' }, 403);

  let body;
  try { body = await req.json(); } catch { return json({ error: 'Bad request' }, 400); }
  const image = body && body.image;
  const mediaType = (body && body.mediaType) || 'image/jpeg';
  if (!image || typeof image !== 'string' || image.length > 6_000_000) return json({ error: 'Image missing or too large' }, 400);
  if (!/^image\/(jpeg|png|webp|gif)$/.test(mediaType)) return json({ error: 'Unsupported image type' }, 400);

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model: process.env.OFFER_MODEL || 'claude-haiku-5-5',
      max_tokens: 600,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: image } },
          { type: 'text', text: PROMPT }
        ]
      }]
    })
  });

  if (!res.ok) {
    console.error('Anthropic API error', res.status, await res.text());
    return json({ error: 'Reader unavailable' }, res.status === 429 ? 429 : 502);
  }
  const data = await res.json();
  const text = (data.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('');
  const match = text.match(/\{[\s\S]*\}/);
  try {
    return json(JSON.parse(match ? match[0] : text));
  } catch {
    return json({ error: 'Could not read that image' }, 422);
  }
};
