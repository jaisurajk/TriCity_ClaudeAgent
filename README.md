# Tri-City Animal Shelter — Intake Triage

An AI-powered triage tool for a small city-run animal shelter's public inbox,
built to cut response time on repetitive questions and route anything urgent
or ambiguous straight to a human.

## The problem

Tri-City Animal Shelter is small and city-run, but reviews consistently flag
slow email and voicemail response. Digging into that, the actual bottleneck
isn't complexity — it's volume: most incoming questions (adoption hours,
found-animal steps, surrender process, licensing) are repetitive and
answerable from a fixed set of facts, but they sit in the same queue as
genuinely urgent cases (a bite, an injured stray, an animal hit by a car),
so nothing gets triaged and everything waits.

## The approach

Rather than a general-purpose chatbot, this is a **narrow triage layer**
with three deliberate constraints:

1. **Answers are grounded, not generated.** The model is instructed to
   answer only from a fixed reference knowledge base and never invent
   shelter-specific facts (fees, hours, phone numbers). If a question isn't
   covered, it's queued for a human instead of guessed at — accuracy matters
   more than always having an answer.
2. **Emergencies bypass the model entirely.** A local keyword check catches
   obvious urgent situations (bites, hit-by-car, active aggression) before
   any API call, so response time for the highest-stakes cases doesn't
   depend on network latency or model output.
3. **Every response is classified**, not just answered — resolved / queued
   for staff / urgent — so the tool's value can actually be measured: what
   fraction of incoming questions get handled instantly vs. correctly
   routed to a person.

## Stack

- **Backend:** Node.js, Express
- **AI:** multi-provider — OpenRouter (free-tier models, default) or Anthropic/Claude (paid), switchable via `AI_PROVIDER` env var, structured JSON output for classification
- **Frontend:** vanilla HTML/CSS/JS (no framework — kept deliberately light)
- **Deployment:** Render / Railway (Node hosting)

## Results

Tested against 5 representative questions spanning the shelter's main
categories:

| # | Question | Expected | Result |
|---|----------|----------|--------|
| 1 | "What are your adoption hours and fees?" | Resolved | |
| 2 | "I found a stray cat in my backyard, what do I do?" | Resolved | |
| 3 | "My dog bit a neighbor's kid, what should I do?" | Urgent | |
| 4 | "I want to surrender my dog because he's been growling at my toddler." | Queued | |
| 5 | "Can I adopt a specific dog I saw on your Instagram three weeks ago?" | Queued | |

*(Fill in the Result column after running the demo — the widget's sidebar
counter tallies resolved/queued/urgent automatically as you go.)*

## What's in here

- `server.js` — Express backend. Supports two LLM providers behind one
  `POST /api/triage` endpoint, switchable via `AI_PROVIDER`:
  - `openrouter` (default) — free-tier models, no billing/card required.
  - `anthropic` — Claude, paid API, no free tier.
  Holds the relevant API key and the knowledge base / system prompt
  server-side either way.
- `public/index.html` — the widget. Calls `/api/triage` — never talks to
  either provider directly, so no key is ever exposed in the browser.
- `package.json` — dependencies.
- `.env.example` — template for your environment variables (both providers).

## 1. Get an API key

**Option A — OpenRouter (free, default):**
1. Go to **openrouter.ai/keys** and sign in (Google/GitHub login works) —
   no credit card required.
2. Create a new key.
3. Check **openrouter.ai/models**, filter by "Free," and confirm the model
   in `.env` (`OPENROUTER_MODEL`) is still listed — free models rotate.

**Option B — Anthropic / Claude (paid, no free tier):**
1. Create a key at **console.anthropic.com**.
2. Set `AI_PROVIDER=anthropic` in `.env` and fill in `ANTHROPIC_API_KEY`.
3. Confirm the current model name at **docs.claude.com** if
   `claude-sonnet-4-6` is no longer current.

## 2. Run it locally

```bash
npm install
cp .env.example .env
# open .env: set AI_PROVIDER, and fill in the key for whichever provider you chose
npm start
```

Then open http://localhost:3000 in your browser.

<img width="1508" height="770" alt="Screenshot 2026-07-11 at 11 52 35 PM" src="https://github.com/user-attachments/assets/bf5c16c1-cfab-4dc5-97cc-36a0cb246839" />
<img width="1669" height="788" alt="Screenshot 2026-07-11 at 11 52 40 PM" src="https://github.com/user-attachments/assets/91ba32d6-ab4b-4fa0-8ffe-6563b1bd83e2" />
<img width="1502" height="813" alt="Screenshot 2026-07-11 at 11 52 46 PM" src="https://github.com/user-attachments/assets/c3b285e7-b1f9-4ef9-b563-39d78d93da8e" />


## 3. Deploy it somewhere public

Any Node host works. Two easy options:

**Render (render.com)**
1. Fork my GitHub repo.
2. New → Web Service → connect the repo.
3. Build command: `npm install`. Start command: `npm start`.
4. Add environment variables matching your `.env` (`AI_PROVIDER` plus the
   key/model pair for whichever provider you're using).
5. Deploy — you'll get a public URL.

**Railway (railway.app)**
1. New Project → Deploy from forked GitHub repo.
2. Add the same variables under Variables.
3. Railway auto-detects the Node app and deploys it.

<img width="1411" height="879" alt="Screenshot 2026-07-14 at 6 58 37 PM" src="https://github.com/user-attachments/assets/fe1d84d8-fa37-4d79-9345-6f3f520732d9" />

Either way: never commit your `.env` file or hardcode any key in
`server.js` — always set it as an environment variable on the host.

## Before using this with the real shelter

The knowledge base in `server.js` (hours, fees, policies) is placeholder
content made up to demonstrate the tool. Replace it with the shelter's
actual, current information before this represents them accurately.
