// Type definitions for the sponsor research platform

export interface Company {
  id?: string;
  company_name: string;
  draft: boolean;
  outreach_status: 'not_started' | 'in_progress' | 'completed';
  email_format?: string;
  contact_name?: string;
  contact_position?: string;
  contact_info?: string;
  contact_linkedin?: string;
  contact_confidence?: 'high' | 'medium' | 'low' | 'unverified'; // How confident we are the contact is current
  linkedin_company?: string;
  confirmed_emails: string[];
  bounced_emails: string[];
  previously_sponsored: boolean;
  previous_events?: string[];
  what_they_sponsored?: string;
  why_good_fit?: string;
  relevant_links?: string[];
  industry?: string;
  company_size?: string;
  website?: string;
  notes?: string;
  sponsorship_likelihood_score?: number;
  approved_for_export?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  metadata?: {
    companies?: Company[];
    action?: string;
    progress?: number;
  };
}

export interface ResearchTask {
  id: string;
  query: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  progress: number;
  results?: Company[];
  created_at: Date;
  completed_at?: Date;
}

export interface AIResponse {
  message: string;
  action?: string;
  data?: Company[] | Company | Record<string, unknown>;
  requiresInput?: boolean;
  suggestions?: string[];
}
