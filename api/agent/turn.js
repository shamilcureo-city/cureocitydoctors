// Vercel Node.js function — Clinical agent turn endpoint.
//
// Sprint 0/3 scaffold. Wires:
//   1. Anthropic Messages API (Claude Sonnet 4.6 default)
//   2. Tool dispatcher (src/lib/agent/tools/index.js)
//   3. Server-Sent Events streaming back to client
//   4. ai_calls cost logging
//   5. Per-org budget enforcement
//   6. Per-consult budget enforcement (NEW; placeholder until column added)
//
// Input  : { consultationId, doctorId, orgId, messages, deepReason? }
// Output : SSE stream of { type, ... } events:
//            type='token'        → { delta }
//            type='tool_use'     → { name, input }
//            type='tool_result'  → { name, output_summary }
//            type='turn_done'    → { _meta }
//            type='error'        → { message }
//
// The client renders agent state from the structured fields the model
// produces in its final text block. Agent output schema is enforced
// via the system prompt (src/lib/agent/systemPrompt.js).

import Anthropic from '@anthropic-ai/sdk';
import { SYSTEM_PROMPT, DEFAULT_MODELS, AGENT_VERSION } from '../../src/lib/agent/systemPrompt.js';
import { TOOL_SCHEMAS } from '../../src/lib/agent/tools/schemas.js';
import { dispatchTool } from '../../src/lib/agent/tools/index.js';
import { checkOrgBudget, budgetBlockedResponse } from '../_lib/budgetCheck.js';

export const config = {
  runtime: 'nodejs',
  regions: ['bom1'],
  maxDuration: 60,
};

// Anthropic 4.6/4.7 published pricing (USD/M tokens), Apr 2026:
//   Sonnet 4.6: $3 in / $15 out
//   Opus 4.7:   $15 in / $75 out
//   Haiku 4.5:  $1 in / $5 out
// USD→INR ≈ 84
const PRICING_INR = {
  'claude-sonnet-4-6':  { in: 252,    out: 1260   },
  'claude-opus-4-7':    { in: 1260,   out: 6300   },
  'claude-haiku-4-5':   { in: 84,     out: 420    },
};

const MAX_TOOL_ITERATIONS = 8;  // hard cap on tool-loop turns per request
const MAX_OUTPUT_TOKENS = 2048;

function sseHeaders() {
  return {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache, no-transform',
    'connection': 'keep-alive',
    'x-accel-buffering': 'no',
  };
}

function sseEvent(controller, type, data) {
  controller.enqueue(
    new TextEncoder().encode(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`)
  );
}

function pickModel({ deepReason }) {
  if (deepReason) return DEFAULT_MODELS.deep;
  return DEFAULT_MODELS.live;
}

function priceUsage(model, usage) {
  const p = PRICING_INR[model];
  if (!p || !usage) return 0;
  return (
    ((usage.input_tokens || 0) / 1e6) * p.in +
    ((usage.output_tokens || 0) / 1e6) * p.out
  );
}

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'content-type': 'application/json' },
    });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY missing' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }

  let body;
  try { body = await req.json(); }
  catch { return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 }); }

  const consultationId = body?.consultationId;
  const doctorId = body?.doctorId;
  const orgId = body?.orgId;
  const messages = Array.isArray(body?.messages) ? body.messages : null;
  const deepReason = !!body?.deepReason;
  const patientContext = body?.patientContext || {};

  if (!messages) return new Response(JSON.stringify({ error: 'messages[] required' }), { status: 400 });

  const budget = await checkOrgBudget(orgId);
  if (budget.blocked) return budgetBlockedResponse(budget);

  const model = pickModel({ deepReason });
  const ctx = { consultationId, doctorId, orgId, patientContext };
  const anthropic = new Anthropic({ apiKey });

  const stream = new ReadableStream({
    async start(controller) {
      const startedAt = Date.now();
      let totalCostInr = 0;
      let totalUsage = { input_tokens: 0, output_tokens: 0 };
      let iteration = 0;
      let working = [...messages];

      try {
        while (iteration < MAX_TOOL_ITERATIONS) {
          iteration++;

          const stream = anthropic.messages.stream({
            model,
            max_tokens: MAX_OUTPUT_TOKENS,
            system: SYSTEM_PROMPT,
            tools: TOOL_SCHEMAS,
            messages: working,
          });

          let assistantBlocks = [];
          let stopReason = null;

          stream.on('text', (delta) => {
            if (delta) sseEvent(controller, 'token', { delta });
          });

          // Tool-use detection happens after the stream resolves; the SDK
          // accumulates content blocks for us.
          const final = await stream.finalMessage();
          assistantBlocks = final.content || [];
          stopReason = final.stop_reason;

          const usage = final.usage || {};
          totalUsage.input_tokens  += usage.input_tokens  || 0;
          totalUsage.output_tokens += usage.output_tokens || 0;
          totalCostInr += priceUsage(model, usage);

          // Append assistant turn to working messages
          working.push({ role: 'assistant', content: assistantBlocks });

          if (stopReason !== 'tool_use') {
            break;
          }

          // Process every tool_use block in parallel; collect tool_results.
          const toolUses = assistantBlocks.filter(b => b.type === 'tool_use');
          const toolResults = await Promise.all(toolUses.map(async (call) => {
            sseEvent(controller, 'tool_use', { name: call.name, input: call.input });
            const result = await dispatchTool(call, ctx);
            sseEvent(controller, 'tool_result', {
              name: call.name,
              output_preview: previewResult(result),
            });
            return result;
          }));

          working.push({ role: 'user', content: toolResults });
        }

        sseEvent(controller, 'turn_done', {
          _meta: {
            agent_version: AGENT_VERSION,
            model,
            iterations: iteration,
            usage: totalUsage,
            cost_inr: Number(totalCostInr.toFixed(4)),
            latency_ms: Date.now() - startedAt,
            budget: {
              today_spend_inr: budget.todaySpendInr,
              cap_inr: budget.capInr,
              near_cap: budget.nearCap,
            },
          },
        });
      } catch (err) {
        sseEvent(controller, 'error', {
          message: err?.message || String(err),
          _meta: { latency_ms: Date.now() - startedAt },
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { status: 200, headers: sseHeaders() });
}

// Truncate tool result for the client preview event. Full result was
// already passed back to the agent loop.
function previewResult(result) {
  try {
    const parsed = typeof result?.content === 'string' ? JSON.parse(result.content) : result?.content;
    if (parsed?.error) return { error: parsed.error };
    if (parsed?.findings) return { finding_count: parsed.findings.length, worst: parsed._meta?.worst_severity };
    if (parsed?.items)    return { result_count: parsed.items.length };
    if (parsed?.score != null) return { score: parsed.score };
    if (parsed?.single_dose_mg != null) return { dose_mg: parsed.single_dose_mg, freq: parsed.frequency };
    return {};
  } catch {
    return {};
  }
}
