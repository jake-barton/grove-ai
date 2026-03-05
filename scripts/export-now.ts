import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });
import { exportToGoogleSheets } from '../lib/google-sheets';
import { PrismaClient } from '../lib/generated/prisma';

const prisma = new PrismaClient({ accelerateUrl: process.env.DATABASE_URL });

async function main() {
  const companies = await prisma.company.findMany({ orderBy: { created_at: 'desc' } });
  console.log(`Exporting ${companies.length} companies...`);
  const msg = await exportToGoogleSheets(companies as never);
  console.log('✅', msg);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
