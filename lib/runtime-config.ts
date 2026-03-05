// Runtime config stored in Prisma DB — survives redeployments, no redeploy needed to update
import { prisma } from './db';

export async function getConfig(key: string): Promise<string | null> {
  try {
    const row = await prisma.config.findUnique({ where: { key } });
    return row?.value ?? null;
  } catch {
    return null;
  }
}

export async function setConfig(key: string, value: string): Promise<void> {
  await prisma.config.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });
}

export async function deleteConfig(key: string): Promise<void> {
  try {
    await prisma.config.delete({ where: { key } });
  } catch {
    // ignore if not found
  }
}

// Specific helpers for LM Studio
export async function getLMStudioURL(): Promise<string | null> {
  return getConfig('lmstudio_base_url');
}

export async function setLMStudioURL(url: string): Promise<void> {
  return setConfig('lmstudio_base_url', url);
}

export async function clearLMStudioURL(): Promise<void> {
  return deleteConfig('lmstudio_base_url');
}

export async function getLMStudioActive(): Promise<boolean> {
  const val = await getConfig('lmstudio_active');
  return val === 'true';
}

export async function setLMStudioActive(active: boolean): Promise<void> {
  return setConfig('lmstudio_active', active ? 'true' : 'false');
}
