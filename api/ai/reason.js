// Vercel Node.js function — Claude clinical-reasoning endpoint with SSE streaming.
//
// Input  : { caseSummary: string, citations: object[], settings?: { model?: string } }
// Output : Server-Sent Events stream of {type:'delta',text} ... {type:'done',meta}
//
// Deterministic engine (KBE) computes the differential, red flags, calculators.
// This endpoint adds *narrative reasoning* — a senior clinician's "thinking out
// loud" pass over the case — strictly grounded in the KB excerpts the engine
// already selected. We do NOT ask Claude to invent diagnoses outside the KB.
//
// Pinned to bom1 (Mumbai) for India-residency expectations during execution.
// Anthropic inference itself routes via api.anthropic.com (US).

import Anthropic from '@anthropic-ai/sdk';

export const config = {
  runtime: 'nodejs20.x',
  regions: ['bom1'],
};

const DEFAULT_MODEL = 'claude-opus-4-7';
const MAX_INPUT_CHARS = 24_000;
const MAX_OUTPUT_TOKENS = 1500;

// claude-opus-4-7 indicative pricing: $15/$75 per 1M tok in/out (Anthropic public).
// USD→INR ≈ 84. Used for ai_calls dashboarding.
const COST_INR_PER_M_INPUT = 1260;
const COST_INR_PER_M_OUTPUT = 6300;

const SYSTEM_INSTRUCTION = `You are an experienced senior physician acting as a second pair of eyes for an Indian primary-care doctor. The doctor has already run a deterministic clinical decision-support engine (KBE) that produced a differential, red flags, lab interpretations, and KB excerpts.

Your job is *clinical reasoning* over the case — what the engine cannot do well: weighing context, sequencing investigations, flagging cognitive traps. Strict rules:

1. STAY IN THE KB. The doctor will give you KB excerpts (treatment lines, monitoring tables, India context). Cite from those. If you mention a guideline (NICE/ESC/GINA/ICMR/etc), only do so if it appears in the excerpts.
2. NEVER invent a diagnosis or drug not in the case data or KB excerpts.
3. NEVER replace the deterministic differential — comment on it, refine ordering, suggest which T2 might deserve T1 promotion based on the narrative, and which T3 (must-not-miss) needs immediate exclusion.
4. Recognise Indian primary-care realities: limited access to advanced imaging in tier-2/3 cities, cost constraints, common tropical infections (dengue, leptospirosis, scrub typhus, typhoid), antibiotic stewardship.
5. Output structured Markdown sections in this order:
   ### Clinical Snapshot
   ### Working Hypothesis (refining the differential)
   ### Critical Questions To Ask
   ### Recommended Workup (ordered, with India-context cost notes where relevant)
   ### Red Flag / Safety-Net Considerations
   ### Patient Communication Notes
6. Keep total response under 800 words. Be precise, not verbose.
7. End with: "—\n\nThis is supplementary reasoning, not a substitute for clinical judgement. The doctor's assessment of the patient remains primary."`;

function sseLine(obj) {
  return `data: ${JSON.stringify(obj)}\n\n`;
}

function badRequest(text, status = 400) {
  return new Response(text, { status, headers: { 'content-type': 'text/plain' } });
}

export default async function handler(req) {
  if (req.method !== 'POST') return badRequest('Method not allowed', 405);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return badRequest('Server misconfigured: ANTHROPIC_API_KEY missing', 503);

  let body;
  try {
    body = await req.json();
  } catch {
    return badRequest('Invalid JSON body', 400);
  }

  const caseSummary = typeof body?.caseSummary === 'string' ? body.caseSummary.trim() : '';
  const citations = Array.isArray(body?.citations) ? body.citations : [];
  const model = (body?.settings?.model && typeof body.settings.model === 'string')
    ? body.settings.model
    : DEFAULT_MODEL;

  if (!caseSummary) return badRequest('caseSummary is required', 400);
  if (caseSummary.length > MAX_INPUT_CHARS) {
    return badRequest(`caseSummary too long (max ${MAX_INPUT_CHARS} chars)`, 413);
  }

  // Build the user message: case summary + KB excerpts as a single Markdown blob.
  const citationsText = citations.length
    ? '\n\n## KB Excerpts (use these for citations only)\n\n' + citations
        .slice(0, 6)
        .map((c, i) => `### Source ${i + 1} — ${c.condName || 'Unknown condition'}\n${(c.excerpt || '').slice(0, 1500)}`)
        .join('\n\n')
    : '';

  const userMessage = `## Current Case (from KBE engine)\n\n${caseSummary}${citationsText}\n\nProvide your structured clinical reasoning per the system instructions.`;

  const startedAt = Date.now();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj) => controller.enqueue(encoder.encode(sseLine(obj)));

      let totalText = '';
      let usage = { input_tokens: 0, output_tokens: 0 };

      try {
        const client = new Anthropic({ apiKey });
        const response = await client.messages.stream({
          model,
          max_tokens: MAX_OUTPUT_TOKENS,
          system: SYSTEM_INSTRUCTION,
          messages: [{ role: 'user', content: userMessage }],
        });

        for await (const event of response) {
          if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
            const chunk = event.delta.text || '';
            totalText += chunk;
            send({ type: 'delta', text: chunk });
          } else if (event.type === 'message_delta' && event.usage) {
            usage = { ...usage, ...event.usage };
          } else if (event.type === 'message_start' && event.message?.usage) {
            usage = { ...usage, ...event.message.usage };
          }
        }

        const finalMessage = await response.finalMessage();
        if (finalMessage?.usage) {
          usage = {
            input_tokens: finalMessage.usage.input_tokens ?? usage.input_tokens,
            output_tokens: finalMessage.usage.output_tokens ?? usage.output_tokens,
          };
        }

        const tokensIn = usage.input_tokens || 0;
        const tokensOut = usage.output_tokens || 0;
        const costInr = (tokensIn / 1e6) * COST_INR_PER_M_INPUT + (tokensOut / 1e6) * COST_INR_PER_M_OUTPUT;
        const latencyMs = Date.now() - startedAt;

        send({
          type: 'done',
          meta: {
            provider: 'anthropic',
            model,
            tokensIn,
            tokensOut,
            costInr: Number(costInr.toFixed(4)),
            latencyMs,
            chars: totalText.length,
          },
        });
      } catch (err) {
        const msg = err?.message || 'Claude call failed';
        console.error('[ai/reason] anthropic error', msg);
        send({ type: 'error', error: msg });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
      'x-accel-buffering': 'no',
    },
  });
}
