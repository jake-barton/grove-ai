// Strict validation functions to ensure data quality and prevent hallucinations

/**
 * Validates that a URL is real and properly formatted
 * Returns null if invalid, cleaned URL if valid
 */
export function validateUrl(url: string | undefined | null): string | null {
  if (!url || url.trim() === '' || url === 'Not found' || url === 'N/A') {
    return null;
  }

  try {
    // Check for common hallucination patterns
    const hallucinations = [
      'example.com',
      'company.com',
      'website.com',
      '[',
      ']',
      '(',
      ')',
      'http://www.company',
      'https://company',
    ];

    const lowerUrl = url.toLowerCase();
    for (const pattern of hallucinations) {
      if (lowerUrl.includes(pattern)) {
        console.warn(`Rejected hallucinated URL pattern: ${url}`);
        return null;
      }
    }

    // Parse and validate URL
    const urlObj = new URL(url);
    
    // Must be http or https
    if (!['http:', 'https:'].includes(urlObj.protocol)) {
      return null;
    }

    // Must have a valid domain with TLD
    const domain = urlObj.hostname;
    if (!domain || !domain.includes('.') || domain.split('.').length < 2) {
      return null;
    }

    return url;
  } catch {
    console.warn(`Invalid URL rejected: ${url}`);
    return null;
  }
}

/**
 * Validates LinkedIn URLs specifically
 */
export function validateLinkedInUrl(url: string | undefined | null): string | null {
  const validatedUrl = validateUrl(url);
  if (!validatedUrl) return null;

  const lowerUrl = validatedUrl.toLowerCase();
  
  // Must be from linkedin.com domain
  if (!lowerUrl.includes('linkedin.com')) {
    return null;
  }

  // Must be a profile or company page
  if (!lowerUrl.includes('/in/') && !lowerUrl.includes('/company/')) {
    return null;
  }

  // Extract the profile/company ID
  let profileId = '';
  if (lowerUrl.includes('/in/')) {
    profileId = lowerUrl.split('/in/')[1]?.split('/')[0] || '';
  } else if (lowerUrl.includes('/company/')) {
    profileId = lowerUrl.split('/company/')[1]?.split('/')[0] || '';
  }

  // Must have at least 3 characters in the profile ID
  if (profileId.length < 3) {
    console.warn(`Rejected LinkedIn URL with short ID: ${url}`);
    return null;
  }

  // Reject generic patterns
  const genericPatterns = [
    '/in/firstname',
    '/in/lastname',
    '/in/name',
    '/in/john',
    '/in/jane',
    '/company/companyname',
    '/company/company-name',
    '/company/company',
    'firstname-lastname',
    'john-doe',
    'jane-doe',
  ];

  for (const pattern of genericPatterns) {
    if (lowerUrl.includes(pattern)) {
      console.warn(`Rejected generic LinkedIn pattern: ${url}`);
      return null;
    }
  }

  return validatedUrl;
}

/**
 * Validates email addresses
 */
export function validateEmail(email: string | undefined | null): string | null {
  if (!email || email.trim() === '' || email === 'Not found' || email === 'N/A') {
    return null;
  }

  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  
  if (!emailRegex.test(email)) {
    return null;
  }

  // Reject example/placeholder emails
  const invalidDomains = ['example.com', 'email.com', 'company.com', 'domain.com'];
  const domain = email.split('@')[1]?.toLowerCase();
  
  if (invalidDomains.includes(domain)) {
    console.warn(`Rejected placeholder email: ${email}`);
    return null;
  }

  return email;
}

/**
 * Validates that a URL actually exists in search results
 */
export function validateUrlInSearchResults(
  url: string | undefined | null,
  searchResults: Array<{ link?: string; title?: string; snippet?: string }>
): string | null {
  const validatedUrl = validateUrl(url);
  if (!validatedUrl) return null;

  // Check if this URL appears in any search result
  const found = searchResults.some(result => {
    if (!result.link) return false;
    
    // Exact match
    if (result.link === validatedUrl) return true;
    
    // Normalized match (trailing slash, protocol differences)
    const normalizedResult = result.link.replace(/\/$/, '').toLowerCase();
    const normalizedInput = validatedUrl.replace(/\/$/, '').toLowerCase();
    
    return normalizedResult === normalizedInput;
  });

  if (!found) {
    console.warn(`URL not found in search results: ${url}`);
    return null;
  }

  return validatedUrl;
}

/**
 * Validates contact name to ensure it's not generic/placeholder
 */
export function validateContactName(name: string | undefined | null): string | null {
  if (!name || name.trim() === '' || name === 'Not found' || name === 'N/A') {
    return null;
  }

  const lowerName = name.toLowerCase();
  
  // Reject obvious placeholders
  const placeholders = [
    'firstname',
    'lastname',
    'name here',
    'contact name',
    'john doe',
    'jane doe',
    'example',
    'person',
    'user',
    '[name]',
  ];

  for (const placeholder of placeholders) {
    if (lowerName.includes(placeholder)) {
      console.warn(`Rejected placeholder name: ${name}`);
      return null;
    }
  }

  // Must have at least 2 parts (first and last name)
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) {
    console.warn(`Name too short, likely invalid: ${name}`);
    return null;
  }

  return name;
}

/**
 * Validates company name
 */
export function validateCompanyName(name: string | undefined | null): string | null {
  if (!name || name.trim() === '' || name === 'Not found' || name === 'N/A') {
    return null;
  }

  const lowerName = name.toLowerCase();
  
  // Reject placeholders
  const placeholders = ['company name', 'example', '[company]', 'companyname'];
  
  for (const placeholder of placeholders) {
    if (lowerName === placeholder) {
      console.warn(`Rejected placeholder company: ${name}`);
      return null;
    }
  }

  return name.trim();
}

/**
 * Validates that data has sufficient quality for production use
 */
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  score: number; // 0-100
}

export function validateCompanyData(data: {
  company_name?: string;
  website?: string;
  contact_name?: string;
  contact_linkedin?: string;
  linkedin_company?: string;
  contact_info?: string;
}): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  let score = 100;

  // Critical validations (must pass)
  const validCompanyName = validateCompanyName(data.company_name);
  if (!validCompanyName) {
    errors.push('Invalid or missing company name');
    score -= 50;
  }

  const validWebsite = validateUrl(data.website);
  if (!validWebsite) {
    warnings.push('No valid company website found');
    score -= 15;
  }

  // Important validations
  const validContactLinkedIn = validateLinkedInUrl(data.contact_linkedin);
  if (!validContactLinkedIn && data.contact_linkedin) {
    // A URL was provided but failed validation — penalise
    warnings.push('LinkedIn URL provided but failed validation');
    score -= 10;
  }

  const validCompanyLinkedIn = validateLinkedInUrl(data.linkedin_company);
  if (!validCompanyLinkedIn && data.linkedin_company) {
    // A URL was provided but failed validation — penalise
    warnings.push('Company LinkedIn URL provided but failed validation');
    score -= 10;
  }

  const validContactName = validateContactName(data.contact_name);
  if (!validContactName && data.contact_name) {
    warnings.push('Contact name provided but appears to be placeholder');
    score -= 15;
  }

  const validEmail = validateEmail(data.contact_info);
  if (!validEmail && data.contact_info && data.contact_info.includes('@')) {
    warnings.push('Email provided but failed validation');
    score -= 10;
  }

  // Mild penalty for fields being completely absent (not provided at all)
  if (!validContactLinkedIn) {
    score -= 5; // Small nudge — missing is fine, just less ideal
  }

  if (!validContactName) {
    score -= 5; // Small nudge — missing is fine, just less ideal
  }

  // Determine if data is usable - RAISED THRESHOLD from 50 to 60
  const isValid = errors.length === 0 && score >= 60;

  return {
    isValid,
    errors,
    warnings,
    score: Math.max(0, score),
  };
}

/**
 * Sanitizes AI-generated text to remove markdown artifacts and clean up
 */
export function sanitizeText(text: string | undefined | null): string {
  if (!text) return '';
  
  return text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Remove markdown links, keep text
    .replace(/\*\*/g, '') // Remove bold markers
    .replace(/\*/g, '') // Remove italic markers
    .replace(/#{1,6}\s/g, '') // Remove headers
    .trim();
}
