// API Route: Chat with AI assistant — streaming research updates
import { NextRequest, NextResponse } from 'next/server';
import { chatWithOpenAI, SYSTEM_PROMPT, ChatMessage } from '@/lib/openai';
import { researchCompany, batchResearchCompanies, findContactForCompany } from '@/lib/ai-agent';
import { handleNaturalLanguageFormat } from '@/lib/sheets-formatter';

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

    // Default: chat conversation
    const systemMessage: ChatMessage = {
      role: 'system',
      content: SYSTEM_PROMPT,
    };

    const allMessages: ChatMessage[] = [systemMessage, ...messages];

    // Declare lowerContent once here — used by all intent checks below
    const lowerContent = messages[messages.length - 1]?.content?.toLowerCase() || '';

    // ── UPDATE CONTACTS for existing companies ─────────────────────────────────
    // Triggered by: "update contacts", "find linkedin contacts", "fix contacts",
    //   "enrich contacts", "find contacts for all companies", "update [company] contact", etc.
    const isUpdateContacts =
      (lowerContent.includes('update') || lowerContent.includes('find') ||
       lowerContent.includes('enrich') || lowerContent.includes('fix') ||
       lowerContent.includes('get') || lowerContent.includes('search') ||
       lowerContent.includes('look up') || lowerContent.includes('improve')) &&
      (lowerContent.includes('contact') || lowerContent.includes('linkedin') ||
       lowerContent.includes('decision maker') || lowerContent.includes('decision-maker') ||
       lowerContent.includes('reach out') || lowerContent.includes('email'));

    if (isUpdateContacts) {
      return makeStream(async (emit) => {
        emit({ type: 'step', text: 'Loading companies from database…', icon: '📋' });

        const existingRes = await fetch(`${request.nextUrl.origin}/api/companies`);
        const existingData = await existingRes.json();
        const companies: { id: string; company_name: string; contact_name?: string }[] =
          existingData.data || [];

        if (companies.length === 0) {
          emit({ type: 'result', message: "No companies in your pipeline yet. Ask me to research some first!" });
          return;
        }

        // Check if user named a specific company
        const specificCompany = companies.find(c =>
          lowerContent.includes(c.company_name.toLowerCase())
        );
        const targets = specificCompany ? [specificCompany] : companies;

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
          emit({
            type: 'progress',
            current: i,
            total: targets.length,
            company: company.company_name,
          });
          emit({
            type: 'step',
            text: `Searching LinkedIn + web for ${company.company_name}…`,
            icon: '🔬',
            sub: `${i + 1} of ${targets.length}`,
          });

          try {
            const contact = await findContactForCompany(
              company.company_name,
              company.id,
              request.nextUrl.origin
            );

            if (contact.contact_name) {
              found++;
              emit({
                type: 'step',
                text: `Found: ${contact.contact_name} at ${company.company_name}`,
                icon: '✅',
                sub: `${contact.contact_position || ''} — ${contact.confidence} confidence via ${contact.source}`,
              });
              resultsText += `## ${company.company_name}\n`;
              resultsText += `✅ **${contact.contact_name}** — ${contact.contact_position || 'Role found'}\n`;
              if (contact.contact_linkedin) resultsText += `🔗 [LinkedIn](${contact.contact_linkedin})\n`;
              if (contact.contact_info && contact.contact_info !== 'Not found') resultsText += `📧 ${contact.contact_info}\n`;
              resultsText += `_Confidence: ${contact.confidence} | Source: ${contact.source}_\n\n`;
            } else {
              notFound++;
              emit({
                type: 'step',
                text: `No verified contact found for ${company.company_name}`,
                icon: '⚠️',
                sub: 'All candidates failed validation',
              });
              resultsText += `## ${company.company_name}\n`;
              resultsText += `⚠️ No verified current contact found — existing data preserved\n\n`;
            }
          } catch (err) {
            notFound++;
            const msg = err instanceof Error ? err.message.slice(0, 80) : String(err);
            emit({ type: 'step', text: `Error searching ${company.company_name}`, icon: '❌', sub: msg });
            resultsText += `## ${company.company_name}\n❌ Search failed\n\n`;
          }

          if (i < targets.length - 1) {
            await new Promise(r => setTimeout(r, 2500));
          }
        }

        resultsText += `---\n\n## Summary\n\n`;
        resultsText += `✅ **Contacts found & saved:** ${found}/${targets.length}\n`;
        if (notFound > 0) resultsText += `⚠️ **Not found (existing data kept):** ${notFound}\n`;
        resultsText += `\nRefresh the page to see updated contacts in the sidebar.`;

        emit({ type: 'result', message: resultsText, savedCompanies: found });
      });
    }

    // ── EDIT COMPANY DATA — natural language field updates ─────────────────────
    // e.g. "set Microsoft's score to 9", "update IBM contact to John Smith",
    //   "mark Salesforce as contacted", "change Google's notes to..."
    const isAboutExistingCheck =
      lowerContent.includes('them again') ||
      lowerContent.includes('update them') ||
      lowerContent.includes('re-research') ||
      lowerContent.includes('reresearch') ||
      lowerContent.includes('refresh them') ||
      lowerContent.includes('the ones we have') ||
      lowerContent.includes('existing companies') ||
      lowerContent.includes('current companies') ||
      lowerContent.includes('already have') ||
      lowerContent.includes('we have') ||
      (lowerContent.includes('update') && lowerContent.includes('compan')) ||
      (lowerContent.includes('again') && lowerContent.includes('research'));

    const isEditRequest =
      (lowerContent.includes('set ') || lowerContent.includes('update ') ||
       lowerContent.includes('change ') || lowerContent.includes('mark ') ||
       lowerContent.includes('edit ') || lowerContent.includes('make ')) &&
      !lowerContent.includes('update contact') &&   // handled above
      !lowerContent.includes('find contact') &&
      !isAboutExistingCheck;

    if (isEditRequest) {
      return makeStream(async (emit) => {
        emit({ type: 'step', text: 'Loading company list…', icon: '📋' });

        const existingRes = await fetch(`${request.nextUrl.origin}/api/companies`);
        const existingData = await existingRes.json();
        const companies: { id: string; company_name: string }[] = existingData.data || [];

        if (companies.length === 0) {
          emit({ type: 'result', message: "No companies in your pipeline yet." });
          return;
        }

        // Ask AI to parse the edit intent into structured field updates
        const editPrompt = `The user wants to edit company data in a sponsor research database.

Company list: ${companies.map(c => `"${c.company_name}" (id: ${c.id})`).join(', ')}

User request: "${messages[messages.length - 1]?.content}"

Parse this into one or more database updates. Return ONLY a JSON array:
[
  {
    "company_id": "the exact id from the list above",
    "company_name": "human readable name",
    "fields": {
      "field_name": "new_value"
    }
  }
]

Valid field names:
- contact_name (string)
- contact_position (string)  
- contact_linkedin (LinkedIn URL string)
- contact_info (email string)
- sponsorship_likelihood_score (number 1-10)
- outreach_status ("not_started" | "contacted" | "responded" | "meeting_scheduled" | "declined" | "confirmed")
- notes (string)
- industry (string)
- company_size (string)
- website (URL string)
- previously_sponsored (boolean)

If you can't parse a valid edit, return [].`;

        let edits: { company_id: string; company_name: string; fields: Record<string, unknown> }[] = [];
        try {
          const aiRaw = await chatWithOpenAI([{ role: 'user', content: editPrompt }]);
          const jsonMatch = aiRaw.replace(/```json\n?/g, '').replace(/```\n?/g, '').match(/\[[\s\S]*\]/);
          if (jsonMatch) edits = JSON.parse(jsonMatch[0]);
        } catch { /* fallback empty */ }

        if (edits.length === 0) {
          emit({
            type: 'result',
            message: `I wasn't sure what to edit. Try being more specific, like:\n- "Set Microsoft's score to 9"\n- "Mark IBM as contacted"\n- "Update Google's contact to Jane Smith, VP Marketing"\n- "Change Salesforce notes to: great lead, follow up in Q2"`,
          });
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
              emit({ type: 'step', text: `Updated ${edit.company_name}`, icon: '✅', sub: `${Object.keys(edit.fields).join(', ')} saved` });
            } else {
              resultsText += `## ${edit.company_name}\n❌ Update failed\n\n`;
            }
          } catch {
            resultsText += `## ${edit.company_name}\n❌ Update failed\n\n`;
          }
        }

        resultsText += `---\n\n✅ **${updatedCount} ${updatedCount === 1 ? 'company' : 'companies'} updated** and synced to Google Sheets.`;
        emit({ type: 'result', message: resultsText, savedCompanies: updatedCount });
      });
    }

    // Check if this is a delete/clear request
    // Must be an EXPLICIT destructive intent: "delete all companies", "clear everything", "remove all from spreadsheet"
    // Avoid false positives on: "clear the formatting", "update the data", "change the sheet colors"
    const hasDestructiveVerb =
      lowerContent.includes('delete all') ||
      lowerContent.includes('remove all') ||
      lowerContent.includes('clear all') ||
      lowerContent.includes('wipe') ||
      lowerContent.includes('erase all') ||
      (lowerContent.includes('delete') && lowerContent.includes('companies')) ||
      (lowerContent.includes('remove') && lowerContent.includes('companies')) ||
      (lowerContent.includes('clear') && lowerContent.includes('companies')) ||
      (lowerContent.includes('delete') && lowerContent.includes('everything')) ||
      (lowerContent.includes('clear') && lowerContent.includes('everything'));
    const isDeleteRequest = hasDestructiveVerb;
    
    if (isDeleteRequest) {
      console.log('🗑️ Detected delete/clear request:', lowerContent);

      return makeStream(async (emit) => {
        emit({ type: 'step', text: 'Clearing all companies from database…', icon: '🗑️' });

        try {
          const clearResponse = await fetch(`${request.nextUrl.origin}/api/companies/clear`, { method: 'DELETE' });
          if (!clearResponse.ok) {
            emit({ type: 'result', message: '❌ Failed to delete companies. Please try again.' });
            return;
          }

          emit({ type: 'step', text: 'Pipeline cleared', icon: '✅', sub: 'All companies removed' });

          const hasFollowUpResearch =
            lowerContent.includes('research') || lowerContent.includes('find') ||
            lowerContent.includes('again') || lowerContent.includes('new ones') ||
            lowerContent.includes('start over');

          if (!hasFollowUpResearch) {
            emit({ type: 'result', message: '✅ All companies have been deleted from the database and the spreadsheet.' });
            return;
          }

          const numberMatch = lowerContent.match(/\b(\d+)\b/);
          const count = numberMatch ? Math.min(Math.max(parseInt(numberMatch[1]), 1), 20) : 5;

          const selectionPrompt = `The user wants to research ${count} potential corporate sponsors for Sloss.Tech, a technology conference in Birmingham, Alabama.\n\nTheir request: "${messages[messages.length - 1]?.content}"\n\nPick exactly ${count} real, well-known tech companies. Return ONLY a JSON array. Example: ["Stripe", "Twilio"]`;

          let chosenCompanies: string[] = [];
          try {
            emit({ type: 'step', text: 'Asking AI to pick the best companies for your request…', icon: '🤖' });
            const aiRaw = await chatWithOpenAI([{ role: 'user', content: selectionPrompt }]);
            const jsonMatch = aiRaw.replace(/```json\n?/g, '').replace(/```\n?/g, '').match(/\[[\s\S]*?\]/);
            if (jsonMatch) chosenCompanies = JSON.parse(jsonMatch[0]).slice(0, count);
          } catch { /* fallback */ }
          if (!chosenCompanies.length) chosenCompanies = ['Stripe', 'Twilio', 'Datadog', 'MongoDB', 'Cloudflare'].slice(0, count);

          emit({ type: 'step', text: `Selected ${chosenCompanies.length} companies to research`, icon: '🎯', sub: chosenCompanies.join(', ') });

          const prefix = `✅ All companies deleted.\n\n# 🔬 Researching ${chosenCompanies.length} Fresh Companies\n\nSelected: **${chosenCompanies.join(', ')}**\n\n---\n\n`;
          const { results, savedCompanies, failCount } = await runResearch(chosenCompanies, request.nextUrl.origin, emit, prefix);

          const final = results + `## Summary\n\n✅ **Saved:** ${savedCompanies.length}/${chosenCompanies.length}\n\n` +
            (failCount > 0 ? `❌ **Failed:** ${failCount}\n\n` : '') +
            `Refresh the page to see all companies in the sidebar.`;

          emit({ type: 'result', message: final, savedCompanies: savedCompanies.length });
        } catch (error) {
          console.error('Delete error:', error);
          emit({ type: 'result', message: '❌ An error occurred while deleting companies.' });
        }
      });
    }
    
    // Check if this is a spreadsheet formatting request
    // Broad detection — the AI will decide if it's actionable or not
    const isFormatRequest =
      (lowerContent.includes('format') || lowerContent.includes('style') ||
       lowerContent.includes('color') || lowerContent.includes('colour') ||
       lowerContent.includes('make it') || lowerContent.includes('look better') ||
       lowerContent.includes('prettier') || lowerContent.includes('easier to read') ||
       lowerContent.includes('zebra') || lowerContent.includes('stripe') ||
       lowerContent.includes('alternate') || lowerContent.includes('highlight') ||
       lowerContent.includes('sort') || lowerContent.includes('freeze') ||
       lowerContent.includes('filter') || lowerContent.includes('resize') ||
       lowerContent.includes('bold') || lowerContent.includes('hide') ||
       lowerContent.includes('wrap') || lowerContent.includes('font') ||
       lowerContent.includes('professional') || lowerContent.includes('clean up') ||
       lowerContent.includes('header') || lowerContent.includes('column width')) &&
      (lowerContent.includes('spreadsheet') || lowerContent.includes('sheet') ||
       lowerContent.includes('row') || lowerContent.includes('column') ||
       lowerContent.includes('google') || lowerContent.includes('table') ||
       lowerContent.includes('data'));

    if (isFormatRequest) {
      console.log('🎨 Detected spreadsheet formatting request, passing to AI formatter:', lowerContent);
      const result = await handleNaturalLanguageFormat(lowerContent);
      if (result.success) {
        return NextResponse.json({
          success: true,
          message: `✅ ${result.message}\n\n[View your updated spreadsheet](https://docs.google.com/spreadsheets/d/${process.env.GOOGLE_SHEETS_SPREADSHEET_ID})`,
        });
      } else {
        return NextResponse.json({
          success: true,
          message: `⚠️ ${result.message}\n\nI can format your spreadsheet in many ways — try:\n- **"make it look professional"**\n- **"highlight top scoring companies"**\n- **"sort by sponsorship score descending"**\n- **"freeze the first 2 columns"**\n- **"add alternating row colors"**\n- **"make the header dark blue"**`,
        });
      }
    }
    
    // Check if this is a request to find/research sponsors
    // IMPORTANT: must NOT fire if the user is talking about existing companies ("them", "those", "the ones we have")
    const isAboutExisting =
      lowerContent.includes('them again') ||
      lowerContent.includes('update them') ||
      lowerContent.includes('re-research') ||
      lowerContent.includes('reresearch') ||
      lowerContent.includes('refresh them') ||
      lowerContent.includes('the ones we have') ||
      lowerContent.includes('existing companies') ||
      lowerContent.includes('current companies') ||
      lowerContent.includes('already have') ||
      lowerContent.includes('we have') ||
      (lowerContent.includes('update') && lowerContent.includes('compan')) ||
      (lowerContent.includes('again') && lowerContent.includes('research'));

    // Re-research existing companies in the database
    if (isAboutExisting) {
      return makeStream(async (emit) => {
        emit({ type: 'step', text: 'Loading existing companies from database…', icon: '📋' });

        const existingRes = await fetch(`${request.nextUrl.origin}/api/companies`);
        const existingData = await existingRes.json();
        const existingCompanies: string[] = (existingData.data || []).map(
          (c: { company_name: string }) => c.company_name
        );

        if (existingCompanies.length === 0) {
          emit({ type: 'result', message: "I don't see any companies in your pipeline yet. Ask me to **find sponsors** first and I'll research some great ones for Sloss.Tech!" });
          return;
        }

        emit({ type: 'step', text: `Found ${existingCompanies.length} companies to refresh`, icon: '🔄', sub: existingCompanies.join(', ') });

        const prefix = `# 🔄 Re-Researching ${existingCompanies.length} Existing Companies\n\nUpdating: **${existingCompanies.join(', ')}**\n\n---\n\n`;
        const { results, savedCompanies, failCount } = await runResearch(existingCompanies, request.nextUrl.origin, emit, prefix);

        const final = results +
          `## Summary\n\n✅ **Updated:** ${savedCompanies.length}/${existingCompanies.length}\n\n` +
          (failCount > 0 ? `❌ **Failed:** ${failCount}\n\n` : '') +
          `All data has been refreshed in the database and synced to Google Sheets.`;

        emit({ type: 'result', message: final, savedCompanies: savedCompanies.length });
      });
    }

    const isSponsorRequest =
      (lowerContent.includes('find') || lowerContent.includes('suggest') ||
       lowerContent.includes('look for') || lowerContent.includes('get me') ||
       lowerContent.includes('give me') ||
       (lowerContent.includes('research') && !lowerContent.includes('research them') && !lowerContent.includes('research the'))) &&
      (lowerContent.includes('sponsor') || lowerContent.includes('companies') || lowerContent.includes('company'));

    // Check if this is a contact lookup for a specific company
    // e.g. "find a contact at AWS", "who should I reach out to at Google", "research a LinkedIn contact for Stripe"
    // Route these through the real research pipeline — NEVER let the AI freeform-answer these
    const isContactLookup =
      !isAboutExisting &&
      !isSponsorRequest &&
      (lowerContent.includes('contact') || lowerContent.includes('linkedin') ||
       lowerContent.includes('reach out') || lowerContent.includes('who should') ||
       lowerContent.includes('who at') || lowerContent.includes('cmo') ||
       lowerContent.includes('vp of') || lowerContent.includes('head of') ||
       lowerContent.includes('decision maker') || lowerContent.includes('decision-maker') ||
       lowerContent.includes('sponsorship lead'));

    // Extract company name from a contact lookup query — handles multi-word names and punctuation
    // Tries multiple patterns in order of specificity
    const extractContactCompany = (text: string): string | null => {
      const patterns = [
        // "for Amazon Web Services", "for AWS", "at Google Cloud", "about Hewlett-Packard"
        /(?:^|\s)(?:for|at|from|about)\s+([A-Za-z0-9][A-Za-z0-9 &.,'-]{1,50?)(?:\s+(?:that|who|in|related|relevant|\?|$)|\s*$)/i,
        // "contact at X" where X is a known proper noun (capital letter)
        /contact\s+(?:at|for|from)\s+([A-Z][A-Za-z0-9 &.,'-]{1,50?)(?:\s+(?:that|who|in|\?|$)|\s*$)/,
        // "research X" / "look up X" — grabs everything after the verb
        /(?:research|look\s+up|find)\s+(?:a\s+contact\s+(?:for|at)\s+)?([A-Z][A-Za-z0-9 &.,'-]{1,50?)(?:\s+(?:that|who|in|related|\?|$)|\s*$)/,
      ];
      for (const pattern of patterns) {
        const m = text.match(pattern);
        if (m && m[1]) {
          const cleaned = m[1]
            .trim()
            .replace(/\b(a|the|an)\b\s*/gi, '')
            .replace(/[.,]+$/, '')
            .trim();
          if (cleaned.length > 1) return cleaned;
        }
      }
      return null;
    };
    const contactCompany = isContactLookup ? extractContactCompany(messages[messages.length - 1]?.content || lowerContent) : null;

    if (isContactLookup && contactCompany && contactCompany.length > 1) {
      return makeStream(async (emit) => {
        emit({ type: 'step', text: `Running verified research for ${contactCompany}…`, icon: '🔬', sub: 'Only confirmed current employees will be saved' });

        const prefix = `# 🔬 Researching ${contactCompany}\n\nRunning a real web search to find a **verified, current** contact — no guessing.\n\n---\n\n`;
        const { results, savedCompanies, failCount } = await runResearch([contactCompany], request.nextUrl.origin, emit, prefix);

        const final = results +
          (savedCompanies.length > 0
            ? `✅ Contact data saved to pipeline. Refresh to view in the sidebar.`
            : failCount > 0
              ? `⚠️ Could not verify a current contact at ${contactCompany} — all candidates were rejected to avoid saving stale data.`
              : ``);

        emit({ type: 'result', message: final, savedCompanies: savedCompanies.length });
      });
    }

    if (isSponsorRequest) {
      const numberMatch = lowerContent.match(/\b(\d+)\b/);
      const count = numberMatch ? Math.min(Math.max(parseInt(numberMatch[1]), 1), 20) : 5;

      return makeStream(async (emit) => {
        emit({ type: 'step', text: 'Asking AI to pick the best companies for your request…', icon: '🤖' });

        const selectionPrompt = `The user wants to research ${count} potential corporate sponsors for Sloss.Tech, a technology conference in Birmingham, Alabama.\n\nTheir request: "${messages[messages.length - 1]?.content}"\n\nPick exactly ${count} real, well-known tech companies that would be excellent sponsors. Prefer companies with active developer/community sponsorship programs that have sponsored tech conferences before.\n\nReturn ONLY a JSON array of company name strings, nothing else. Example:\n["Stripe", "Twilio", "Datadog"]`;

        let chosenCompanies: string[] = [];
        try {
          const aiRaw = await chatWithOpenAI([{ role: 'user', content: selectionPrompt }]);
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
      });
    }

    const response = await chatWithOpenAI(allMessages);
    return NextResponse.json({ success: true, message: response });
  } catch (error) {
    console.error('Chat API error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to process request' },
      { status: 500 }
    );
  }
}
