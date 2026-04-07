// API Route: Chat with AI assistant — streaming research updates
import { NextRequest, NextResponse } from 'next/server';
import { chatWithOpenAI, classifyIntent, classifyIntentWithTools, SYSTEM_PROMPT, ChatMessage } from '@/lib/openai';
import { researchCompany, batchResearchCompanies, findContactForCompany } from '@/lib/ai-agent';
import prisma from '@/lib/db';
import { handleNaturalLanguageFormat } from '@/lib/sheets-formatter';
import { getAIModeFromRequest } from '@/lib/ai-mode';
import { getSheetCompanyNames } from '@/lib/sheets-sync';
import * as groveMemory from '@/lib/grove-memory';

// Allow up to 300 seconds for long-running research on Vercel Pro
export const maxDuration = 300;

// Internal header that lets server-to-server fetches bypass the auth middleware
const INTERNAL_HEADERS = {
  'Content-Type': 'application/json',
  'x-grove-internal': process.env.INTERNAL_API_SECRET || 'grove-internal-2026',
};

// ── Streaming helper ────────────────────────────────────────────────────────
type StreamChunk =
  | { type: 'step';    text: string; icon?: string; sub?: string }
  | { type: 'progress'; current: number; total: number; company: string }
  | { type: 'result';  message: string; savedCompanies?: number }
  | { type: 'error';   message: string };

function makeStream(
  fn: (emit: (chunk: StreamChunk) => void) => Promise<void>
): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (chunk: StreamChunk) => {
        controller.enqueue(encoder.encode(JSON.stringify(chunk) + '\n'));
      };
      try {
        await fn(emit);
      } catch (err) {
        emit({ type: 'error', message: err instanceof Error ? err.message : String(err) });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson',
      'Cache-Control': 'no-cache',
      'X-Accel-Buffering': 'no',
    },
  });
}

// ── Research helper (shared across actions) ─────────────────────────────────
async function runResearch(
  companies: string[],
  origin: string,
  emit: (c: StreamChunk) => void,
  prefix = ''
): Promise<{ results: string; savedCompanies: { company_name: string }[]; failCount: number }> {
  let results = prefix;
  let failCount = 0;
  const savedCompanies: { company_name: string }[] = [];

  for (let i = 0; i < companies.length; i++) {
    const companyName = companies[i];

    emit({ type: 'progress', current: i, total: companies.length, company: companyName });
    emit({ type: 'step', text: `Researching ${companyName}…`, icon: '🔬', sub: `${i + 1} of ${companies.length}` });

    try {
      emit({ type: 'step', text: `Searching the web for ${companyName}`, icon: '🌐' });

      // #8: Retry logic — up to 2 attempts on failure
      let companyData = null;
      let lastErr: unknown = null;
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          companyData = await researchCompany(companyName);
          break;
        } catch (err) {
          lastErr = err;
          if (attempt < 2) {
            const retryMsg = err instanceof Error ? err.message.slice(0, 60) : 'unknown error';
            emit({ type: 'step', text: `Retrying ${companyName}…`, icon: '🔄', sub: `Attempt ${attempt} failed: ${retryMsg}` });
            await new Promise(r => setTimeout(r, 2000));
          }
        }
      }
      if (!companyData) throw lastErr;

      const contactVerified = companyData.contact_name && companyData.contact_name !== 'Not found';
      emit({ type: 'step', text: `Validating contact data`, icon: contactVerified ? '✅' : '⚠️', sub: contactVerified ? companyData.contact_name : 'No verified current contact found' });

      try {
        const saveResponse = await fetch(`${origin}/api/companies`, {
          method: 'POST',
          headers: INTERNAL_HEADERS,
          body: JSON.stringify({ companyName: companyData.company_name, autoResearch: false, companyData }),
        });
        if (saveResponse.ok) {
          savedCompanies.push(companyData);
          emit({ type: 'step', text: `Saved ${companyData.company_name} to pipeline`, icon: '💾', sub: `Score: ${companyData.sponsorship_likelihood_score}/10` });
        } else {
          savedCompanies.push(companyData);
        }
      } catch {
        savedCompanies.push(companyData);
      }

      results += `## ${i + 1}/${companies.length} — ${companyData.company_name}\n\n`;
      results += `✅ **${companyData.company_name}** — ${companyData.industry}\n\n`;
      results += `**Website:** ${companyData.website}\n\n`;
      results += `**Contact:** ${companyData.contact_name || 'Not found'} — ${companyData.contact_position || 'Not found'}\n\n`;
      if (companyData.contact_linkedin) results += `**LinkedIn:** [${companyData.contact_name || 'Profile'}](${companyData.contact_linkedin})\n\n`;
      if (companyData.linkedin_company) results += `**Company LinkedIn:** [${companyData.company_name}](${companyData.linkedin_company})\n\n`;
      if (companyData.previous_events?.length) results += `**Previously Sponsored:** ${companyData.previous_events.join(', ')}\n\n`;
      results += `**Score:** ${companyData.sponsorship_likelihood_score}/10\n\n---\n\n`;
    } catch (err) {
      failCount++;
      const msg = err instanceof Error ? err.message : String(err);
      emit({ type: 'step', text: `Could not validate ${companyName}`, icon: '❌', sub: msg.slice(0, 80) });
      results += `## ${i + 1}/${companies.length} — ${companyName}\n\n`;
      results += `❌ **${companyName}** — Could not validate data\n\n---\n\n`;
    }

    if (i < companies.length - 1) {
      emit({ type: 'step', text: `Cooling down before next search…`, icon: '⏳' });
      await new Promise(r => setTimeout(r, 3000));
    }
  }

  return { results, savedCompanies, failCount };
}

export async function POST(request: NextRequest) {
  // Read AI mode from request cookie — works across Vercel cold starts
  const aiMode = getAIModeFromRequest(request);

  try {
    // Parse request body ONCE
    const body = await request.json();
    const { messages, action, companyNames } = body;

    // Handle deep research action — STREAMING
    if (action === 'deep_research') {
      if (!companyNames || !Array.isArray(companyNames)) {
        return NextResponse.json({ success: false, error: 'Company names are required for deep research' }, { status: 400 });
      }

      return makeStream(async (emit) => {
        emit({ type: 'step', text: `Starting deep research on ${companyNames.length} companies`, icon: '🚀', sub: companyNames.join(', ') });

        const results = `# Deep Research Results\n\nResearching **${companyNames.length}** companies with strict validation…\n\n---\n\n`;
        const { results: r, savedCompanies, failCount } = await runResearch(companyNames, request.nextUrl.origin, emit, results);

        const finalResults = r +
          `## Summary\n\n✅ **Passed Validation:** ${savedCompanies.length}/${companyNames.length}\n\n` +
          (failCount > 0 ? `❌ **Failed Validation:** ${failCount}/${companyNames.length}\n\n` : '') +
          `💾 **Saved to Pipeline:** ${savedCompanies.length} companies\n\n` +
          `**Refresh the page** to see saved companies in the sidebar.\n`;

        emit({ type: 'result', message: finalResults, savedCompanies: savedCompanies.length });
      });
    }

    // Handle different actions
    if (action === 'research_company') {
      const { companyName } = body;
      const result = await researchCompany(companyName);
      return NextResponse.json({ success: true, data: result });
    }

    if (action === 'batch_research') {
      const { companyNames: batchNames } = body;
      const results = await batchResearchCompanies(batchNames);
      return NextResponse.json({ success: true, data: results });
    }

    // All natural language chat goes through the AI intent classifier — streaming
    return makeStream(async (emit) => {
      const systemMessage: ChatMessage = { role: 'system', content: SYSTEM_PROMPT };
      void systemMessage; // system prompt is used as base for enrichedSystem below
      const userMessage = messages[messages.length - 1]?.content || '';

    // ── Memory: extract & save facts passively, then build context summary ───
    await groveMemory.extractAndSave(userMessage).catch(() => {/* non-blocking */});
    const memorySummary = await groveMemory.getSummary().catch(() => '');

    // ── AI INTENT CLASSIFIER (OpenAI Function Calling) ────────────────────────
    // Uses tool/function calling — the model MUST call one of our named tools.
    // No JSON parsing fragility, no regex, no prompt-engineering guesswork.

    emit({ type: 'step', text: 'Understanding your request…', icon: '🧠' });

    const existingRes = await fetch(`${request.nextUrl.origin}/api/companies`);
    const existingData = await existingRes.json();
    const existingCompanies: { id: string; company_name: string; contact_name?: string; outreach_status?: string; website?: string; linkedin_company?: string; sponsorship_likelihood_score?: number }[] =
      existingData.data || [];

    const companySummary = existingCompanies.length > 0
      ? existingCompanies.map(c => `- "${c.company_name}" (id: ${c.id}, score: ${c.sponsorship_likelihood_score ?? 'N/A'}/10, contact: ${c.contact_name || 'none'}, status: ${c.outreach_status || 'not_started'})`).join('\n')
      : '(no companies in pipeline yet)';

    const intent = await classifyIntentWithTools(userMessage, companySummary);

    console.log(`🧠 Intent classified: ${String(intent.intent)}`, intent);

    // ── RESEARCH NEW COMPANIES ─────────────────────────────────────────────────
    if (intent.intent === 'RESEARCH_NEW_COMPANIES') {
      const count = Math.min(Math.max(Number(intent.count) || 5, 1), 20);

      const selectionPrompt = `You are a sponsor researcher for Sloss.Tech, a technology conference in Birmingham, Alabama.

The user wants ${count} new potential corporate sponsors. Their request: "${userMessage}"

Companies ALREADY in the pipeline (do NOT suggest these): ${existingCompanies.map(c => c.company_name).join(', ') || 'none'}

Pick exactly ${count} real companies that:
- Have active tech sponsorship or developer community programs
- Have not already been researched (not in the list above)
- Match the user's criteria if they specified any

Return ONLY a JSON array of company name strings. Example: ["Stripe", "Twilio", "Datadog"]`;

      let chosenCompanies: string[] = [];
      try {
        const aiRaw = await classifyIntent([{ role: 'user', content: selectionPrompt }]);
        const jsonMatch = aiRaw.replace(/```json\n?/g, '').replace(/```\n?/g, '').match(/\[[\s\S]*?\]/);
        if (jsonMatch) chosenCompanies = JSON.parse(jsonMatch[0]).slice(0, count);
      } catch { /* fallback */ }
      if (!chosenCompanies.length) chosenCompanies = ['Stripe', 'Twilio', 'Datadog', 'MongoDB', 'Cloudflare'].slice(0, count);

      emit({ type: 'step', text: `Queued ${chosenCompanies.length} companies for research`, icon: '🎯', sub: chosenCompanies.join(', ') });

      const prefix = `# 🔬 Researching ${chosenCompanies.length} Companies for Sloss.Tech\n\nSelected: **${chosenCompanies.join(', ')}**\n\n---\n\n`;
      const { results, savedCompanies, failCount } = await runResearch(chosenCompanies, request.nextUrl.origin, emit, prefix);

      const final = results +
        `## Summary\n\n✅ **Saved to pipeline:** ${savedCompanies.length}/${chosenCompanies.length}\n\n` +
        (failCount > 0 ? `❌ **Failed validation:** ${failCount}\n\n` : '') +
        `**Refresh the page** to see all companies in the sidebar.`;

      await groveMemory.recordAction('RESEARCH', `Researched ${chosenCompanies.join(', ')} — ${savedCompanies.length} saved`).catch(() => {});
      emit({ type: 'result', message: final, savedCompanies: savedCompanies.length });
      return;
    }

    // ── UPDATE CONTACTS ────────────────────────────────────────────────────────
    if (intent.intent === 'UPDATE_CONTACTS') {
      const targetNames: string[] = Array.isArray(intent.targets) ? (intent.targets as string[]) : [];
      const targets = targetNames.length > 0
        ? existingCompanies.filter(c => targetNames.some(t => c.company_name.toLowerCase().includes(t.toLowerCase())))
        : existingCompanies;

      if (targets.length === 0) {
        emit({ type: 'result', message: "No companies in your pipeline yet. Ask me to research some first!" });
        return;
      }

      emit({
        type: 'step',
        text: `Running deep LinkedIn contact search for ${targets.length} ${targets.length === 1 ? 'company' : 'companies'}…`,
        icon: '🔍',
        sub: targets.map(c => c.company_name).join(', '),
      });

      let found = 0;
      let notFound = 0;
      let resultsText = `# 🔍 Contact Search Results\n\n`;

      // Process in parallel batches of 3 to stay within rate limits but finish faster
      const BATCH_SIZE = 3;
      for (let batchStart = 0; batchStart < targets.length; batchStart += BATCH_SIZE) {
        const batch = targets.slice(batchStart, batchStart + BATCH_SIZE);

        emit({ type: 'progress', current: batchStart, total: targets.length, company: batch.map(c => c.company_name).join(', ') });
        emit({ type: 'step', text: `Searching ${batch.map(c => c.company_name).join(', ')}…`, icon: '🔬', sub: `${batchStart + 1}–${Math.min(batchStart + BATCH_SIZE, targets.length)} of ${targets.length}` });

        const batchResults = await Promise.allSettled(
          batch.map(company => findContactForCompany(company.company_name, company.id, request.nextUrl.origin, company.website))
        );

        for (let j = 0; j < batch.length; j++) {
          const company = batch[j];
          const result = batchResults[j];

          if (result.status === 'fulfilled' && result.value.contact_name) {
            const contact = result.value;
            found++;
            emit({ type: 'step', text: `Found: ${contact.contact_name} at ${company.company_name}`, icon: '✅', sub: `${contact.contact_position || ''} — ${contact.confidence} confidence` });
            resultsText += `## ${company.company_name}\n`;
            resultsText += `✅ **${contact.contact_name}** — ${contact.contact_position || 'Role found'}\n`;
            if (contact.contact_linkedin) resultsText += `🔗 [LinkedIn](${contact.contact_linkedin})\n`;
            if (contact.contact_info && contact.contact_info !== 'Not found') resultsText += `📧 ${contact.contact_info}\n`;
            resultsText += `_Confidence: ${contact.confidence} | Source: ${contact.source}_\n\n`;
          } else {
            notFound++;
            const msg = result.status === 'rejected'
              ? (result.reason instanceof Error ? result.reason.message.slice(0, 80) : String(result.reason))
              : 'All candidates failed validation';
            emit({ type: 'step', text: `No verified contact found for ${company.company_name}`, icon: '⚠️', sub: msg });
            resultsText += `## ${company.company_name}\n⚠️ No verified current contact found — existing data preserved\n\n`;
          }
        }

        // Short pause between batches to respect rate limits
        if (batchStart + BATCH_SIZE < targets.length) {
          await new Promise(r => setTimeout(r, 2000));
        }
      }

      resultsText += `---\n\n## Summary\n\n✅ **Contacts found & saved:** ${found}/${targets.length}\n`;
      if (notFound > 0) {
        resultsText += `⚠️ **Not found:** ${notFound} — I searched LinkedIn, web directories, Apollo, RocketReach, and company pages.\n\n`;
        resultsText += `If you need contacts manually, try:\n- [LinkedIn Sales Navigator](https://linkedin.com/sales)\n- [Apollo.io](https://apollo.io)\n- [Hunter.io](https://hunter.io)\n- [RocketReach](https://rocketreach.co)`;
      }
      resultsText += `\n\nRefresh the page to see updated contacts in the sidebar.`;

      emit({ type: 'result', message: resultsText, savedCompanies: found });
      return;
    }
    if (intent.intent === 'EDIT_COMPANY_FIELDS') {
      if (existingCompanies.length === 0) {
        emit({ type: 'result', message: "No companies in your pipeline yet." });
        return;
      }

      const editPrompt = `You are editing company data in a sponsor research database.

Company list:
${existingCompanies.map(c => `"${c.company_name}" (id: ${c.id})`).join('\n')}

User request: "${userMessage}"

Parse this into one or more database updates. Return ONLY a JSON array:
[{ "company_id": "exact id", "company_name": "name", "fields": { "field": "value" } }]

Valid fields: contact_name, contact_position, contact_linkedin, contact_info, sponsorship_likelihood_score (1-10), outreach_status ("not_started"|"contacted"|"responded"|"meeting_scheduled"|"declined"|"confirmed"), notes, industry, company_size, website, previously_sponsored (boolean)

If nothing to parse, return [].`;

      let edits: { company_id: string; company_name: string; fields: Record<string, unknown> }[] = [];
      try {
        const aiRaw = await classifyIntent([{ role: 'user', content: editPrompt }]);
        const jsonMatch = aiRaw.replace(/```json\n?/g, '').replace(/```\n?/g, '').match(/\[[\s\S]*\]/);
        if (jsonMatch) edits = JSON.parse(jsonMatch[0]);
      } catch { /* empty */ }

      if (edits.length === 0) {
        emit({ type: 'result', message: `I understood you want to edit data, but couldn't parse the specifics. Try:\n- "Set Microsoft's score to 9"\n- "Mark IBM as contacted"\n- "Update Google's contact to Jane Smith, VP Marketing"` });
        return;
      }

      let updatedCount = 0;
      let resultsText = `# ✏️ Company Data Updated\n\n`;

      for (const edit of edits) {
        emit({ type: 'step', text: `Updating ${edit.company_name}…`, icon: '✏️', sub: Object.keys(edit.fields).join(', ') });
        try {
          const patchRes = await fetch(`${request.nextUrl.origin}/api/companies/${edit.company_id}`, {
            method: 'PATCH',
            headers: INTERNAL_HEADERS,
            body: JSON.stringify(edit.fields),
          });
          if (patchRes.ok) {
            updatedCount++;
            resultsText += `## ${edit.company_name}\n`;
            for (const [key, val] of Object.entries(edit.fields)) {
              resultsText += `✅ **${key}** → ${val}\n`;
            }
            resultsText += '\n';
          } else {
            resultsText += `## ${edit.company_name}\n❌ Update failed\n\n`;
          }
        } catch {
          resultsText += `## ${edit.company_name}\n❌ Update failed\n\n`;
        }
      }

      resultsText += `---\n\n✅ **${updatedCount} ${updatedCount === 1 ? 'company' : 'companies'} updated.**`;
      emit({ type: 'result', message: resultsText, savedCompanies: updatedCount });
      return;
    }

    // ── RE-RESEARCH EXISTING ───────────────────────────────────────────────────
    if (intent.intent === 'RE_RESEARCH_COMPANIES') {
      const targetNames: string[] = Array.isArray(intent.targets) ? (intent.targets as string[]) : [];
      const targets = targetNames.length > 0
        ? existingCompanies.filter(c => targetNames.some(t => c.company_name.toLowerCase().includes(t.toLowerCase())))
        : existingCompanies;

      if (targets.length === 0) {
        emit({ type: 'result', message: "No companies found to re-research." });
        return;
      }

      const names = targets.map(c => c.company_name);
      emit({ type: 'step', text: `Re-researching ${names.length} companies`, icon: '🔄', sub: names.join(', ') });

      const prefix = `# 🔄 Re-Researching ${names.length} Companies\n\nUpdating: **${names.join(', ')}**\n\n---\n\n`;
      const { results, savedCompanies, failCount } = await runResearch(names, request.nextUrl.origin, emit, prefix);

      const final = results +
        `## Summary\n\n✅ **Updated:** ${savedCompanies.length}/${names.length}\n\n` +
        (failCount > 0 ? `❌ **Failed:** ${failCount}\n\n` : '') +
        `All data refreshed and synced to Google Sheets.`;

      emit({ type: 'result', message: final, savedCompanies: savedCompanies.length });
      return;
    }

    // ── DELETE COMPANIES ───────────────────────────────────────────────────────
    if (intent.intent === 'DELETE_COMPANIES') {
      const targetNames: string[] = Array.isArray(intent.targets) ? (intent.targets as string[]) : [];
      const scoreBelow: number | null = typeof intent.score_below === 'number' ? intent.score_below : null;
      const deleteAll: boolean = intent.delete_all === true && scoreBelow === null && targetNames.length === 0;

      // ── Preview / safety check ──
      // Score-filtered delete — show what will be deleted first
      if (scoreBelow !== null) {
        const toDelete = existingCompanies.filter(
          c => typeof c.sponsorship_likelihood_score === 'number' && c.sponsorship_likelihood_score < scoreBelow
        );
        emit({ type: 'step', text: `Found ${toDelete.length} ${toDelete.length === 1 ? 'company' : 'companies'} with score below ${scoreBelow}/10…`, icon: '🗑️',
          sub: toDelete.map(c => `${c.company_name} (${c.sponsorship_likelihood_score}/10)`).join(', ') || 'none' });

        if (toDelete.length === 0) {
          emit({ type: 'result', message: `✅ No companies have a score below ${scoreBelow}/10. Nothing deleted.` });
          return;
        }

        // Save snapshot before destructive action
        emit({ type: 'step', text: 'Saving snapshot for undo…', icon: '📸' });
        await prisma.snapshot.create({
          data: {
            label: `Before deleting ${toDelete.length} companies (score < ${scoreBelow})`,
            trigger: 'DELETE_SCORE_FILTER',
            data: existingCompanies as unknown as never,
          },
        });

        let deleted = 0;
        for (const company of toDelete) {
          const res = await fetch(`${request.nextUrl.origin}/api/companies/${company.id}`, { method: 'DELETE', headers: INTERNAL_HEADERS });
          if (res.ok) deleted++;
        }
        const names = toDelete.map(c => c.company_name).join(', ');
        await groveMemory.recordAction('DELETE', `Deleted ${deleted} companies with score below ${scoreBelow}/10: ${names}`).catch(() => {});
        emit({ type: 'result', message: `✅ Deleted ${deleted} ${deleted === 1 ? 'company' : 'companies'} with score below ${scoreBelow}/10: **${names}**\n\n_Say **"undo"** to restore these companies._` });
        return;
      }

      if (deleteAll) {
        if (existingCompanies.length === 0) {
          emit({ type: 'result', message: '✅ Pipeline is already empty.' });
          return;
        }
        emit({ type: 'step', text: `⚠️ Preparing to delete all ${existingCompanies.length} companies…`, icon: '⚠️' });

        // Save snapshot before destructive action
        emit({ type: 'step', text: 'Saving snapshot for undo…', icon: '�' });
        await prisma.snapshot.create({
          data: {
            label: `Before deleting ALL ${existingCompanies.length} companies`,
            trigger: 'DELETE_ALL',
            data: existingCompanies as unknown as never,
          },
        });

        const clearResponse = await fetch(`${request.nextUrl.origin}/api/companies/clear`, { method: 'DELETE', headers: INTERNAL_HEADERS });
        if (!clearResponse.ok) {
          emit({ type: 'result', message: '❌ Failed to delete companies.' });
          return;
        }
        emit({ type: 'result', message: `✅ All ${existingCompanies.length} companies deleted.\n\n_Say **"undo"** to restore them._` });
        return;
      }

      // Named targets
      if (targetNames.length === 0) {
        emit({ type: 'result', message: '⚠️ I wasn\'t sure which companies to delete. Try: "delete Microsoft" or "delete companies with score below 4".' });
        return;
      }

      const toDeleteNamed = existingCompanies.filter(c =>
        targetNames.some(t => c.company_name.toLowerCase().includes(t.toLowerCase()))
      );

      if (toDeleteNamed.length === 0) {
        emit({ type: 'result', message: `⚠️ Couldn\'t find any of those companies in the pipeline: ${targetNames.join(', ')}` });
        return;
      }

      emit({ type: 'step', text: `Deleting ${toDeleteNamed.map(c => c.company_name).join(', ')}…`, icon: '🗑️' });

      // Save snapshot before destructive action
      emit({ type: 'step', text: 'Saving snapshot for undo…', icon: '📸' });
      await prisma.snapshot.create({
        data: {
          label: `Before deleting ${toDeleteNamed.map(c => c.company_name).join(', ')}`,
          trigger: 'DELETE_NAMED',
          data: existingCompanies as unknown as never,
        },
      });

      let deleted = 0;
      for (const company of toDeleteNamed) {
        const res = await fetch(`${request.nextUrl.origin}/api/companies/${company.id}`, { method: 'DELETE', headers: INTERNAL_HEADERS });
        if (res.ok) deleted++;
      }
      await groveMemory.recordAction('DELETE', `Deleted ${deleted} companies: ${toDeleteNamed.map(c => c.company_name).join(', ')}`).catch(() => {});
      emit({ type: 'result', message: `✅ Deleted ${deleted} ${deleted === 1 ? 'company' : 'companies'}: **${toDeleteNamed.map(c => c.company_name).join(', ')}**\n\n_Say **"undo"** to restore them._` });
      return;
    }

    // ── UNDO LAST ACTION ───────────────────────────────────────────────────────
    if (intent.intent === 'UNDO_LAST_ACTION') {
      emit({ type: 'step', text: 'Looking for the most recent snapshot…', icon: '⏪' });

      const snap = await prisma.snapshot.findFirst({ orderBy: { created_at: 'desc' } });

      if (!snap) {
        emit({ type: 'result', message: '⚠️ No snapshots found. Nothing to undo.' });
        return;
      }

      const snapData = snap.data as Array<Record<string, unknown>>;
      emit({ type: 'step', text: `Found snapshot: "${snap.label}" — restoring ${snapData.length} companies…`, icon: '🔄' });

      // Clear current DB
      const clearRes = await fetch(`${request.nextUrl.origin}/api/companies/clear`, { method: 'DELETE', headers: INTERNAL_HEADERS });
      if (!clearRes.ok) {
        emit({ type: 'result', message: '❌ Failed to clear current companies before restoring.' });
        return;
      }

      // Re-insert all companies from snapshot
      let restored = 0;
      for (const company of snapData) {
        try {
          const saveRes = await fetch(`${request.nextUrl.origin}/api/companies`, {
            method: 'POST',
            headers: INTERNAL_HEADERS,
            body: JSON.stringify({ companyName: company.company_name, autoResearch: false, companyData: company }),
          });
          if (saveRes.ok) restored++;
        } catch { /* skip */ }
      }

      // Delete the snapshot we just used (so a second undo doesn't repeat)
      await prisma.snapshot.delete({ where: { id: snap.id } });

      // Sync sheet
      emit({ type: 'step', text: 'Syncing Google Sheet…', icon: '📊' });
      await fetch(`${request.nextUrl.origin}/api/companies/sync`, { method: 'POST', headers: INTERNAL_HEADERS });

      emit({ type: 'result', message: `✅ **Restored ${restored} companies** from snapshot: _"${snap.label}"_\n\nThe database and Google Sheet have been restored. Refresh the page to see your companies.` });
      return;
    }

    // ── COMPARE SHEET ──────────────────────────────────────────────────────────
    if (intent.intent === 'COMPARE_SHEET') {
      emit({ type: 'step', text: 'Reading company names from Google Sheet…', icon: '📊' });

      const sheetNames = await getSheetCompanyNames();

      if (sheetNames === null) {
        emit({ type: 'result', message: '❌ Could not read the Google Sheet. Please check your credentials are configured correctly.' });
        return;
      }

      const dbNames = existingCompanies.map(c => c.company_name);
      const sheetSet = new Set(sheetNames.map(n => n.toLowerCase()));
      const dbSet = new Set(dbNames.map(n => n.toLowerCase()));

      const inSheetOnly = sheetNames.filter(n => !dbSet.has(n.toLowerCase()));
      const inDbOnly = dbNames.filter(n => !sheetSet.has(n.toLowerCase()));

      let msg = `# 📊 Sheet vs App Comparison\n\n`;
      msg += `**App (database):** ${dbNames.length} companies\n`;
      msg += `**Google Sheet:** ${sheetNames.length} companies\n\n`;

      if (inSheetOnly.length === 0 && inDbOnly.length === 0) {
        msg += `✅ **Everything matches!** Both the app and the sheet have the same ${dbNames.length} companies.\n`;
      } else {
        if (inSheetOnly.length > 0) {
          msg += `## 🔴 In Sheet but NOT in App (${inSheetOnly.length})\n`;
          inSheetOnly.forEach(n => { msg += `- ${n}\n`; });
          msg += `\n_These rows exist in Google Sheets but have no record in the database. You can sync the app → sheet to remove them, or add them to the app first._\n\n`;
        }
        if (inDbOnly.length > 0) {
          msg += `## 🟡 In App but NOT in Sheet (${inDbOnly.length})\n`;
          inDbOnly.forEach(n => { msg += `- ${n}\n`; });
          msg += `\n_These companies are in the database but missing from the sheet. Say **"sync the sheet"** to push them._\n\n`;
        }
      }

      emit({ type: 'result', message: msg });
      return;
    }

    // ── SYNC SHEET ─────────────────────────────────────────────────────────────
    if (intent.intent === 'SYNC_SHEET') {
      emit({ type: 'step', text: `Syncing ${existingCompanies.length} companies from the database to Google Sheets…`, icon: '🔄' });

      const syncRes = await fetch(`${request.nextUrl.origin}/api/companies/sync`, { method: 'POST', headers: INTERNAL_HEADERS });
      const syncData = await syncRes.json();

      if (syncData.ok) {
        emit({
          type: 'result',
          message: `✅ **Google Sheet is now up to date.**\n\nSynced **${syncData.synced} companies** from the database — the sheet now exactly matches what's in the app.\n\n[View your spreadsheet](https://docs.google.com/spreadsheets/d/${process.env.GOOGLE_SHEETS_SPREADSHEET_ID})`,
        });
      } else {
        emit({
          type: 'result',
          message: `❌ Sync failed. Please check that Google Sheets credentials are configured correctly.\n\n${syncData.error || ''}`,
        });
      }
      return;
    }

    // ── FORMAT SHEET ───────────────────────────────────────────────────────────
    if (intent.intent === 'FORMAT_SHEET') {
      const result = await handleNaturalLanguageFormat(userMessage);
      emit({
        type: 'result',
        message: result.success
          ? `✅ ${result.message}\n\n[View your updated spreadsheet](https://docs.google.com/spreadsheets/d/${process.env.GOOGLE_SHEETS_SPREADSHEET_ID})`
          : `⚠️ ${result.message}`,
      });
      return;
    }

    // ── CHAT FALLBACK ──────────────────────────────────────────────────────────
    // Inject the live company list + Grove memory into the system prompt
    const enrichedSystem: ChatMessage = {
      role: 'system',
      content: SYSTEM_PROMPT
        + (memorySummary ? `\n\n${memorySummary}` : '')
        + `\n\n## Current Pipeline Companies (${existingCompanies.length} total)\n${companySummary}\n\nWhen answering questions about "our companies", "the pipeline", "what do we have", etc., use this list as the source of truth. Do NOT make up company names or invent a generic list — only reference the companies above.`,
    };
    const enrichedMessages: ChatMessage[] = [enrichedSystem, ...messages];
    const chatResponse = await chatWithOpenAI(enrichedMessages, undefined, aiMode);
    emit({ type: 'result', message: chatResponse });
    });

  } catch (error) {
    console.error('Chat API error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to process request' },
      { status: 500 }
    );
  }
}
