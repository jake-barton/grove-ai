// API Route: Chat with AI assistant — streaming research updates
import { NextRequest, NextResponse } from 'next/server';
import { chatWithOpenAI, classifyIntent, SYSTEM_PROMPT, ChatMessage } from '@/lib/openai';
import { researchCompany, batchResearchCompanies, findContactForCompany } from '@/lib/ai-agent';
import { handleNaturalLanguageFormat } from '@/lib/sheets-formatter';
import { getAIModeFromRequest } from '@/lib/ai-mode';

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
          headers: { 'Content-Type': 'application/json' },
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
      const allMessages: ChatMessage[] = [systemMessage, ...messages];
      const userMessage = messages[messages.length - 1]?.content || '';

      // ── AI INTENT CLASSIFIER ──────────────────────────────────────────────────
    // Single AI call decides what to do — no keyword matching, no brittle if/else chains.
    // The classifier gets the full company list as context so it can reason about
    // "our companies" vs "new companies", named companies, counts, etc.

    emit({ type: 'step', text: 'Understanding your request…', icon: '🧠' });

    const existingRes = await fetch(`${request.nextUrl.origin}/api/companies`);
    const existingData = await existingRes.json();
    const existingCompanies: { id: string; company_name: string; contact_name?: string; outreach_status?: string }[] =
      existingData.data || [];

    const companySummary = existingCompanies.length > 0
      ? existingCompanies.map(c => `- "${c.company_name}" (id: ${c.id}, contact: ${c.contact_name || 'none'}, status: ${c.outreach_status || 'not_started'})`).join('\n')
      : '(no companies in pipeline yet)';

    const classifierPrompt = `You are the intent router for Grove, an AI sponsor research assistant for Sloss.Tech (a tech conference in Birmingham, Alabama).

Current pipeline companies:
${companySummary}

User message: "${userMessage}"

Classify this into EXACTLY ONE of these intents and return ONLY a JSON object:

1. RESEARCH_NEW — user wants to find/research NEW companies (not ones already in the pipeline)
   → { "intent": "RESEARCH_NEW", "count": <number, default 5>, "query": "<their criteria>" }

2. UPDATE_CONTACTS — user wants to find/update LinkedIn contacts for existing pipeline companies
   → { "intent": "UPDATE_CONTACTS", "targets": ["company name", ...] }
   Use [] for targets to mean ALL existing companies. Only include names that are in the pipeline.

3. EDIT_FIELDS — user wants to change specific data fields on one or more existing companies
   → { "intent": "EDIT_FIELDS" }

4. RE_RESEARCH — user wants to fully re-research existing companies already in the pipeline
   → { "intent": "RE_RESEARCH", "targets": ["company name", ...] }
   Use [] to mean all existing companies.

5. DELETE — user wants to delete companies from the pipeline
   → { "intent": "DELETE", "targets": ["company name", ...] }
   Use [] to mean ALL companies. Only use if explicitly destructive language is used.

6. FORMAT_SHEET — user wants to format/style the Google Sheet
   → { "intent": "FORMAT_SHEET" }

7. CHAT — general question, greeting, or anything else not covered above
   → { "intent": "CHAT" }

Rules:
- "find 3 new companies" → RESEARCH_NEW (count: 3)
- "find contacts for our companies" → UPDATE_CONTACTS (targets: [])
- "update the IBM contact" → UPDATE_CONTACTS (targets: ["IBM"])
- "find 3 new companies WITH good contacts" → RESEARCH_NEW (count: 3) — the "contacts" is a quality filter, not an update request
- "set Microsoft score to 9" → EDIT_FIELDS
- "delete everything" → DELETE (targets: [])
- "what companies do we have?" → CHAT
- When ambiguous, prefer the more specific action over CHAT

Return ONLY valid JSON, nothing else.`;

    let intent: {
      intent: string;
      count?: number;
      query?: string;
      targets?: string[];
    } = { intent: 'CHAT' };

    try {
      const raw = await classifyIntent([{ role: 'user', content: classifierPrompt }]);
      const match = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').match(/\{[\s\S]*\}/);
      if (match) intent = JSON.parse(match[0]);
    } catch {
      intent = { intent: 'CHAT' };
    }

    console.log(`🧠 Intent classified: ${intent.intent}`, intent);

    // ── RESEARCH NEW COMPANIES ─────────────────────────────────────────────────
    if (intent.intent === 'RESEARCH_NEW') {
      const count = Math.min(Math.max(intent.count || 5, 1), 20);

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

      emit({ type: 'result', message: final, savedCompanies: savedCompanies.length });
      return;
    }

    // ── UPDATE CONTACTS ────────────────────────────────────────────────────────
    if (intent.intent === 'UPDATE_CONTACTS') {
      const targetNames: string[] = intent.targets || [];
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

      for (let i = 0; i < targets.length; i++) {
        const company = targets[i];
        emit({ type: 'progress', current: i, total: targets.length, company: company.company_name });
        emit({ type: 'step', text: `Searching LinkedIn + web for ${company.company_name}…`, icon: '🔬', sub: `${i + 1} of ${targets.length}` });

        try {
          const contact = await findContactForCompany(company.company_name, company.id, request.nextUrl.origin);

          if (contact.contact_name) {
            found++;
            emit({ type: 'step', text: `Found: ${contact.contact_name} at ${company.company_name}`, icon: '✅', sub: `${contact.contact_position || ''} — ${contact.confidence} confidence` });
            resultsText += `## ${company.company_name}\n`;
            resultsText += `✅ **${contact.contact_name}** — ${contact.contact_position || 'Role found'}\n`;
            if (contact.contact_linkedin) resultsText += `🔗 [LinkedIn](${contact.contact_linkedin})\n`;
            if (contact.contact_info && contact.contact_info !== 'Not found') resultsText += `📧 ${contact.contact_info}\n`;
            resultsText += `_Confidence: ${contact.confidence} | Source: ${contact.source}_\n\n`;
          } else {
            notFound++;
            emit({ type: 'step', text: `No verified contact found for ${company.company_name}`, icon: '⚠️', sub: 'All candidates failed validation' });
            resultsText += `## ${company.company_name}\n⚠️ No verified current contact found — existing data preserved\n\n`;
          }
        } catch (err) {
          notFound++;
          const msg = err instanceof Error ? err.message.slice(0, 80) : String(err);
          emit({ type: 'step', text: `Error searching ${company.company_name}`, icon: '❌', sub: msg });
          resultsText += `## ${company.company_name}\n❌ Search failed\n\n`;
        }

        if (i < targets.length - 1) {
          emit({ type: 'step', text: `Pausing between searches to respect rate limits…`, icon: '⏳' });
          await new Promise(r => setTimeout(r, 4000));
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

    // ── EDIT FIELDS ────────────────────────────────────────────────────────────
    if (intent.intent === 'EDIT_FIELDS') {
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
            headers: { 'Content-Type': 'application/json' },
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
    if (intent.intent === 'RE_RESEARCH') {
      const targetNames: string[] = intent.targets || [];
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

    // ── DELETE ─────────────────────────────────────────────────────────────────
    if (intent.intent === 'DELETE') {
      const targetNames: string[] = intent.targets || [];
      const deleteAll = targetNames.length === 0;

      emit({ type: 'step', text: deleteAll ? 'Clearing all companies from database…' : `Deleting ${targetNames.join(', ')}…`, icon: '🗑️' });

      if (deleteAll) {
        const clearResponse = await fetch(`${request.nextUrl.origin}/api/companies/clear`, { method: 'DELETE' });
        if (!clearResponse.ok) {
          emit({ type: 'result', message: '❌ Failed to delete companies.' });
          return;
        }
        emit({ type: 'result', message: '✅ All companies deleted from the database and spreadsheet.' });
      } else {
        let deleted = 0;
        for (const name of targetNames) {
          const company = existingCompanies.find(c => c.company_name.toLowerCase().includes(name.toLowerCase()));
          if (company) {
            const res = await fetch(`${request.nextUrl.origin}/api/companies/${company.id}`, { method: 'DELETE' });
            if (res.ok) deleted++;
          }
        }
        emit({ type: 'result', message: `✅ Deleted ${deleted} ${deleted === 1 ? 'company' : 'companies'}.` });
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
    const chatResponse = await chatWithOpenAI(allMessages, undefined, aiMode);
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
