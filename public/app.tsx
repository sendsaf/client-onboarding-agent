import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { useAgent } from 'agents/react';
import type { ClientBrief, OnboardingSnapshot, ProposalArtifact, RichMessageResult } from '../src/shared';
import './styles.css';

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
};

type IntakeDetails = {
  name: string;
  email: string;
  mobile: string;
  company: string;
};

type ClientSession = IntakeDetails & {
  conversationId: string;
};

type AdminLeadSummary = {
  id: string;
  name: string;
  email: string;
  phone: string;
  company: string;
  status: string;
  phase: number;
  estimatedTotal: number;
  updatedAt: string;
  services: string[];
  completion: number;
  proposalReady: boolean;
};

type AdminLeadDetail = {
  lead: Record<string, string | number | null>;
  messages: Array<{ role: string; content: string; timestamp: string }>;
  state: {
    brief?: ClientBrief;
    proposal?: ProposalArtifact | null;
    missingFields?: string[];
    phase?: number;
  } | null;
};

const SESSION_KEY = 'client-onboarding-agent-session';
const ADMIN_TOKEN_KEY = 'client-onboarding-admin-token';

function stripOptions(text: string) {
  return text.replace(/\n?\[OPTIONS:\s*[^\]]+\]/gi, '').trim();
}

function parseOptionFallback(text: string) {
  const match = text.match(/\[OPTIONS:\s*([^\]]+)\]/i);
  if (!match) return [];
  return match[1].split('|').map((item) => item.trim()).filter(Boolean);
}

function fieldValue(value: string | number | undefined) {
  if (value === undefined || value === '') return 'Not captured';
  return String(value);
}

function proposalText(proposal: ProposalArtifact) {
  return [
    `# ${proposal.title}`,
    '',
    `Recommended package: ${proposal.recommendedPackage}`,
    '',
    proposal.summary,
    '',
    'Scope:',
    ...proposal.scope.map((item) => `- ${item}`),
    '',
    `Timeline: ${proposal.timeline}`,
    `Investment: ${proposal.investment}`,
    '',
    'Next steps:',
    ...proposal.nextSteps.map((item) => `- ${item}`),
    '',
    proposal.notes,
  ].join('\n');
}

function IntakeScreen({
  onStart,
  isStarting,
  error,
}: {
  onStart: (details: IntakeDetails) => void;
  isStarting: boolean;
  error: string;
}) {
  const params = new URLSearchParams(window.location.search);
  const [details, setDetails] = useState<IntakeDetails>({
    name: params.get('name') || '',
    email: params.get('email') || '',
    mobile: params.get('mobile') || '',
    company: params.get('company') || '',
  });

  const update = (key: keyof IntakeDetails, value: string) => {
    setDetails((current) => ({ ...current, [key]: value }));
  };

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col justify-center px-5 py-10">
        <div className="grid items-center gap-10 lg:grid-cols-[1fr_460px]">
          <section>
            <div className="mb-6 inline-flex rounded-full border border-slate-200 bg-white px-3 py-1 text-sm font-medium text-slate-600 shadow-sm">
              Client Onboarding Agent
            </div>
            <h1 className="max-w-3xl text-4xl font-semibold leading-tight tracking-normal text-slate-950 md:text-6xl">
              Turn project discovery into a live client brief.
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-600">
              A structured onboarding workspace with guided chat, phase tracking, proposal drafting, and lead review.
            </p>
          </section>

          <form
            className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/60"
            onSubmit={(event) => {
              event.preventDefault();
              onStart(details);
            }}
          >
            <h2 className="text-xl font-semibold text-slate-950">Start client intake</h2>
            <div className="mt-6 space-y-4">
              <label className="block text-sm font-medium text-slate-700">
                Name
                <input
                  className="mt-2 h-12 w-full rounded-xl border border-slate-200 px-4 text-base outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                  value={details.name}
                  onChange={(event) => update('name', event.target.value)}
                  required
                />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Email
                <input
                  className="mt-2 h-12 w-full rounded-xl border border-slate-200 px-4 text-base outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                  type="email"
                  value={details.email}
                  onChange={(event) => update('email', event.target.value)}
                  required
                />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Mobile
                <input
                  className="mt-2 h-12 w-full rounded-xl border border-slate-200 px-4 text-base outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                  value={details.mobile}
                  onChange={(event) => update('mobile', event.target.value)}
                  required
                />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Company
                <input
                  className="mt-2 h-12 w-full rounded-xl border border-slate-200 px-4 text-base outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                  value={details.company}
                  onChange={(event) => update('company', event.target.value)}
                />
              </label>
            </div>
            {error && <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
            <button
              className="mt-6 h-12 w-full rounded-xl bg-slate-950 px-5 font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={isStarting}
            >
              {isStarting ? 'Starting...' : 'Start onboarding'}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}

function PhaseTimeline({ snapshot }: { snapshot: OnboardingSnapshot | null }) {
  const phases = snapshot?.phases || [];
  return (
    <aside className="hidden h-full min-h-0 border-r border-slate-200 bg-white px-4 py-5 md:block">
      <div className="mb-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Progress</p>
        <div className="mt-3 h-2 rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-blue-600 transition-all"
            style={{ width: `${snapshot?.completion || 0}%` }}
          />
        </div>
        <p className="mt-2 text-sm text-slate-600">{snapshot?.completion || 0}% complete</p>
      </div>
      <ol className="space-y-3">
        {phases.map((phase) => (
          <li key={phase.id} className="flex gap-3">
            <div
              className={[
                'mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold',
                phase.status === 'completed'
                  ? 'border-blue-600 bg-blue-600 text-white'
                  : phase.status === 'active'
                    ? 'border-blue-600 bg-blue-50 text-blue-700'
                    : 'border-slate-200 bg-white text-slate-400',
              ].join(' ')}
            >
              {phase.id}
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900">{phase.title}</p>
              <p className="text-xs leading-5 text-slate-500">{phase.description}</p>
            </div>
          </li>
        ))}
      </ol>
    </aside>
  );
}

function BriefPanel({
  snapshot,
  onGenerateProposal,
  isGeneratingProposal,
}: {
  snapshot: OnboardingSnapshot | null;
  onGenerateProposal: () => void;
  isGeneratingProposal: boolean;
}) {
  const brief = snapshot?.brief;
  return (
    <aside className="h-full min-h-0 overflow-y-auto border-l border-slate-200 bg-white px-4 py-5">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Live brief</p>
          <h2 className="text-lg font-semibold text-slate-950">{brief?.contact.company || brief?.contact.name || 'New lead'}</h2>
        </div>
        <button
          className="h-10 rounded-lg bg-blue-600 px-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50"
          disabled={!snapshot || isGeneratingProposal}
          onClick={onGenerateProposal}
        >
          {isGeneratingProposal ? 'Drafting' : 'Proposal'}
        </button>
      </div>

      {brief ? (
        <div className="space-y-4">
          <BriefSection title="Contact" rows={[
            ['Name', brief.contact.name],
            ['Email', brief.contact.email],
            ['Phone', brief.contact.phone],
          ]} />
          <BriefSection title="Business" rows={[
            ['Stage', brief.business.stage],
            ['Region', brief.business.region],
            ['Offer', brief.business.mainOffer],
            ['Ideal client', brief.business.idealClient],
          ]} />
          <TagSection title="Services" values={brief.services} />
          <BriefSection title="Branding" rows={[
            ['Assets', brief.branding.hasAssets],
            ['Difference', brief.branding.differentiators],
          ]} />
          <TagSection title="Brand feel" values={brief.branding.brandWords} />
          <BriefSection title="Website" rows={[
            ['Goal', brief.website.primaryGoal],
            ['Content', brief.website.contentReadiness],
          ]} />
          <TagSection title="Features" values={brief.website.features} />
          <TagSection title="Marketing" values={brief.marketing.channels} />
          <BriefSection title="Budget" rows={[
            ['Project', brief.project.budget || 'Not captured'],
            ['Monthly marketing', brief.marketing.monthlyBudget],
            ['Timeline', brief.project.timeline],
            ['Estimate', brief.project.estimatedTotal || 'Not captured'],
          ]} />
          <TagSection title="Missing" values={snapshot.missingFields} tone="warning" />
        </div>
      ) : (
        <p className="text-sm text-slate-500">No brief yet.</p>
      )}
    </aside>
  );
}

function BriefSection({ title, rows }: { title: string; rows: Array<[string, string | number]> }) {
  return (
    <section className="rounded-xl border border-slate-200 p-3">
      <h3 className="mb-3 text-sm font-semibold text-slate-900">{title}</h3>
      <dl className="space-y-2">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</dt>
            <dd className="mt-0.5 text-sm leading-5 text-slate-700">{fieldValue(value)}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function TagSection({ title, values, tone = 'default' }: { title: string; values: string[]; tone?: 'default' | 'warning' }) {
  return (
    <section className="rounded-xl border border-slate-200 p-3">
      <h3 className="mb-3 text-sm font-semibold text-slate-900">{title}</h3>
      {values.length ? (
        <div className="flex flex-wrap gap-2">
          {values.map((value) => (
            <span
              key={value}
              className={[
                'rounded-full px-2.5 py-1 text-xs font-medium',
                tone === 'warning' ? 'bg-amber-50 text-amber-800' : 'bg-slate-100 text-slate-700',
              ].join(' ')}
            >
              {value}
            </span>
          ))}
        </div>
      ) : (
        <p className="text-sm text-slate-500">Not captured</p>
      )}
    </section>
  );
}

function ProposalPanel({ proposal }: { proposal: ProposalArtifact | null | undefined }) {
  const [copied, setCopied] = useState(false);
  if (!proposal) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">
        Proposal draft will appear here when enough discovery is captured.
      </div>
    );
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Proposal draft</p>
          <h3 className="mt-1 text-lg font-semibold text-slate-950">{proposal.title}</h3>
        </div>
        <button
          className="h-9 rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          onClick={async () => {
            await navigator.clipboard.writeText(proposalText(proposal));
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1800);
          }}
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <div className="mt-4 space-y-4 text-sm leading-6 text-slate-700">
        <p>{proposal.summary}</p>
        <div>
          <p className="font-semibold text-slate-900">Recommended package: {proposal.recommendedPackage}</p>
          <p>Timeline: {proposal.timeline}</p>
          <p>Investment: {proposal.investment}</p>
        </div>
        <div>
          <p className="font-semibold text-slate-900">Scope</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {proposal.scope.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </div>
        <div>
          <p className="font-semibold text-slate-900">Next steps</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {proposal.nextSteps.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </div>
        <p className="text-slate-500">{proposal.notes}</p>
      </div>
    </section>
  );
}

function ClientWorkspace() {
  const [session, setSession] = useState<ClientSession | null>(null);
  const [agentName, setAgentName] = useState('anonymous');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [snapshot, setSnapshot] = useState<OnboardingSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isStarting, setIsStarting] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [isGeneratingProposal, setIsGeneratingProposal] = useState(false);
  const [error, setError] = useState('');
  const [mobileTab, setMobileTab] = useState<'chat' | 'brief' | 'proposal'>('chat');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const agent = useAgent({
    agent: 'OnboardingAgent',
    name: agentName,
  });

  const options = useMemo(() => snapshot?.options || [], [snapshot]);

  useEffect(() => {
    const saved = sessionStorage.getItem(SESSION_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as ClientSession;
        if (parsed.conversationId) {
          setSession(parsed);
          setAgentName(parsed.conversationId);
        }
      } catch {
        sessionStorage.removeItem(SESSION_KEY);
      }
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    if (!session?.conversationId || agentName !== session.conversationId) return;
    agent.stub.getSnapshot()
      .then((next: OnboardingSnapshot) => setSnapshot(next))
      .catch(() => undefined);
  }, [agentName, session?.conversationId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isThinking]);

  const startSession = async (details: IntakeDetails) => {
    setIsStarting(true);
    setError('');
    try {
      const response = await fetch('/api/chat/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(details),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Unable to start session');
      const nextSession: ClientSession = { ...details, conversationId: payload.conversationId };
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(nextSession));
      setSession(nextSession);
      setAgentName(payload.conversationId);
      setSnapshot(payload.snapshot);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to start session');
    } finally {
      setIsStarting(false);
    }
  };

  const sendMessage = async (messageText: string) => {
    const message = messageText.trim();
    if (!message || !session || isThinking) return;

    const userMessage: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: message };
    setMessages((current) => [...current, userMessage]);
    setInput('');
    setIsThinking(true);
    setMobileTab('chat');

    try {
      const result = await agent.stub.sendMessageRich(message, session.conversationId) as RichMessageResult;
      setSnapshot(result.snapshot);
      setMessages((current) => [
        ...current,
        { id: crypto.randomUUID(), role: 'assistant', content: stripOptions(result.reply) },
      ]);
      if (!result.snapshot.options.length) {
        const fallbackOptions = parseOptionFallback(result.reply);
        if (fallbackOptions.length) {
          setSnapshot((current) => current ? { ...current, options: fallbackOptions } : current);
        }
      }
    } catch {
      setMessages((current) => [
        ...current,
        { id: crypto.randomUUID(), role: 'assistant', content: 'Sorry, there was an error. Please try again.' },
      ]);
    } finally {
      setIsThinking(false);
    }
  };

  const generateProposal = async () => {
    if (!session || isGeneratingProposal) return;
    setIsGeneratingProposal(true);
    try {
      const nextSnapshot = await agent.stub.generateProposal() as OnboardingSnapshot;
      setSnapshot(nextSnapshot);
      setMobileTab('proposal');
    } finally {
      setIsGeneratingProposal(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-500">
        Loading...
      </div>
    );
  }

  if (!session) {
    return <IntakeScreen onStart={startSession} isStarting={isStarting} error={error} />;
  }

  return (
    <div className="flex h-screen min-h-0 flex-col bg-slate-50 text-slate-950">
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4">
        <div>
          <p className="text-sm font-semibold text-slate-950">Client Onboarding Agent</p>
          <p className="text-xs text-slate-500">{session.company || session.name}</p>
        </div>
        <div className="flex items-center gap-2">
          <a className="hidden rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 sm:block" href="/admin">
            Admin
          </a>
          <button
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            onClick={() => {
              sessionStorage.removeItem(SESSION_KEY);
              setSession(null);
              setSnapshot(null);
              setMessages([]);
            }}
          >
            New
          </button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[280px_minmax(0,1fr)] xl:grid-cols-[280px_minmax(0,1fr)_380px]">
        <PhaseTimeline snapshot={snapshot} />

        <main className={['min-h-0 flex-col', mobileTab === 'chat' ? 'flex' : 'hidden md:flex'].join(' ')}>
          <div className="flex-1 overflow-y-auto px-4 py-6">
            <div className="mx-auto max-w-3xl space-y-5">
              {messages.length === 0 && !isThinking && (
                <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                  <h1 className="text-2xl font-semibold text-slate-950">Discovery workspace</h1>
                  <p className="mt-2 text-slate-600">Let's understand your project needs.</p>
                </div>
              )}

              {messages.map((message) => (
                <div key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={[
                      'max-w-[86%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-base leading-7 shadow-sm',
                      message.role === 'user'
                        ? 'rounded-br-sm bg-slate-950 text-white'
                        : 'rounded-bl-sm border border-slate-200 bg-white text-slate-800',
                    ].join(' ')}
                  >
                    {message.content}
                  </div>
                </div>
              ))}

              {isThinking && (
                <div className="flex justify-start">
                  <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-sm border border-slate-200 bg-white px-4 py-3 shadow-sm">
                    <span className="h-2 w-2 animate-bounce rounded-full bg-blue-600" />
                    <span className="h-2 w-2 animate-bounce rounded-full bg-blue-600 [animation-delay:150ms]" />
                    <span className="h-2 w-2 animate-bounce rounded-full bg-blue-600 [animation-delay:300ms]" />
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          </div>

          {options.length > 0 && (
            <div className="border-t border-slate-200 bg-white px-4 py-3">
              <div className="mx-auto flex max-w-3xl flex-wrap gap-2">
                {options.map((option) => (
                  <button
                    key={option}
                    className="min-h-11 rounded-full border border-blue-200 bg-blue-50 px-4 text-sm font-semibold text-blue-700 transition hover:bg-blue-100 disabled:opacity-50"
                    disabled={isThinking}
                    onClick={() => sendMessage(option)}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>
          )}

          <form
            className="border-t border-slate-200 bg-white p-4"
            onSubmit={(event) => {
              event.preventDefault();
              sendMessage(input);
            }}
          >
            <div className="mx-auto flex max-w-3xl gap-3">
              <input
                className="h-12 min-w-0 flex-1 rounded-xl border border-slate-200 px-4 text-base outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                placeholder="Type your answer..."
                value={input}
                onChange={(event) => setInput(event.target.value)}
                disabled={isThinking}
              />
              <button
                className="h-12 rounded-xl bg-blue-600 px-5 font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!input.trim() || isThinking}
              >
                Send
              </button>
            </div>
          </form>
        </main>

        <section className={['min-h-0', mobileTab === 'brief' ? 'block' : 'hidden xl:block'].join(' ')}>
          <BriefPanel snapshot={snapshot} onGenerateProposal={generateProposal} isGeneratingProposal={isGeneratingProposal} />
        </section>

        <section className={['min-h-0 overflow-y-auto p-4', mobileTab === 'proposal' ? 'block' : 'hidden'].join(' ')}>
          <ProposalPanel proposal={snapshot?.proposal} />
        </section>
      </div>

      <nav className="grid h-14 shrink-0 grid-cols-3 border-t border-slate-200 bg-white md:hidden">
        {(['chat', 'brief', 'proposal'] as const).map((tab) => (
          <button
            key={tab}
            className={['text-sm font-semibold capitalize', mobileTab === tab ? 'text-blue-700' : 'text-slate-500'].join(' ')}
            onClick={() => setMobileTab(tab)}
          >
            {tab}
          </button>
        ))}
      </nav>
    </div>
  );
}

function AdminDashboard() {
  const [token, setToken] = useState(sessionStorage.getItem(ADMIN_TOKEN_KEY) || '');
  const [draftToken, setDraftToken] = useState(token);
  const [leads, setLeads] = useState<AdminLeadSummary[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [detail, setDetail] = useState<AdminLeadDetail | null>(null);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const authFetch = async (url: string, init: RequestInit = {}) => {
    const response = await fetch(url, {
      ...init,
      headers: {
        ...(init.headers || {}),
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'Request failed');
    return payload;
  };

  const loadLeads = async () => {
    if (!token) return;
    setIsLoading(true);
    setError('');
    try {
      const payload = await authFetch('/api/admin/leads');
      setLeads(payload.leads || []);
      if (!selectedId && payload.leads?.[0]?.id) setSelectedId(payload.leads[0].id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load leads');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadLeads();
  }, [token]);

  useEffect(() => {
    if (!token || !selectedId) return;
    authFetch(`/api/admin/leads/${selectedId}`)
      .then((payload) => setDetail(payload))
      .catch((err) => setError(err instanceof Error ? err.message : 'Unable to load lead'));
  }, [token, selectedId]);

  const updateStatus = async (status: string) => {
    if (!selectedId) return;
    const payload = await authFetch(`/api/admin/leads/${selectedId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
    setDetail(payload);
    await loadLeads();
  };

  if (!token) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <form
          className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/60"
          onSubmit={(event) => {
            event.preventDefault();
            sessionStorage.setItem(ADMIN_TOKEN_KEY, draftToken);
            setToken(draftToken);
          }}
        >
          <h1 className="text-xl font-semibold text-slate-950">Admin access</h1>
          <label className="mt-5 block text-sm font-medium text-slate-700">
            Token
            <input
              className="mt-2 h-12 w-full rounded-xl border border-slate-200 px-4 text-base outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              value={draftToken}
              onChange={(event) => setDraftToken(event.target.value)}
              type="password"
              required
            />
          </label>
          <button className="mt-6 h-12 w-full rounded-xl bg-slate-950 font-semibold text-white transition hover:bg-slate-800">
            Continue
          </button>
        </form>
      </main>
    );
  }

  return (
    <main className="grid h-screen min-h-0 grid-cols-1 bg-slate-50 text-slate-950 lg:grid-cols-[360px_minmax(0,1fr)]">
      <aside className="min-h-0 overflow-y-auto border-r border-slate-200 bg-white">
        <div className="sticky top-0 border-b border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h1 className="text-lg font-semibold">Leads</h1>
              <p className="text-sm text-slate-500">{leads.length} total</p>
            </div>
            <button
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              onClick={() => {
                sessionStorage.removeItem(ADMIN_TOKEN_KEY);
                setToken('');
              }}
            >
              Lock
            </button>
          </div>
          {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        </div>
        {isLoading ? (
          <p className="p-4 text-sm text-slate-500">Loading...</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {leads.map((lead) => (
              <button
                key={lead.id}
                className={[
                  'block w-full px-4 py-4 text-left transition hover:bg-slate-50',
                  selectedId === lead.id ? 'bg-blue-50' : 'bg-white',
                ].join(' ')}
                onClick={() => setSelectedId(lead.id)}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold text-slate-950">{lead.company || lead.name || 'Unnamed lead'}</p>
                  <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">{lead.status}</span>
                </div>
                <p className="mt-1 text-sm text-slate-500">{lead.email}</p>
                <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
                  <span>{lead.completion}% complete</span>
                  <span>{lead.services.length ? lead.services.join(', ') : 'No services yet'}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </aside>

      <section className="min-h-0 overflow-y-auto p-5">
        {detail ? (
          <div className="mx-auto max-w-5xl space-y-5">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Lead detail</p>
                  <h2 className="mt-1 text-2xl font-semibold text-slate-950">
                    {String(detail.lead.company || detail.lead.client_name || 'Unnamed lead')}
                  </h2>
                  <p className="mt-1 text-slate-500">{String(detail.lead.email || '')}</p>
                </div>
                <select
                  className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                  value={String(detail.lead.status || 'active')}
                  onChange={(event) => updateStatus(event.target.value)}
                >
                  <option value="active">active</option>
                  <option value="qualified">qualified</option>
                  <option value="completed">completed</option>
                  <option value="abandoned">abandoned</option>
                  <option value="archived">archived</option>
                </select>
              </div>
            </div>

            <div className="grid gap-5 xl:grid-cols-[1fr_420px]">
              <div className="space-y-5">
                <BriefPanel
                  snapshot={detail.state ? {
                    phase: (detail.state.phase || 1) as OnboardingSnapshot['phase'],
                    phases: [],
                    brief: detail.state.brief!,
                    proposal: detail.state.proposal || null,
                    messagesSummary: [],
                    missingFields: detail.state.missingFields || [],
                    completion: detail.state.missingFields ? Math.max(0, Math.round(((13 - detail.state.missingFields.length) / 13) * 100)) : 0,
                    options: [],
                    updatedAt: '',
                  } : null}
                  onGenerateProposal={() => undefined}
                  isGeneratingProposal={false}
                />
              </div>
              <div className="space-y-5">
                <ProposalPanel proposal={detail.state?.proposal || null} />
                <section className="rounded-xl border border-slate-200 bg-white p-4">
                  <h3 className="text-sm font-semibold text-slate-900">Conversation</h3>
                  <div className="mt-4 space-y-3">
                    {detail.messages.map((message, index) => (
                      <div key={`${message.timestamp}-${index}`} className="rounded-lg bg-slate-50 p-3">
                        <p className="text-xs font-semibold uppercase text-slate-400">{message.role}</p>
                        <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-700">{stripOptions(message.content)}</p>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-500">Select a lead.</p>
        )}
      </section>
    </main>
  );
}

function App() {
  return window.location.pathname.startsWith('/admin') ? <AdminDashboard /> : <ClientWorkspace />;
}

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
