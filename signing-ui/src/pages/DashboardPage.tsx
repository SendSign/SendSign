import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
  FileText, Send, Clock, CheckCircle2, XCircle, Plus,
  Search, Filter, MoreHorizontal, Eye, Trash2,
  ChevronDown, LayoutTemplate, RefreshCw,
  AlertCircle, Mail, Download, FileCheck, Upload, X, LogOut, Settings,
} from 'lucide-react';

// ─── Types ──────────────────────────────────────────────────────────

interface Signer {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  signedAt: string | null;
}

interface Envelope {
  id: string;
  subject: string;
  message: string | null;
  status: 'draft' | 'sent' | 'in_progress' | 'completed' | 'voided' | 'expired';
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  sentAt: string | null;
  completedAt: string | null;
  expiresAt: string | null;
  signers: Signer[];
  fields: unknown[];
}

interface Template {
  id: string;
  name: string;
  description: string | null;
  fieldConfig: unknown[];
  signerRoles: unknown[];
  isLocked: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

type TabId = 'all' | 'action_required' | 'waiting' | 'completed' | 'drafts' | 'voided' | 'templates';

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: typeof CheckCircle2 }> = {
  draft: { label: 'Draft', color: 'text-gray-600', bg: 'bg-gray-100 border-gray-300', icon: FileText },
  sent: { label: 'Sent', color: 'text-blue-700', bg: 'bg-blue-50 border-blue-300', icon: Send },
  in_progress: { label: 'In Progress', color: 'text-amber-700', bg: 'bg-amber-50 border-amber-300', icon: Clock },
  completed: { label: 'Completed', color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-300', icon: CheckCircle2 },
  voided: { label: 'Voided', color: 'text-red-600', bg: 'bg-red-50 border-red-300', icon: XCircle },
  expired: { label: 'Expired', color: 'text-gray-500', bg: 'bg-gray-100 border-gray-300', icon: AlertCircle },
};

// ─── Component ──────────────────────────────────────────────────────

export function DashboardPage() {
  const navigate = useNavigate();

  // Auth — supports both JWT (email/password login) and legacy API key
  const authToken = useRef('');

  if (!authToken.current) {
    // Priority: 1) JWT from login, 2) API key from URL, 3) API key from session
    const jwt = localStorage.getItem('sendsign_token');
    if (jwt) {
      authToken.current = jwt;
    } else {
      const params = new URLSearchParams(window.location.search);
      const fromUrl = params.get('apiKey');
      if (fromUrl) {
        sessionStorage.setItem('coseal_api_key', fromUrl);
        authToken.current = fromUrl;
      } else {
        authToken.current = sessionStorage.getItem('coseal_api_key') || '';
      }
    }
  }

  // If no auth at all, redirect to login
  if (!authToken.current) {
    navigate('/login');
    return null;
  }

  const authHeaders = useCallback((): Record<string, string> => ({ Authorization: `Bearer ${authToken.current}` }), []);

  // State
  const [activeTab, setActiveTab] = useState<TabId>('all');
  const [envelopes, setEnvelopes] = useState<Envelope[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [totalEnvelopes, setTotalEnvelopes] = useState(0);
  const [actionMenuId, setActionMenuId] = useState<string | null>(null);
  const [showNewEnvelope, setShowNewEnvelope] = useState(false);
  const [newSubject, setNewSubject] = useState('');
  const [newSignerName, setNewSignerName] = useState('');
  const [newSignerEmail, setNewSignerEmail] = useState('');
  const [newFile, setNewFile] = useState<File | null>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [detailEnvelope, setDetailEnvelope] = useState<Envelope | null>(null);
  const [voidConfirm, setVoidConfirm] = useState<Envelope | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [voiding, setVoiding] = useState(false);
  const [resending, setResending] = useState<string | null>(null);
  const [actionToast, setActionToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [auditEnvelope, setAuditEnvelope] = useState<Envelope | null>(null);
  const [auditEvents, setAuditEvents] = useState<Array<{ id: string; eventType: string; createdAt: string; signerName: string | null; signerEmail: string | null; eventData: unknown; ipAddress: string | null; geolocation: string | null }>>([]);
  const [auditLoading, setAuditLoading] = useState(false);

  // Fetch data
  const fetchEnvelopes = useCallback(async () => {
    try {
      const res = await fetch('/api/envelopes?limit=100', { headers: authHeaders() });
      if (res.status === 401) {
        // Clear stale tokens and redirect to login
        localStorage.removeItem('sendsign_token');
        localStorage.removeItem('sendsign_user');
        sessionStorage.removeItem('coseal_api_key');
        navigate('/login');
        return;
      }
      const data = await res.json();
      if (data.success) {
        setEnvelopes(data.data.envelopes || []);
        setTotalEnvelopes(data.data.total || 0);
      }
    } catch {
      // silently fail
    }
  }, [authHeaders]);

  const fetchTemplates = useCallback(async () => {
    try {
      const res = await fetch('/api/templates', { headers: authHeaders() });
      if (res.status === 401) return; // handled by fetchEnvelopes
      const data = await res.json();
      if (data.success) {
        setTemplates(Array.isArray(data.data) ? data.data : []);
      }
    } catch {
      // silently fail
    }
  }, [authHeaders]);

  const loadData = useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchEnvelopes(), fetchTemplates()]);
    setLoading(false);
  }, [fetchEnvelopes, fetchTemplates]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Create new envelope
  const handleCreateEnvelope = async () => {
    if (!newSubject.trim() || !newSignerName.trim() || !newSignerEmail.trim() || !newFile) return;
    setCreating(true);
    setCreateError('');
    try {
      const formData = new FormData();
      formData.append('subject', newSubject.trim());
      formData.append('signers', JSON.stringify([{
        name: newSignerName.trim(),
        email: newSignerEmail.trim(),
        role: 'signer',
      }]));
      formData.append('documents', newFile);

      const res = await fetch('/api/envelopes', {
        method: 'POST',
        headers: authHeaders(),
        body: formData,
      });
      const data = await res.json();
      if (data.success && data.data?.id) {
        setShowNewEnvelope(false);
        setNewSubject('');
        setNewSignerName('');
        setNewSignerEmail('');
        setNewFile(null);
        setCreateError('');
        navigate(`/prepare/${data.data.id}`);
      } else {
        setCreateError(data.error || 'Failed to create envelope. Please try again.');
      }
    } catch (err) {
      setCreateError('Unable to connect to the server. Make sure the backend is running.');
    } finally {
      setCreating(false);
    }
  };

  // Action toast auto-dismiss
  useEffect(() => {
    if (!actionToast) return;
    const t = setTimeout(() => setActionToast(null), 4000);
    return () => clearTimeout(t);
  }, [actionToast]);

  // Void envelope
  const handleVoid = async () => {
    if (!voidConfirm) return;
    setVoiding(true);
    try {
      const res = await fetch(`/api/envelopes/${voidConfirm.id}/void`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ reason: voidReason.trim() || undefined }),
      });
      const data = await res.json();
      if (data.success) {
        setActionToast({ message: `"${voidConfirm.subject}" has been voided`, type: 'success' });
        setVoidConfirm(null);
        setVoidReason('');
        fetchEnvelopes();
      } else {
        setActionToast({ message: data.error || 'Failed to void envelope', type: 'error' });
      }
    } catch {
      setActionToast({ message: 'Unable to connect to server', type: 'error' });
    } finally {
      setVoiding(false);
    }
  };

  // Resend notification
  const handleResend = async (env: Envelope) => {
    setResending(env.id);
    setActionMenuId(null);
    try {
      const res = await fetch(`/api/envelopes/${env.id}/resend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
      });
      const data = await res.json();
      if (data.success) {
        setActionToast({ message: `Notifications resent for "${env.subject}" (${data.data?.resent || 0} signers)`, type: 'success' });
      } else {
        setActionToast({ message: data.error || 'Failed to resend', type: 'error' });
      }
    } catch {
      setActionToast({ message: 'Unable to connect to server', type: 'error' });
    } finally {
      setResending(null);
    }
  };

  // Delete envelope
  const handleDelete = async (env: Envelope) => {
    setActionMenuId(null);
    if (!confirm(`Delete "${env.subject}"? This cannot be undone.`)) return;

    try {
      const res = await fetch(`/api/envelopes/${env.id}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      const data = await res.json();
      if (data.success) {
        setActionToast({ message: `"${env.subject}" deleted`, type: 'success' });
        loadData();
      } else {
        setActionToast({ message: data.error || 'Failed to delete', type: 'error' });
      }
    } catch {
      setActionToast({ message: 'Unable to connect to server', type: 'error' });
    }
  };

  // Fetch audit trail when envelope selected
  useEffect(() => {
    if (!auditEnvelope) return;
    setAuditLoading(true);
    fetch(`/api/envelopes/${auditEnvelope.id}/audit`, { headers: authHeaders() })
      .then((res) => res.json())
      .then((data) => {
        if (data.success) setAuditEvents(data.data.events);
      })
      .catch(() => {})
      .finally(() => setAuditLoading(false));
  }, [auditEnvelope]);

  // Stats
  const stats = useMemo(() => {
    const draft = envelopes.filter((e) => e.status === 'draft').length;
    const waiting = envelopes.filter((e) => e.status === 'sent' || e.status === 'in_progress').length;
    const completed = envelopes.filter((e) => e.status === 'completed').length;
    const voided = envelopes.filter((e) => e.status === 'voided').length;
    return { total: totalEnvelopes, draft, waiting, completed, voided };
  }, [envelopes, totalEnvelopes]);

  // Filter envelopes
  const filteredEnvelopes = useMemo(() => {
    let list = envelopes;

    if (activeTab === 'action_required') list = list.filter((e) => e.status === 'sent' || e.status === 'in_progress');
    else if (activeTab === 'waiting') list = list.filter((e) => e.status === 'sent' || e.status === 'in_progress');
    else if (activeTab === 'completed') list = list.filter((e) => e.status === 'completed');
    else if (activeTab === 'drafts') list = list.filter((e) => e.status === 'draft');
    else if (activeTab === 'voided') list = list.filter((e) => e.status === 'voided' || e.status === 'expired');

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (e) =>
          e.subject?.toLowerCase().includes(q) ||
          e.signers.some((s) => s.name.toLowerCase().includes(q) || s.email.toLowerCase().includes(q)),
      );
    }

    return [...list].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [envelopes, activeTab, searchQuery]);

  // Format date
  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d ago`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
  };

  const formatFullDate = (dateStr: string | null) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  };

  const signerSummary = (signers: Signer[]) => {
    const signed = signers.filter((s) => s.status === 'completed' || s.signedAt).length;
    return `${signed}/${signers.length}`;
  };

  // Close action menu on outside click
  useEffect(() => {
    if (!actionMenuId) return;
    const handler = () => setActionMenuId(null);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [actionMenuId]);

  const tabs: { id: TabId; label: string; count?: number }[] = [
    { id: 'all', label: 'All', count: stats.total },
    { id: 'action_required', label: 'Action Required', count: stats.waiting },
    { id: 'completed', label: 'Completed', count: stats.completed },
    { id: 'drafts', label: 'Drafts', count: stats.draft },
    { id: 'voided', label: 'Voided', count: stats.voided },
    { id: 'templates', label: 'Templates', count: templates.length },
  ];

  // ── Render ──────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#ebedf0]">
      {/* ═══ TOP NAV ═══ */}
      <header className="bg-white border-b-2 border-gray-300 sticky top-0 z-30 shadow-sm">
        <div className="max-w-[1400px] mx-auto px-6">
          <div className="flex items-center h-16 gap-8">
            {/* Logo */}
            <img
              src="/sendsign-logo.svg"
              alt="SendSign"
              className="h-[30px] w-auto shrink-0"
            />

            {/* Nav */}
            <nav className="flex items-center gap-1 flex-1 overflow-x-auto">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-3.5 py-2 text-[13px] font-semibold rounded-md whitespace-nowrap transition-all ${
                    activeTab === tab.id
                      ? 'bg-blue-50 text-blue-700 border border-blue-200'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100 border border-transparent'
                  }`}
                >
                  {tab.label}
                  {tab.count !== undefined && (
                    <span className={`ml-1.5 text-[11px] font-bold px-1.5 py-0.5 rounded-full ${
                      activeTab === tab.id ? 'bg-blue-100 text-blue-700' : 'bg-gray-200 text-gray-600'
                    }`}>
                      {tab.count}
                    </span>
                  )}
                </button>
              ))}
            </nav>

            {/* Actions */}
            <div className="flex items-center gap-3 shrink-0">
              <button
                onClick={() => { fetchEnvelopes(); fetchTemplates(); }}
                className="p-2 text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-all"
                title="Refresh"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
              <button
                onClick={() => setShowNewEnvelope(true)}
                className="flex items-center gap-2 px-4 py-2.5 bg-[#2563eb] text-white text-sm font-bold rounded-lg hover:bg-blue-700 transition-all shadow-md hover:shadow-lg"
              >
                <Plus className="w-4 h-4" />
                New Envelope
              </button>

              {/* User / Profile / Logout */}
              <div className="flex items-center gap-1 pl-2 border-l-2 border-gray-200">
                {(() => {
                  try {
                    const u = JSON.parse(localStorage.getItem('sendsign_user') || '{}');
                    return u.name ? (
                      <button
                        onClick={() => navigate('/profile')}
                        className="text-xs font-semibold text-gray-600 hover:text-blue-600 hidden sm:block px-1 py-1 rounded transition-colors"
                        title="Account settings"
                      >
                        {u.name}
                      </button>
                    ) : null;
                  } catch { return null; }
                })()}
                <button
                  onClick={() => navigate('/profile')}
                  className="p-2 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-all"
                  title="Account settings"
                >
                  <Settings className="w-4 h-4" />
                </button>
                <button
                  onClick={() => {
                    localStorage.removeItem('sendsign_token');
                    localStorage.removeItem('sendsign_user');
                    sessionStorage.removeItem('coseal_api_key');
                    navigate('/login');
                  }}
                  className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                  title="Sign out"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* ═══ MAIN CONTENT ═══ */}
      <div className="max-w-[1400px] mx-auto px-6 py-6">

        {/* ── Stat Cards ────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <StatCard icon={FileText} label="Total Envelopes" value={stats.total} color="text-gray-900" iconBg="bg-gray-100" />
          <StatCard icon={Clock} label="Waiting for Others" value={stats.waiting} color="text-amber-700" iconBg="bg-amber-50" />
          <StatCard icon={CheckCircle2} label="Completed" value={stats.completed} color="text-emerald-700" iconBg="bg-emerald-50" />
          <StatCard icon={LayoutTemplate} label="Templates" value={templates.length} color="text-violet-700" iconBg="bg-violet-50" />
        </div>

        {/* ── Loading ────────────────────── */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="flex items-center gap-3 text-gray-500">
              <RefreshCw className="w-5 h-5 animate-spin" />
              <span className="text-sm font-semibold">Loading your documents...</span>
            </div>
          </div>
        )}

        {/* ── Templates View ────────────── */}
        {!loading && activeTab === 'templates' && (
          <div className="bg-white rounded-xl border-2 border-gray-300 shadow-md overflow-hidden">
            <div className="px-5 py-4 border-b-2 border-gray-200 bg-gray-50 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-gray-900">Templates</h2>
                <p className="text-xs text-gray-500 mt-0.5">Reusable document templates for quick sending</p>
              </div>
            </div>

            {templates.length === 0 ? (
              <div className="py-16 text-center">
                <LayoutTemplate className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                <p className="text-sm font-semibold text-gray-500">No templates yet</p>
                <p className="text-xs text-gray-400 mt-1">Templates will appear here when created via the API</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-200">
                {templates.map((t) => (
                  <div
                    key={t.id}
                    className="px-5 py-4 flex items-center gap-4 hover:bg-gray-50 transition-colors group"
                  >
                    <div className="w-10 h-10 bg-violet-100 rounded-lg flex items-center justify-center shrink-0 border border-violet-200">
                      <LayoutTemplate className="w-5 h-5 text-violet-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{t.name}</p>
                      {t.description && (
                        <p className="text-xs text-gray-500 truncate mt-0.5">{t.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-4 shrink-0">
                      {t.isLocked && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 border border-gray-300">
                          Locked
                        </span>
                      )}
                      <span className="text-xs text-gray-500 font-medium">{formatDate(t.createdAt)}</span>
                      {/* Use template */}
                      <button
                        onClick={async () => {
                          try {
                            const form = new FormData();
                            form.append('subject', `From template: ${t.name}`);
                            form.append('templateId', t.id);
                            const res = await fetch('/api/envelopes', { method: 'POST', headers: authHeaders(), body: form });
                            const data = await res.json();
                            if (data.success) {
                              navigate(`/prepare/${data.data.id}`);
                            } else {
                              setActionToast({ message: data.error || 'Failed to create envelope', type: 'error' });
                            }
                          } catch {
                            setActionToast({ message: 'Failed to create envelope from template', type: 'error' });
                          }
                        }}
                        className="px-3 py-1.5 text-xs font-semibold text-blue-600 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100 transition-all opacity-0 group-hover:opacity-100"
                        title="Use this template"
                      >
                        Use
                      </button>
                      {/* Delete template */}
                      <button
                        onClick={async () => {
                          if (!confirm(`Delete template "${t.name}"?`)) return;
                          try {
                            const res = await fetch(`/api/templates/${t.id}`, { method: 'DELETE', headers: authHeaders() });
                            const data = await res.json();
                            if (data.success) {
                              setActionToast({ message: `Template "${t.name}" deleted`, type: 'success' });
                              loadData();
                            } else {
                              setActionToast({ message: data.error || 'Failed to delete template', type: 'error' });
                            }
                          } catch {
                            setActionToast({ message: 'Failed to delete template', type: 'error' });
                          }
                        }}
                        className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-all opacity-0 group-hover:opacity-100"
                        title="Delete template"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Envelopes View ────────────── */}
        {!loading && activeTab !== 'templates' && (
          <div className="bg-white rounded-xl border-2 border-gray-300 shadow-md overflow-hidden">
            {/* Search / filter bar */}
            <div className="px-5 py-3 border-b-2 border-gray-200 bg-gray-50 flex items-center gap-3">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search by subject or recipient..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-sm bg-white border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all placeholder:text-gray-400 text-gray-900"
                />
              </div>
              <button className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-gray-600 hover:text-gray-900 hover:bg-white border-2 border-gray-300 rounded-lg transition-all">
                <Filter className="w-3.5 h-3.5" />
                Filter
                <ChevronDown className="w-3 h-3" />
              </button>
            </div>

            {/* Table header */}
            <div className="px-5 py-3 bg-gray-100 border-b-2 border-gray-200 grid grid-cols-[1fr_140px_140px_120px_80px_36px] gap-4 items-center">
              <span className="text-[11px] font-bold text-gray-600 uppercase tracking-wider">Document</span>
              <span className="text-[11px] font-bold text-gray-600 uppercase tracking-wider">Recipients</span>
              <span className="text-[11px] font-bold text-gray-600 uppercase tracking-wider">Last Activity</span>
              <span className="text-[11px] font-bold text-gray-600 uppercase tracking-wider">Status</span>
              <span className="text-[11px] font-bold text-gray-600 uppercase tracking-wider">Signed</span>
              <span />
            </div>

            {/* Rows */}
            {filteredEnvelopes.length === 0 ? (
              <div className="py-16 text-center">
                <FileText className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                <p className="text-sm font-semibold text-gray-500">
                  {searchQuery ? 'No documents match your search' : 'No documents yet'}
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  {searchQuery ? 'Try a different search term' : 'Click "New Envelope" to get started'}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-gray-200">
                {filteredEnvelopes.map((env) => {
                  const cfg = STATUS_CONFIG[env.status] || STATUS_CONFIG.draft;
                  const StatusIcon = cfg.icon;
                  return (
                    <div
                      key={env.id}
                      className="px-5 py-4 grid grid-cols-[1fr_140px_140px_120px_80px_36px] gap-4 items-center hover:bg-blue-50/40 transition-colors group cursor-pointer"
                      onClick={() => {
                        if (env.status === 'draft') {
                          navigate(`/prepare/${env.id}`);
                        }
                      }}
                    >
                      {/* Document */}
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate group-hover:text-blue-700 transition-colors">
                          {env.subject || 'Untitled'}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5 truncate">
                          {env.createdBy !== 'system' ? `by ${env.createdBy}` : ''} {formatFullDate(env.sentAt || env.createdAt)}
                        </p>
                      </div>

                      {/* Recipients */}
                      <div className="flex items-center">
                        <div className="flex -space-x-1.5">
                          {env.signers.slice(0, 3).map((s, i) => (
                            <RecipientAvatar key={s.id} signer={s} index={i} />
                          ))}
                        </div>
                        {env.signers.length > 3 && (
                          <span className="ml-1.5 text-[10px] font-bold text-gray-500">
                            +{env.signers.length - 3}
                          </span>
                        )}
                      </div>

                      {/* Last Activity */}
                      <span className="text-xs text-gray-600 font-medium">
                        {formatDate(env.completedAt || env.sentAt || env.updatedAt)}
                      </span>

                      {/* Status */}
                      <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full border ${cfg.bg} ${cfg.color} w-fit`}>
                        <StatusIcon className="w-3 h-3" />
                        {cfg.label}
                      </span>

                      {/* Signed count */}
                      <span className="text-xs font-bold text-gray-600">
                        {env.signers.length > 0 ? signerSummary(env.signers) : '—'}
                      </span>

                      {/* Actions */}
                      <div className="relative">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setActionMenuId(actionMenuId === env.id ? null : env.id);
                          }}
                          className="p-1 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-all"
                        >
                          <MoreHorizontal className="w-4 h-4" />
                        </button>

                        {actionMenuId === env.id && (
                          <div className="absolute right-0 top-8 bg-white border-2 border-gray-300 rounded-lg shadow-xl py-1 w-48 z-50 animate-popover-in">
                            {env.status === 'draft' && (
                              <ActionMenuItem
                                icon={FileText}
                                label="Edit & Prepare"
                                onClick={() => navigate(`/prepare/${env.id}`)}
                              />
                            )}
                            <ActionMenuItem icon={Eye} label="View Details" onClick={() => { setDetailEnvelope(env); setActionMenuId(null); }} />
                            {env.status === 'completed' && (
                              <ActionMenuItem icon={Download} label="Download Signed" onClick={() => {
                                window.open(`/api/envelopes/${env.id}/signed-document`, '_blank');
                                setActionMenuId(null);
                              }} />
                            )}
                            {env.status === 'completed' && (
                              <ActionMenuItem icon={FileCheck} label="Audit Certificate" onClick={() => {
                                window.open(`/api/envelopes/${env.id}/certificate`, '_blank');
                                setActionMenuId(null);
                              }} />
                            )}
                            {env.status !== 'draft' && (
                              <ActionMenuItem icon={Clock} label="Audit Trail" onClick={() => { setAuditEnvelope(env); setActionMenuId(null); }} />
                            )}
                            {(env.status === 'sent' || env.status === 'in_progress') && (
                              <ActionMenuItem icon={Mail} label={resending === env.id ? 'Sending...' : 'Resend Notification'} onClick={() => handleResend(env)} />
                            )}
                            {(env.status === 'draft' || env.status === 'voided') && (
                              <ActionMenuItem icon={Trash2} label="Delete" onClick={() => handleDelete(env)} danger />
                            )}
                            {(env.status === 'sent' || env.status === 'in_progress') && (
                              <ActionMenuItem icon={XCircle} label="Void" onClick={() => { setVoidConfirm(env); setActionMenuId(null); }} danger />
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Footer */}
            {filteredEnvelopes.length > 0 && (
              <div className="px-5 py-3 border-t-2 border-gray-200 bg-gray-50 flex items-center justify-between">
                <span className="text-xs text-gray-600 font-semibold">
                  Showing {filteredEnvelopes.length} of {totalEnvelopes} documents
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ═══ FOOTER ═══ */}
      <footer className="text-center py-6 text-xs text-gray-500">
        <div className="flex items-center justify-center gap-2 mb-1">
          <span className="font-semibold">Powered by</span>
          <img src="/sendsign-logo.svg" alt="SendSign" className="h-6 w-auto inline-block" />
        </div>
        <p className="text-gray-400">Electronic signatures secured with SHA-256 encryption</p>
      </footer>

      {/* ═══ ACTION TOAST ═══ */}
      {actionToast && createPortal(
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-[60] px-5 py-3 rounded-lg shadow-xl border-2 font-semibold text-sm flex items-center gap-2 animate-toast-in ${
          actionToast.type === 'success'
            ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
            : 'bg-red-50 border-red-300 text-red-800'
        }`}>
          {actionToast.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {actionToast.message}
          <button onClick={() => setActionToast(null)} className="ml-2 p-0.5 hover:bg-black/5 rounded">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>,
        document.body,
      )}

      {/* ═══ VIEW DETAILS MODAL ═══ */}
      {detailEnvelope && createPortal(
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 animate-fade-in" onClick={() => setDetailEnvelope(null)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full mx-4 overflow-hidden max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="px-6 py-4 border-b-2 border-gray-200 bg-gray-50 flex items-center justify-between shrink-0">
              <h2 className="text-base font-bold text-gray-900 truncate pr-4">{detailEnvelope.subject || 'Untitled'}</h2>
              <button
                onClick={() => setDetailEnvelope(null)}
                className="p-1 text-gray-400 hover:text-gray-700 hover:bg-gray-200 rounded-md transition-all shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1">
              {/* Status */}
              <div className="flex items-center gap-3 mb-5">
                {(() => {
                  const cfg = STATUS_CONFIG[detailEnvelope.status] || STATUS_CONFIG.draft;
                  const StatusIcon = cfg.icon;
                  return (
                    <span className={`inline-flex items-center gap-1.5 text-[12px] font-bold px-3 py-1.5 rounded-full border ${cfg.bg} ${cfg.color}`}>
                      <StatusIcon className="w-3.5 h-3.5" />
                      {cfg.label}
                    </span>
                  );
                })()}
                <span className="text-xs text-gray-500 font-medium">
                  Created {formatFullDate(detailEnvelope.createdAt)}
                </span>
              </div>

              {/* Dates */}
              <div className="grid grid-cols-2 gap-3 mb-5">
                {detailEnvelope.sentAt && (
                  <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-0.5">Sent</p>
                    <p className="text-sm font-semibold text-gray-800">{formatFullDate(detailEnvelope.sentAt)}</p>
                  </div>
                )}
                {detailEnvelope.completedAt && (
                  <div className="bg-emerald-50 rounded-lg p-3 border border-emerald-200">
                    <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider mb-0.5">Completed</p>
                    <p className="text-sm font-semibold text-emerald-800">{formatFullDate(detailEnvelope.completedAt)}</p>
                  </div>
                )}
                {detailEnvelope.expiresAt && (
                  <div className="bg-amber-50 rounded-lg p-3 border border-amber-200">
                    <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wider mb-0.5">Expires</p>
                    <p className="text-sm font-semibold text-amber-800">{formatFullDate(detailEnvelope.expiresAt)}</p>
                  </div>
                )}
              </div>

              {/* Message */}
              {detailEnvelope.message && (
                <div className="mb-5">
                  <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">Message</p>
                  <p className="text-sm text-gray-700 bg-gray-50 rounded-lg p-3 border border-gray-200">{detailEnvelope.message}</p>
                </div>
              )}

              {/* Recipients */}
              <div>
                <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2">Recipients ({detailEnvelope.signers.length})</p>
                <div className="flex flex-col gap-2">
                  {detailEnvelope.signers.map((s, i) => {
                    const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];
                    const color = colors[i % colors.length];
                    const isSigned = s.status === 'completed' || !!s.signedAt;
                    return (
                      <div key={s.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
                        <div
                          className="w-9 h-9 rounded-full flex items-center justify-center text-[12px] font-bold text-white shrink-0"
                          style={{ backgroundColor: color }}
                        >
                          {s.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-900">{s.name}</p>
                          <p className="text-xs text-gray-500">{s.email}</p>
                        </div>
                        <div className="shrink-0 text-right">
                          {isSigned ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                              <CheckCircle2 className="w-3 h-3" /> Signed
                            </span>
                          ) : s.status === 'declined' ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
                              <XCircle className="w-3 h-3" /> Declined
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                              <Clock className="w-3 h-3" /> Pending
                            </span>
                          )}
                          {s.signedAt && (
                            <p className="text-[10px] text-gray-400 mt-0.5">{formatFullDate(s.signedAt)}</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Footer actions */}
            <div className="px-6 py-4 border-t-2 border-gray-200 bg-gray-50 flex gap-3 shrink-0">
              {detailEnvelope.status === 'draft' && (
                <button
                  onClick={() => { setDetailEnvelope(null); navigate(`/prepare/${detailEnvelope.id}`); }}
                  className="flex-1 px-4 py-2.5 bg-[#2563eb] text-white text-sm font-bold rounded-lg hover:bg-blue-700 transition-all"
                >
                  Edit & Prepare
                </button>
              )}
              {detailEnvelope.status === 'completed' && (
                <button
                  onClick={() => window.open(`/api/envelopes/${detailEnvelope.id}/signed-document`, '_blank')}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-[#2563eb] text-white text-sm font-bold rounded-lg hover:bg-blue-700 transition-all"
                >
                  <Download className="w-4 h-4" /> Download Signed PDF
                </button>
              )}
              <button
                onClick={() => setDetailEnvelope(null)}
                className="flex-1 px-4 py-2.5 border-2 border-gray-300 text-gray-700 text-sm font-bold rounded-lg hover:bg-gray-100 transition-all"
              >
                Close
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {/* ═══ VOID CONFIRMATION MODAL ═══ */}
      {voidConfirm && createPortal(
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 animate-fade-in" onClick={() => { setVoidConfirm(null); setVoidReason(''); }}>
          <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full mx-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b-2 border-red-100 bg-red-50 flex items-center gap-3">
              <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center">
                <XCircle className="w-4 h-4 text-red-600" />
              </div>
              <h2 className="text-base font-bold text-red-900">Void Envelope</h2>
            </div>
            <div className="p-6">
              <p className="text-sm text-gray-700 mb-1">
                Are you sure you want to void <strong>"{voidConfirm.subject}"</strong>?
              </p>
              <p className="text-xs text-gray-500 mb-4">This action cannot be undone. All signers will be notified.</p>
              <label className="block text-[12px] font-bold text-gray-600 uppercase tracking-wider mb-1.5">Reason (optional)</label>
              <input
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
                placeholder="e.g. Terms changed, sent to wrong recipient"
                className="w-full px-3 py-2.5 border-2 border-gray-300 rounded-lg text-sm text-gray-900 font-medium focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-400 transition-all placeholder:text-gray-400"
                onKeyDown={(e) => { if (e.key === 'Enter') handleVoid(); }}
                autoFocus
              />
            </div>
            <div className="px-6 py-4 border-t-2 border-gray-200 bg-gray-50 flex gap-3">
              <button
                onClick={() => { setVoidConfirm(null); setVoidReason(''); }}
                className="flex-1 px-4 py-2.5 border-2 border-gray-300 text-gray-700 text-sm font-bold rounded-lg hover:bg-gray-100 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleVoid}
                disabled={voiding}
                className="flex-1 px-4 py-2.5 bg-red-600 text-white text-sm font-bold rounded-lg hover:bg-red-700 disabled:opacity-50 transition-all"
              >
                {voiding ? 'Voiding...' : 'Void Envelope'}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {/* ═══ NEW ENVELOPE MODAL ═══ */}
      {showNewEnvelope && createPortal(
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 animate-fade-in" onClick={() => setShowNewEnvelope(false)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full mx-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="px-6 py-4 border-b-2 border-gray-200 bg-gray-50 flex items-center justify-between">
              <h2 className="text-base font-bold text-gray-900">New Envelope</h2>
              <button
                onClick={() => setShowNewEnvelope(false)}
                className="p-1 text-gray-400 hover:text-gray-700 hover:bg-gray-200 rounded-md transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 flex flex-col gap-4">
              {/* Subject */}
              <div>
                <label className="block text-[12px] font-bold text-gray-700 uppercase tracking-wider mb-1.5">Document Subject</label>
                <input
                  value={newSubject}
                  onChange={(e) => setNewSubject(e.target.value)}
                  placeholder="e.g. Employment Agreement"
                  className="w-full px-3 py-2.5 border-2 border-gray-300 rounded-lg text-sm text-gray-900 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all placeholder:text-gray-400"
                  autoFocus
                />
              </div>

              {/* First Signer */}
              <div>
                <label className="block text-[12px] font-bold text-gray-700 uppercase tracking-wider mb-1.5">First Recipient</label>
                <div className="flex flex-col gap-2">
                  <input
                    value={newSignerName}
                    onChange={(e) => setNewSignerName(e.target.value)}
                    placeholder="Full name"
                    className="w-full px-3 py-2.5 border-2 border-gray-300 rounded-lg text-sm text-gray-900 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all placeholder:text-gray-400"
                  />
                  <input
                    value={newSignerEmail}
                    onChange={(e) => setNewSignerEmail(e.target.value)}
                    placeholder="email@example.com"
                    type="email"
                    className="w-full px-3 py-2.5 border-2 border-gray-300 rounded-lg text-sm text-gray-900 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all placeholder:text-gray-400"
                  />
                </div>
              </div>

              {/* File upload */}
              <div>
                <label className="block text-[12px] font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                  Document (PDF) <span className="text-red-500">*</span>
                </label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.doc,.docx"
                  className="hidden"
                  onChange={(e) => setNewFile(e.target.files?.[0] || null)}
                />
                {newFile ? (
                  <div className="flex items-center gap-2 px-3 py-2.5 bg-blue-50 border-2 border-blue-200 rounded-lg">
                    <FileText className="w-4 h-4 text-blue-600 shrink-0" />
                    <span className="text-sm text-blue-800 font-semibold truncate flex-1">{newFile.name}</span>
                    <button onClick={() => setNewFile(null)} className="text-blue-400 hover:text-blue-700 transition-all">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full flex items-center justify-center gap-2 px-3 py-3 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-500 font-semibold hover:bg-gray-50 hover:border-gray-400 hover:text-gray-700 transition-all"
                  >
                    <Upload className="w-4 h-4" />
                    Upload Document
                  </button>
                )}
              </div>
            </div>

            {/* Error */}
            {createError && (
              <div className="mx-6 mb-4 px-4 py-3 bg-red-50 border-2 border-red-200 rounded-lg flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                <p className="text-sm text-red-700 font-medium">{createError}</p>
              </div>
            )}

            {/* Actions */}
            <div className="px-6 py-4 border-t-2 border-gray-200 bg-gray-50 flex gap-3">
              <button
                onClick={() => { setShowNewEnvelope(false); setCreateError(''); }}
                className="flex-1 px-4 py-2.5 border-2 border-gray-300 text-gray-700 text-sm font-bold rounded-lg hover:bg-gray-100 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateEnvelope}
                disabled={creating || !newSubject.trim() || !newSignerName.trim() || !newSignerEmail.trim() || !newFile}
                className="flex-1 px-4 py-2.5 bg-[#2563eb] text-white text-sm font-bold rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-all shadow-sm"
              >
                {creating ? 'Creating...' : 'Create & Prepare'}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {/* ═══ Audit Trail Modal ═══ */}
      {auditEnvelope && createPortal(
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setAuditEnvelope(null)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full mx-4 max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <div>
                <h2 className="text-base font-bold text-gray-900">Audit Trail</h2>
                <p className="text-xs text-gray-500 mt-0.5">{auditEnvelope.subject || 'Untitled'}</p>
              </div>
              <button onClick={() => setAuditEnvelope(null)} className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-auto px-6 py-4">
              {auditLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
                </div>
              ) : auditEvents.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-12">No audit events recorded</p>
              ) : (
                <div className="relative">
                  <div className="absolute left-3 top-2 bottom-2 w-px bg-gray-200" />
                  <div className="space-y-4">
                    {auditEvents.map((event) => (
                      <div key={event.id} className="flex gap-4 relative">
                        <div className="w-6 h-6 rounded-full bg-blue-100 border-2 border-white shadow-sm flex items-center justify-center shrink-0 z-10">
                          <div className="w-2 h-2 rounded-full bg-blue-500" />
                        </div>
                        <div className="flex-1 pb-1">
                          <div className="flex items-baseline gap-2 flex-wrap">
                            <span className="text-sm font-semibold text-gray-900 capitalize">
                              {event.eventType.replace(/_/g, ' ')}
                            </span>
                            <span className="text-[10px] text-gray-400">
                              {new Date(event.createdAt).toLocaleString()}
                            </span>
                          </div>
                          {event.signerName && (
                            <p className="text-xs text-gray-600 mt-0.5">
                              {event.signerName} {event.signerEmail ? `(${event.signerEmail})` : ''}
                            </p>
                          )}
                          {event.ipAddress && (
                            <p className="text-[10px] text-gray-400 mt-0.5">
                              IP: {event.ipAddress}{event.geolocation ? ` — ${event.geolocation}` : ''}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, color, iconBg }: {
  icon: typeof FileText;
  label: string;
  value: number;
  color: string;
  iconBg: string;
}) {
  return (
    <div className="bg-white rounded-xl border-2 border-gray-300 p-5 shadow-md">
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-lg ${iconBg} flex items-center justify-center border border-gray-200`}>
          <Icon className={`w-5 h-5 ${color}`} />
        </div>
        <div>
          <p className={`text-2xl font-extrabold ${color}`}>{value}</p>
          <p className="text-[11px] font-bold text-gray-500 mt-0.5 uppercase tracking-wide">{label}</p>
        </div>
      </div>
    </div>
  );
}

function ActionMenuItem({ icon: Icon, label, onClick, danger }: {
  icon: typeof FileText;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 text-[13px] font-semibold transition-all ${
        danger
          ? 'text-red-600 hover:bg-red-50'
          : 'text-gray-700 hover:bg-gray-50'
      }`}
    >
      <Icon className="w-4 h-4" />
      {label}
    </button>
  );
}

const AVATAR_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

function RecipientAvatar({ signer, index }: { signer: Signer; index: number }) {
  const [showTooltip, setShowTooltip] = useState(false);
  const color = AVATAR_COLORS[index % AVATAR_COLORS.length];
  const isSigned = signer.status === 'completed' || !!signer.signedAt;

  return (
    <div
      className="relative"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <div
        className="w-7 h-7 rounded-full border-2 border-white flex items-center justify-center text-[10px] font-bold text-white shrink-0 shadow-sm cursor-default"
        style={{ backgroundColor: color, zIndex: 5 - index }}
      >
        {signer.name.charAt(0).toUpperCase()}
      </div>

      {showTooltip && (
        <div
          className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-gray-900 text-white rounded-lg shadow-xl px-3 py-2 whitespace-nowrap z-[60] animate-popover-in"
          style={{ pointerEvents: 'none' }}
        >
          <p className="text-[12px] font-bold">{signer.name}</p>
          <p className="text-[11px] text-gray-300">{signer.email}</p>
          <div className="flex items-center gap-1 mt-1">
            {isSigned ? (
              <span className="text-[10px] font-semibold text-emerald-400 flex items-center gap-0.5">
                <CheckCircle2 className="w-3 h-3" /> Signed
              </span>
            ) : signer.status === 'declined' ? (
              <span className="text-[10px] font-semibold text-red-400 flex items-center gap-0.5">
                <XCircle className="w-3 h-3" /> Declined
              </span>
            ) : (
              <span className="text-[10px] font-semibold text-amber-400 flex items-center gap-0.5">
                <Clock className="w-3 h-3" /> Pending
              </span>
            )}
          </div>
          {/* Arrow */}
          <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-t-[5px] border-t-gray-900" />
        </div>
      )}
    </div>
  );
}
