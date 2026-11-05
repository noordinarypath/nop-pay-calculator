# NOP Pay Calculator

A one-page travel nurse pay calculator. Screenshot or type an offer, answer a few budget questions, get a No / Maybe / Yes / Excellent verdict, break-even and target packages. Leads flow into NOP Leads.

## What's in here

| File | What it is |
|---|---|
| `index.html` | The whole calculator. Tax tables, questions and settings are inside. |
| `netlify/functions/read-offer.mjs` | Reads pay package screenshots with Claude. |
| `netlify/functions/gsa.mjs` | Looks up GSA stipend limits for the assignment city, live. |
| `netlify.toml` | Tells Netlify where the function lives. |
| `apps-script/Calculator.gs` | Lead capture, results email, one follow-up email. Goes in Apps Script, not GitHub. |

## Set it up (about 30 minutes)

1. **GitHub + Netlify.** Make a new repo (for example `nop-pay-calculator`) with `index.html`, `netlify.toml` and the `netlify` folder. Connect it to a new Netlify site, the same way as your other tools.
2. **Netlify environment variables** (Site configuration > Environment variables):
   - `ANTHROPIC_API_KEY`: a new key just for this tool, so you can see its cost and shut it off on its own.
   - `ALLOWED_ORIGINS`: your site addresses, comma-separated, for example `https://nop-pay-calculator.netlify.app,https://www.noordinarypath.com`
   - `GSA_API_KEY`: the free key api.data.gov emailed you. Powers the stipend limits. GSA posts new rates every October 1 and the tool picks them up on its own.
   - `OFFER_MODEL` (optional): leave blank to use `claude-haiku-5-5`. When that model retires, change this value. No code edit needed.
   - In the Anthropic Console, set a monthly spend limit on that key. Each screenshot costs about a penny.
3. **Apps Script.** In the noordinarypath@gmail.com account (the same one NOP Leads runs in), make a new project called NOP Calculator. Paste in `Calculator.gs`, fill in `MAILING_ADDRESS`, run `calcSetup`, then Deploy > New deployment > Web app (Execute as: Me, Who has access: Anyone). Copy the `/exec` URL.
4. **Connect them.** In `index.html`, search for `leadUrl: ''` and paste the `/exec` URL between the quotes. Commit. Netlify redeploys.
5. **Test.** Check a few cities you know the GSA limits for, including a suburb (for example Henderson, NV or Mesa, AZ). If a suburb comes back with the standard rate instead of its metro rate, tell Claude so it can add a city-to-county lookup.
   Then Run `testCalcResults` in Apps Script. Then use the live page yourself with "Text Me About This" and your own cell.
6. **Put it on your site.** Link to it from a Wix button, or embed it with an HTML iframe element pointing to the Netlify URL.

## Two versions, one page

- Public: `https://your-site.netlify.app` asks for name and email before showing results.
- Your desk: `https://your-site.netlify.app/?desk` skips the email step, and the contact card says "Send to Kristin". Give this link to travelers already on your desk.

## Every January

Update the tax block at the top of the script in `index.html` (search for `TAX_YEAR`): federal brackets and standard deduction (IRS Rev. Proc. for the new year), Social Security wage base (SSA), and state rates (Tax Foundation, "State Individual Income Tax Rates and Brackets"). Then change `TAX_YEAR`.

## What the estimate leaves out

Tax home: when the tax home is a different state that also taxes wages, the tool withholds both states, the way Atlas paychecks do. It doesn't model reciprocity agreements between neighboring states or each state's own withholding tables, which tend to take a bit more than the tax actually owed (that comes back as a refund).


City and county taxes in most places (it includes Maryland and Indiana county tax; other states with city taxes show a note), small state payroll programs other than CA SDI, MA PFML and WA Cares, overtime, and tax credits. It annualizes the weekly paycheck the way payroll does, so it lands close to PaycheckCity for a typical traveler.
