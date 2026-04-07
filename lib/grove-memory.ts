/**
 * Grove Persistent Memory
 *
 * Inspired by open-multi-agent's SharedMemory — namespaced key/value store
 * backed by Prisma (Postgres) so memory survives server restarts and Vercel
 * cold starts. Any part of the app can write facts; they get injected into
 * Grove's system prompt so it always has context about the team's work.
 *
 * Namespaces:
 *   "preferences"   — user-stated preferences ("only Birmingham companies", "min score 6")
 *   "instructions"  — standing orders ("always research 10 at a time")
 *   "context"       — what happened recently ("last research: Stripe, Twilio")
 *   "goals"         — high-level objectives ("targeting SaaS companies for Silver tier")
 */

import prisma from '@/lib/db';

export type MemoryNamespace = 'preferences' | 'instructions' | 'context' | 'goals';

// ── Write ─────────────────────────────────────────────────────────────────
/**
 * Upsert a memory entry.
 * e.g. await groveMemory.write('preferences', 'industry_focus', 'SaaS and DevTools')
 */
export async function write(
  namespace: MemoryNamespace,
  key: string,
  value: string,
  sessionKey = 'global'
): Promise<void> {
  try {
    await prisma.memory.upsert({
      where: { session_key_namespace_key: { session_key: sessionKey, namespace, key } },
      update: { value, updated_at: new Date() },
      create: { session_key: sessionKey, namespace, key, value },
    });
  } catch (err) {
    console.error('[grove-memory] write error:', err);
  }
}

// ── Read ──────────────────────────────────────────────────────────────────
/** Read a single memory entry. Returns null if not found. */
export async function read(
  namespace: MemoryNamespace,
  key: string,
  sessionKey = 'global'
): Promise<string | null> {
  try {
    const entry = await prisma.memory.findUnique({
      where: { session_key_namespace_key: { session_key: sessionKey, namespace, key } },
    });
    return entry?.value ?? null;
  } catch {
    return null;
  }
}

// ── List ──────────────────────────────────────────────────────────────────
/** List all entries in a namespace. */
export async function listByNamespace(
  namespace: MemoryNamespace,
  sessionKey = 'global'
): Promise<Array<{ key: string; value: string }>> {
  try {
    const entries = await prisma.memory.findMany({
      where: { session_key: sessionKey, namespace },
      orderBy: { updated_at: 'desc' },
    });
    return entries.map(e => ({ key: e.key, value: e.value }));
  } catch {
    return [];
  }
}

/** List all memory entries across all namespaces. */
export async function listAll(sessionKey = 'global') {
  try {
    return await prisma.memory.findMany({
      where: { session_key: sessionKey },
      orderBy: [{ namespace: 'asc' }, { updated_at: 'desc' }],
    });
  } catch {
    return [];
  }
}

// ── Delete ────────────────────────────────────────────────────────────────
export async function forget(
  namespace: MemoryNamespace,
  key: string,
  sessionKey = 'global'
): Promise<void> {
  try {
    await prisma.memory.delete({
      where: { session_key_namespace_key: { session_key: sessionKey, namespace, key } },
    });
  } catch { /* already gone */ }
}

export async function clearNamespace(namespace: MemoryNamespace, sessionKey = 'global'): Promise<void> {
  try {
    await prisma.memory.deleteMany({ where: { session_key: sessionKey, namespace } });
  } catch { /* ignore */ }
}

// ── Summary (injected into system prompt) ────────────────────────────────
/**
 * Produces a markdown-style summary of all memory entries for injection
 * into Grove's system prompt. Truncates long values so the context window
 * stays clean.
 *
 * Example output:
 * ## Grove Memory
 * ### 🎯 Goals
 * - target_tier: Silver tier sponsors ($5k–$15k)
 * ### ⚙️ Preferences
 * - industry_focus: SaaS and Developer Tools
 * - min_score: 6
 * ### 📋 Instructions
 * - research_batch_size: Always research 10 companies at a time
 * ### 📍 Recent Context
 * - last_research: Researched Stripe, Twilio, Datadog — 3 saved
 */
export async function getSummary(sessionKey = 'global'): Promise<string> {
  try {
    const all = await prisma.memory.findMany({
      where: { session_key: sessionKey },
      orderBy: [{ namespace: 'asc' }, { key: 'asc' }],
    });

    if (all.length === 0) return '';

    const byNamespace = new Map<string, Array<{ key: string; value: string }>>();
    for (const entry of all) {
      const group = byNamespace.get(entry.namespace) ?? [];
      group.push({ key: entry.key, value: entry.value });
      byNamespace.set(entry.namespace, group);
    }

    const icons: Record<string, string> = {
      goals: '🎯 Goals',
      preferences: '⚙️ Preferences',
      instructions: '📋 Instructions',
      context: '📍 Recent Context',
    };

    const lines: string[] = ['## Grove Memory', ''];
    for (const [ns, entries] of byNamespace) {
      lines.push(`### ${icons[ns] ?? ns}`);
      for (const { key, value } of entries) {
        const display = value.length > 200 ? `${value.slice(0, 197)}…` : value;
        lines.push(`- ${key}: ${display}`);
      }
      lines.push('');
    }

    return lines.join('\n').trimEnd();
  } catch {
    return '';
  }
}

// ── Auto-extract and save memory from user messages ──────────────────────
/**
 * Parse a user message and save any memorable facts to the right namespace.
 * Called after every chat turn so Grove learns from instructions passively.
 *
 * Recognises patterns like:
 * - "always research 10 companies" → instructions/research_batch_size
 * - "focus on Birmingham companies" → preferences/location_focus
 * - "we want Silver sponsors" → goals/target_tier
 * - "minimum score of 7" → preferences/min_score
 */
export async function extractAndSave(userMessage: string): Promise<void> {
  const msg = userMessage.toLowerCase();

  // Batch size instruction
  const batchMatch = msg.match(/always (?:research|find|look up)\s+(\d+)\s+compan/);
  if (batchMatch) {
    await write('instructions', 'research_batch_size', `Always research ${batchMatch[1]} companies at a time`);
  }

  // Location preference
  if (msg.includes('birmingham') && (msg.includes('only') || msg.includes('focus') || msg.includes('local'))) {
    await write('preferences', 'location_focus', 'Prefer Birmingham, Alabama companies');
  }

  // Industry focus
  const industryMatch = msg.match(/(?:focus on|only|target|look for)\s+([a-z\s&]+?)\s+(?:companies|businesses|firms|startups)/);
  if (industryMatch) {
    await write('preferences', 'industry_focus', industryMatch[1].trim());
  }

  // Minimum score preference
  const scoreMatch = msg.match(/(?:minimum|min|at least|only|score[s]?\s+(?:of|above|over))\s+(\d+)/);
  if (scoreMatch) {
    await write('preferences', 'min_score', scoreMatch[1]);
  }

  // Sponsorship tier goal
  const tierMatch = msg.match(/(gold|silver|bronze|platinum|title|presenting)\s+(?:tier|sponsor|level)/);
  if (tierMatch) {
    await write('goals', 'target_tier', `${tierMatch[1].charAt(0).toUpperCase()}${tierMatch[1].slice(1)} tier sponsors`);
  }
}

// ── Update context after actions ─────────────────────────────────────────
/** Called after research completes to record what was just done. */
export async function recordAction(action: string, detail: string): Promise<void> {
  await write('context', 'last_action', `${action}: ${detail}`);
  await write('context', 'last_action_time', new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' }));
}
