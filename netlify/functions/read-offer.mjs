// Reads a pay package screenshot and returns the numbers as JSON.
// Netlify environment variables:
//   ANTHROPIC_API_KEY  required
//   OFFER_MODEL        optional, defaults to claude-haiku-5-5. Change it here when a model retires,
//                      no code edit needed.
//   ALLOWED_ORIGINS    optional, comma-separated, e.g. https://www.noordinarypath.com,https://nop-pay.netlify.app
//                      When set, only those sites can use this reader (keeps strangers off your API bill).

const PROMPT = 'This image is a travel healthcare (travel nurse) pay package, job offer or job post. Read it and call save_offer with what you find. ' +
  'Leave out anything not shown. Numbers are plain numbers with no $ signs or commas. Convert daily or monthly stipends to weekly.';

const num = (d) => ({ type: 'number', description: d });
const str = (d) => ({ type: 'string', description: d });
const TOOL = {
  name: 'save_offer',
  description: 'Save the pay numbers and details read from the offer.',
  input_schema: {
    type: 'object',
    properties: {
      taxable_hourly: num('The taxable rate for regular hours, not the overtime or blended rate'),
      hours_per_week: num('Guaranteed hours per week'),
      weekly_meals: num('Weekly meals and incidentals stipend, tax-free'),
      weekly_housing: num('Weekly housing or lodging stipend, tax-free'),
      weekly_stipends: num('All tax-free weekly stipends added together, whatever the agency calls them'),
      weekly_gross: num('Total weekly pay including stipends'),
      contract_weeks: num('Contract length in weeks'),
      travel_pay: num('Total tax-free travel stipend or reimbursement for the contract, first and last check added together'),
      bonus: num('Total taxable sign-on, completion or extension bonuses'),
      state: str('Two-letter US state code of the assignment'),
      city: str('City of the facility'),
      zip: str('5-digit ZIP of the facility'),
      start_date: str('Start date as YYYY-MM-DD'),
      specialty: str('Specialty or unit, e.g. Med Surg / Ortho'),
      agency: str('Staffing agency or company name, from a logo, header, signature, email address or the text'),
      recruiter_contact: str('Recruiter name, phone and email if shown, joined with commas'),
      notes: str('One short sentence about anything unusual, like a blended rate only')
    }
  }
};

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
      max_tokens: 1024,
      tools: [TOOL],
      tool_choice: { type: 'tool', name: 'save_offer' },
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
  const used = (data.content || []).find((c) => c.type === 'tool_use');
  if (used && used.input && typeof used.input === 'object') return json(used.input);
  // Fallback: pull a JSON object out of any text reply.
  const text = (data.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('');
  const match = text.match(/\{[\s\S]*\}/);
  try {
    return json(JSON.parse(match ? match[0] : text));
  } catch {
    console.error('Could not parse reader reply', data.stop_reason, text.slice(0, 1500));
    return json({ error: 'Could not read that image' }, 422);
  }
};
