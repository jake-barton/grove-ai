// Main application page
'use client';

import { useState, useEffect, useRef } from 'react';
import { Company, Message } from '@/lib/types';
import ChatInterface from '@/components/ChatInterface';
import CompanyList from '@/components/CompanyList';
import Header from '@/components/Header';
import LoadingScreen from '@/components/LoadingScreen';

export type ThinkingStep = {
  text: string;
  icon?: string;
  sub?: string;
  done?: boolean;
};

export type ResearchProgress = {
  current: number;
  total: number;
  company: string;
};

export default function Home() {
  const [showLoading, setShowLoading] = useState(true);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: `🌲 Hey! I'm **Grove**, TechBirmingham's AI sponsor research assistant.\n\nI help the team find, research, and manage potential sponsors for **Sloss.Tech** and other TechBirmingham events. I can:\n\n- 🔍 Research companies and find the right contacts\n- 📊 Score sponsorship likelihood based on past event history\n- 📋 Sync everything to your Google Sheet automatically\n- ✉️ Track email formats and outreach status\n\nWhat would you like to work on today?`,
      timestamp: new Date(),
    },
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const [thinkingSteps, setThinkingSteps] = useState<ThinkingStep[]>([]);
  const [researchProgress, setResearchProgress] = useState<ResearchProgress | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Load companies on mount
  useEffect(() => {
    fetchCompanies();
  }, []);

  const fetchCompanies = async () => {
    try {
      const response = await fetch('/api/companies');
      const data = await response.json();
      if (data.success) {
        setCompanies(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch companies:', error);
    }
  };

  const handleStop = () => {
    abortControllerRef.current?.abort();
  };

  const handleSendMessage = async (content: string) => {
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content,
      timestamp: new Date(),
    };

    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setIsLoading(true);
    setThinkingSteps([]);
    setResearchProgress(null);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    const pollInterval = setInterval(() => { fetchCompanies(); }, 5000);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: updatedMessages.map(m => ({ role: m.role, content: m.content })),
        }),
        signal: controller.signal,
      });

      const contentType = response.headers.get('Content-Type') || '';

      // ── Streaming response (research operations) ──────────────────────────
      if (contentType.includes('ndjson') && response.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const chunk = JSON.parse(line);

              if (chunk.type === 'step') {
                setThinkingSteps(prev => [...prev, { text: chunk.text, icon: chunk.icon, sub: chunk.sub }]);
              } else if (chunk.type === 'progress') {
                setResearchProgress({ current: chunk.current, total: chunk.total, company: chunk.company });
              } else if (chunk.type === 'result') {
                setThinkingSteps(prev => prev.map(s => ({ ...s, done: true })));
                setMessages(prev => [...prev, {
                  id: (Date.now() + 1).toString(),
                  role: 'assistant',
                  content: chunk.message,
                  timestamp: new Date(),
                }]);
              } else if (chunk.type === 'error') {
                setMessages(prev => [...prev, {
                  id: (Date.now() + 1).toString(),
                  role: 'assistant',
                  content: `❌ ${chunk.message}`,
                  timestamp: new Date(),
                }]);
              }
            } catch { /* malformed chunk, skip */ }
          }
        }
      } else {
        // ── Regular JSON response (formatting, chat, etc.) ─────────────────
        const data = await response.json();
        if (data.success) {
          setMessages(prev => [...prev, {
            id: (Date.now() + 1).toString(),
            role: 'assistant',
            content: data.message,
            timestamp: new Date(),
          }]);
        }
      }
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'AbortError') {
        setMessages(prev => [...prev, {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: '⏹️ Research stopped.',
          timestamp: new Date(),
        }]);
      } else {
        console.error('Chat error:', error);
        setMessages(prev => [...prev, {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: '❌ Sorry, I encountered an error. Please try again.',
          timestamp: new Date(),
        }]);
      }
    } finally {
      abortControllerRef.current = null;
      clearInterval(pollInterval);
      await fetchCompanies();
      setIsLoading(false);
      setThinkingSteps([]);
      setResearchProgress(null);
    }
  };

  const handleExportToSheets = async () => {
    // Get the spreadsheet ID from environment or use the configured one
    const spreadsheetId = process.env.NEXT_PUBLIC_GOOGLE_SHEETS_SPREADSHEET_ID || '1761DIiQvGZ9FoM-EQrPlVdvrwUggtdyQzTsdnt5ccks';
    const spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;
    
    // Open the spreadsheet in a new window or focus existing window
    window.open(spreadsheetUrl, '_blank');
  };

  const handleDeleteCompany = async (id: string) => {
    try {
      await fetch(`/api/companies/${id}`, { method: 'DELETE' });
      await fetchCompanies();
    } catch (error) {
      console.error('Failed to delete company:', error);
    }
  };

  const handleApproveCompany = async (id: string, approved: boolean) => {
    try {
      await fetch(`/api/companies/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approved_for_export: approved }),
      });
      await fetchCompanies();
    } catch (error) {
      console.error('Failed to approve company:', error);
    }
  };

  const handleUpdateCompany = async (id: string, data: Partial<Company>) => {
    try {
      await fetch(`/api/companies/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      await fetchCompanies();
    } catch (error) {
      console.error('Failed to update company:', error);
    }
  };

  return (
    <>
      {showLoading && (
        <LoadingScreen onComplete={() => setShowLoading(false)} />
      )}
      <div className="flex flex-col h-screen" style={{ background: 'var(--bg-base)' }}>
        <Header onExport={handleExportToSheets} companyCount={companies.length} />

        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar — Pipeline */}
          <div className="w-1/3 flex flex-col overflow-hidden" style={{ borderRight: '1px solid var(--border-mid)' }}>
            <CompanyList
              companies={companies}
              onRefresh={fetchCompanies}
              onDelete={handleDeleteCompany}
              onApprove={handleApproveCompany}
              onUpdate={handleUpdateCompany}
            />
          </div>

          {/* Chat — Grove */}
          <div className="flex-1 flex flex-col overflow-hidden" style={{ background: 'var(--bg-surface)' }}>
            <ChatInterface
              messages={messages}
              onSendMessage={handleSendMessage}
              isLoading={isLoading}
              onStop={handleStop}
              thinkingSteps={thinkingSteps}
              researchProgress={researchProgress}
            />
          </div>
        </div>
      </div>
    </>
  );
}
