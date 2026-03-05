// Persistent company store with file system backup
import { Company } from './types';
import fs from 'fs';
import path from 'path';

// Path to persistent storage file
const STORAGE_PATH = path.join(process.cwd(), 'data', 'companies.json');

// In-memory cache
let companies: Company[] = [];
let isInitialized = false;

// Initialize storage - load from file if exists
function initializeStorage(): void {
  if (isInitialized) return;
  
  try {
    // Ensure data directory exists
    const dataDir = path.dirname(STORAGE_PATH);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
      console.log(`📁 Created data directory: ${dataDir}`);
    }

    // Load existing data if file exists
    if (fs.existsSync(STORAGE_PATH)) {
      const fileContent = fs.readFileSync(STORAGE_PATH, 'utf-8');
      companies = JSON.parse(fileContent);
      console.log(`📂 Loaded ${companies.length} companies from persistent storage`);
    } else {
      console.log(`📄 No existing data file, starting fresh`);
      saveToFile(); // Create empty file
    }
  } catch (error) {
    console.error('❌ Error initializing storage:', error);
    companies = [];
  }
  
  isInitialized = true;
}

// Save to file
function saveToFile(): void {
  try {
    fs.writeFileSync(STORAGE_PATH, JSON.stringify(companies, null, 2), 'utf-8');
    console.log(`💾 Persisted ${companies.length} companies to disk`);
  } catch (error) {
    console.error('❌ Error saving to file:', error);
  }
}

// Normalize a company name for fuzzy deduplication
// Strips legal suffixes, punctuation, spacing differences
// e.g. "Amazon Web Services" === "AWS" will still differ, but
// "Amazon Web Services, Inc." === "Amazon Web Services" will match
function normalizeCompanyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[,.'"-]/g, '')
    .replace(/\b(inc|llc|ltd|co|corp|corporation|limited|plc|gmbh|ag|bv|sa)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Build a set of known abbreviations / alternate names for common companies
// so "AWS" and "Amazon Web Services" are treated as the same
const KNOWN_ALIASES: Record<string, string[]> = {
  'amazon web services': ['aws'],
  'google cloud': ['google cloud platform', 'gcp'],
  'microsoft azure': ['azure'],
  'meta platforms': ['meta', 'facebook'],
  'alphabet': ['google'],
  'international business machines': ['ibm'],
  'salesforce': ['salesforce.com'],
};

function isSameCompany(a: string, b: string): boolean {
  const na = normalizeCompanyName(a);
  const nb = normalizeCompanyName(b);
  if (na === nb) return true;
  // Check known aliases
  for (const [canonical, aliases] of Object.entries(KNOWN_ALIASES)) {
    const group = [canonical, ...aliases];
    if (group.includes(na) && group.includes(nb)) return true;
  }
  return false;
}

export function addCompanyToMemory(company: Company): void {
  initializeStorage();

  // #1: Fuzzy deduplicate — update if name matches after normalization or alias lookup
  const existingIndex = companies.findIndex(c => isSameCompany(c.company_name, company.company_name));
  if (existingIndex >= 0) {
    console.log(`🔄 Company "${company.company_name}" matches existing "${companies[existingIndex].company_name}" — updating`);
    companies[existingIndex] = { ...companies[existingIndex], ...company, id: companies[existingIndex].id };
  } else {
    companies.push(company);
    console.log(`📝 Saved ${company.company_name} to memory (total: ${companies.length})`);
  }
  saveToFile();
}

export function getCompaniesFromMemory(): Company[] {
  initializeStorage();
  return [...companies];
}

export function clearCompaniesMemory(): void {
  initializeStorage();
  companies = [];
  saveToFile();
}

export function removeCompanyFromMemory(id: string): boolean {
  initializeStorage();
  const initialLength = companies.length;
  companies = companies.filter(c => c.id !== id);
  const removed = companies.length < initialLength;
  if (removed) {
    console.log(`🗑️ Removed company ${id} from memory (remaining: ${companies.length})`);
    saveToFile();
  }
  return removed;
}

export function updateCompanyInMemory(id: string, updates: Partial<Company>): Company | null {
  initializeStorage();
  const index = companies.findIndex(c => c.id === id);
  if (index === -1) {
    console.log(`❌ Company ${id} not found in memory`);
    return null;
  }
  
  companies[index] = { ...companies[index], ...updates };
  console.log(`🔧 Updated company ${id} in memory:`, updates);
  saveToFile();
  return companies[index];
}
