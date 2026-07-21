// Tri-City Animal Shelter — Intake Triage Backend
// Supports multiple LLM providers, switchable via the AI_PROVIDER env var.
// - "openrouter" (default): free-tier models, no billing/card required.
// - "anthropic": Claude, paid API (small per-token cost, no free tier).
// Only the key(s) for whichever provider you're using need to be set.

// Tri-City Animal Shelter — Intake Triage Backend
// Supports multiple LLM providers, switchable via the AI_PROVIDER env var.
// - "openrouter" (default): free-tier models, no billing/card required.
// - "anthropic": Claude, paid API (small per-token cost, no free tier).
// Only the key(s) for whichever provider you're using need to be set.

import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const AI_PROVIDER = (process.env.AI_PROVIDER || 'openrouter').toLowerCase();

// Double-check these model names are still current/free before deploying —
// provider lineups change over time.
// - OpenRouter free models: openrouter.ai/models (filter by "Free")
// - Anthropic models: docs.claude.com
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'meta-llama/llama-3.1-8b-instruct:free';
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';

if (AI_PROVIDER === 'openrouter' && !process.env.OPENROUTER_API_KEY) {
  console.warn('WARNING: AI_PROVIDER is "openrouter" but OPENROUTER_API_KEY is not set.');
} else if (AI_PROVIDER === 'anthropic' && !process.env.ANTHROPIC_API_KEY) {
  console.warn('WARNING: AI_PROVIDER is "anthropic" but ANTHROPIC_API_KEY is not set.');
} else if (!['openrouter', 'anthropic'].includes(AI_PROVIDER)) {
  console.warn(`WARNING: Unrecognized AI_PROVIDER "${AI_PROVIDER}". Expected "openrouter" or "anthropic".`);
}

// ---- Placeholder knowledge base — replace with the shelter's real info ----
const KB = `
ADOPTION: Tue-Sat 11am-5pm, closed Sun/Mon/holidays. Fee: $85 dogs, $65 cats (includes spay/neuter, microchip, vaccines). Meet-and-greet recommended before adopting a dog.

FOUND AN ANIMAL: Don't chase a scared animal; note location/time found. Free microchip scan at shelter, no appointment. If healthy, file a found report online/by phone; shelter advises on temp care. If injured, hit by car, or in danger: call shelter's after-hours line or animal control now, don't wait for email.

LOST PET: File a lost-pet report online/by phone with photo and last-seen location/time. Strays are held a minimum period before adoption eligibility - check within that window. In-person check recommended, online photos may be outdated.

SURRENDER: By appointment only (limited kennel space). Bring vaccination records; rehoming questionnaire required. Fee may apply, waivers possible - ask staff. Mention behavioral/medical issues when scheduling.

LICENSING: Dogs over 4 months need an annual city license; requires current rabies vaccination proof. Available online, by mail, or in person.

VOLUNTEERING: 18+ (14+ with guardian for some programs). Orientation required before starting. Roles: dog walking, cat socialization, front desk, adoption events.

EMERGENCIES: Bites, active aggression, hit-by-vehicle, or medical distress are NOT handled here - escalate immediately to staff or animal control, don't wait on chat/email.
`;

const SYSTEM_PROMPT = `You triage a small city animal shelter's public inbox. Answer ONLY from the reference info below.

Rules:
1. If covered by reference info: answer in 2-4 warm, plain-language sentences.
2. If NOT covered, or needs judgment/case details: don't guess - mark for staff follow-up.
3. Bite, active aggression, hit-by-vehicle, or medical distress: always mark urgent.
4. Never invent facts (fees, hours, phone numbers) beyond the reference info.

Respond with ONLY one valid JSON object, nothing else - no markdown fences, no preamble:
{"status": "resolved" | "queued" | "urgent", "reply": "..."}

If your reply needs a quotation mark, escape it (\\") or paraphrase instead of quoting the reference info verbatim.

- "resolved": fully answered from reference info.
- "queued": reasonable question, but needs a staff member. Reply = short friendly holding message, no fabricated answer.
- "urgent": emergency. Reply = tell them to contact the after-hours/emergency line or animal control directly now, briefly say why.

Reference info:
${KB}`;

function cleanJson(raw) {
  const text = (raw || '').trim();

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) return fenced[1].trim();

  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    return text.slice(firstBrace, lastBrace + 1).trim();
  }

  return text;
}



function normalizeResult(parsed) {
  const status = ['resolved', 'queued', 'urgent'].includes(parsed && parsed.status) ? parsed.status : 'queued';
  const reply = (parsed && parsed.reply) || "We've logged this for staff follow-up.";
  return { status, reply };
}

async function callOpenRouter(message) {
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`
    },
    body: JSON.stringify({
      model: OPENROUTER_MODEL,
      max_tokens: 81,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: message }
      ]
    })
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`OpenRouter API error (${response.status}): ${errBody}`);
  }

  const data = await response.json();
  const raw = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
  return cleanJson(raw);
}

async function callAnthropic(message) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 81,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: message }]
    })
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`Anthropic API error (${response.status}): ${errBody}`);
  }

  const data = await response.json();
  const raw = (data.content || [])
    .map((block) => (block.type === 'text' ? block.text : ''))
    .join('');
  return cleanJson(raw);
}

app.post('/api/triage', async (req, res) => {
  const message = (req.body && req.body.message || '').toString().trim();
  if (!message) {
    return res.status(400).json({ error: 'Missing "message" in request body.' });
  }

  try {
    let cleanRaw;
    if (AI_PROVIDER === 'anthropic') {
      cleanRaw = await callAnthropic(message);
    } else {
      cleanRaw = await callOpenRouter(message);
    }

    let parsed;
    try {
      parsed = JSON.parse(cleanRaw);
    } catch (e) {
      console.error('Failed to parse model output as JSON. Raw output was:', cleanRaw);
      parsed = null;
    }

    res.json(normalizeResult(parsed));
  } catch (err) {
    console.error(`${AI_PROVIDER} API error:`, err);
    res.status(500).json({ error: err.message || `Unknown error calling ${AI_PROVIDER} API.` });
  }
});

app.get('/health', (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Tri-City triage server running on port ${PORT}`));
