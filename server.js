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
TRI-CITY ANIMAL SHELTER — REFERENCE INFO (placeholder, replace with real data)

ADOPTION
- Hours: Tue–Sat, 11am–5pm. Closed Sun/Mon and city holidays.
- Adoption fee: $85 dogs, $65 cats (includes spay/neuter, microchip, first vaccines).
- Meet-and-greets with resident pets recommended before adopting a dog.

FOUND AN ANIMAL
- Do not chase or corner a scared animal. Note the exact location and time found.
- Check for a collar/tag or visible microchip scan (shelter can scan for free, no appointment needed).
- If the animal is healthy and not in immediate danger, you may hold it and file a "found report" online or by phone; shelter can advise on temporary care.
- If injured, hit by a car, or in immediate danger: call the shelter's after-hours line or animal control dispatch right away — do not wait for email response.

LOST A PET
- File a lost-pet report online (link) or by phone with a photo and last-seen location/time.
- Shelter holds stray intakes for a minimum stray hold period (varies by species) before animals become available for adoption — check within that window.
- Check shelter in person if possible; photos online are not always fully up to date.

SURRENDER
- Owner surrenders are by appointment only due to limited kennel space.
- Bring vaccination records if available. A rehoming questionnaire is required.
- Surrender fee may apply; fee waivers available in some cases — ask staff.
- If surrender is due to a behavioral or medical issue, mention this when scheduling so the right staff can be present.

LICENSING
- City ordinance requires dog licenses annually for dogs over 4 months old.
- Proof of current rabies vaccination required to license.
- Licensing can typically be done online, by mail, or in person at the shelter.

VOLUNTEERING
- Volunteers must be 18+ (or 14+ with a guardian for select programs).
- Orientation session required before starting; sessions run periodically — check current schedule.
- Common roles: dog walking, cat socialization, front-desk/reception support, adoption events.

EMERGENCIES / URGENT SITUATIONS
- Animal bites, active aggression, animal hit by a vehicle, or an animal in medical distress are NOT handled by this chat.
- These should be escalated immediately to shelter staff or animal control dispatch — do not attempt to resolve via chat or email.
`;

const SYSTEM_PROMPT = `You are a triage assistant for a small city-run animal shelter's public inbox. You answer ONLY using the reference info provided below.

Rules:
1. If the question is clearly answered by the reference info, answer concisely and warmly (2-4 sentences), in plain language a member of the public would understand.
2. If the question is NOT covered by the reference info, or requires judgment calls, specific case details, or staff discretion, do NOT guess. Instead, mark it for staff follow-up.
3. If the question describes any of: an animal bite, active aggression, an animal hit by a vehicle, an animal in visible medical distress, or any other urgent/emergency situation — mark it urgent regardless of anything else.
4. Never invent shelter-specific facts (exact fees, hours, phone numbers) beyond what's in the reference info.

Respond with ONLY valid JSON, no markdown fences, no preamble, in this exact shape:
{"status": "resolved" | "queued" | "urgent", "reply": "your response text here"}

- status "resolved": you fully answered from the reference info.
- status "queued": the question is reasonable but needs a staff member (not covered by reference info, or needs case-specific judgment). In "reply", write a short, friendly holding message telling the person their question has been logged for staff and roughly what to expect next — do not fabricate an answer.
- status "urgent": emergency situation. In "reply", tell the person clearly and calmly to contact the shelter's after-hours/emergency line or animal control dispatch directly rather than waiting on chat/email, and briefly say why (their safety / the animal's).

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

function hasAny(text, keywords) {
  return keywords.some((keyword) => text.includes(keyword));
}

function localTriage(message) {
  const text = message.toLowerCase();

  if (hasAny(text, [
    'bite', 'bit me', 'attacked', 'attacking', 'aggressive', 'hit by a car',
    'hit by car', 'hbc', 'bleeding', 'dying', 'seizure', 'unconscious',
    'not breathing', 'emergency', "can't breathe", 'struck by a vehicle',
    'run over', 'medical distress'
  ])) {
    return {
      status: 'urgent',
      reply: "This sounds urgent. Please contact the shelter's after-hours line or animal control dispatch right away rather than waiting on chat or email, so staff can help keep you and the animal safe."
    };
  }

  if (hasAny(text, ['adoption', 'adopt', 'hours', 'fee', 'fees', 'meet-and-greet', 'meet and greet'])) {
    return {
      status: 'resolved',
      reply: 'Adoption hours are Tuesday through Saturday, 11am to 5pm. The shelter is closed Sunday, Monday, and city holidays. Adoption fees are $85 for dogs and $65 for cats, including spay/neuter, microchip, and first vaccines.'
    };
  }

  if (hasAny(text, ['surrender', 'rehome', 'give up my', 'give up a', 'turn in my', 'turn in a'])) {
    return {
      status: 'resolved',
      reply: 'Owner surrenders are by appointment only because kennel space is limited. Bring vaccination records if you have them, and expect to complete a rehoming questionnaire. A surrender fee may apply, though fee waivers may be available in some cases.'
    };
  }

  if (hasAny(text, ['found', 'stray', 'loose dog', 'loose cat'])) {
    return {
      status: 'resolved',
      reply: 'If you found an animal, do not chase or corner it if it seems scared. Note the exact location and time found, check for a collar or tag if it is safe, and contact the shelter so they can scan for a microchip or help you file a found report.'
    };
  }

  if (hasAny(text, ['lost', 'missing', 'last seen'])) {
    return {
      status: 'resolved',
      reply: 'File a lost-pet report with a photo and the last-seen location and time. If possible, check the shelter in person too, because online photos may not always be fully up to date.'
    };
  }

  if (hasAny(text, ['license', 'licensing', 'rabies'])) {
    return {
      status: 'resolved',
      reply: 'Dogs over 4 months old need an annual license, and proof of current rabies vaccination is required. Licensing can typically be completed online, by mail, or in person at the shelter.'
    };
  }

  if (hasAny(text, ['volunteer', 'volunteering', 'orientation'])) {
    return {
      status: 'resolved',
      reply: 'Volunteers must be 18 or older, or 14 or older with a guardian for select programs. An orientation session is required before starting, and common roles include dog walking, cat socialization, front-desk support, and adoption events.'
    };
  }

  return null;
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
      max_tokens: 300,
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
      model: OPENROUTER_MODEL,
      max_tokens: 300,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: message }
      ]
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
