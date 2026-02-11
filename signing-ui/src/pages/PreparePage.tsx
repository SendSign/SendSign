import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useNavigate } from 'react-router-dom';
import { PDFViewer } from '../components/PDFViewer';
import {
  PenLine, PenTool, Calendar, User, Mail, Building2, Briefcase,
  Type, CheckSquare, ArrowRight, Plus, X, Trash2, ChevronLeft, Save, FileX,
  Pencil, UserMinus, AlertTriangle, ArrowLeft,
} from 'lucide-react';
import type { FieldType } from '../types/index';

// ─── Constants ──────────────────────────────────────────────────────

const SIGNER_COLORS = [
  '#3b82f6', // blue
  '#10b981', // emerald
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // violet
];

function signerColorAt(index: number): string {
  return SIGNER_COLORS[index % SIGNER_COLORS.length];
}

const FIELD_PALETTE: Array<{
  type: FieldType;
  label: string;
  defaultW: number;
  defaultH: number;
  icon: typeof PenLine;
}> = [
  { type: 'signature', label: 'Signature',  defaultW: 180, defaultH: 24,  icon: PenLine },
  { type: 'initial',   label: 'Initials',   defaultW: 60,  defaultH: 24,  icon: PenTool },
  { type: 'date',      label: 'Date',       defaultW: 120, defaultH: 22,  icon: Calendar },
  { type: 'text',      label: 'Name',       defaultW: 160, defaultH: 22,  icon: User },
  { type: 'text',      label: 'Email',      defaultW: 180, defaultH: 22,  icon: Mail },
  { type: 'text',      label: 'Company',    defaultW: 160, defaultH: 22,  icon: Building2 },
  { type: 'text',      label: 'Title',      defaultW: 140, defaultH: 22,  icon: Briefcase },
  { type: 'text',      label: 'Text',       defaultW: 140, defaultH: 22,  icon: Type },
  { type: 'checkbox',  label: 'Checkbox',   defaultW: 22,  defaultH: 22,  icon: CheckSquare },
];

const SNAP_GRID = 10;
function snap(v: number): number { return Math.round(v / SNAP_GRID) * SNAP_GRID; }

// ─── Types ──────────────────────────────────────────────────────────

interface PlacedField {
  id: string;
  type: FieldType;
  signerId: string | null;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  required: boolean;
  label: string;
}

interface SignerInfo {
  id: string;
  name: string;
  email: string;
  role: string;
  colorIndex: number;
}

let _fid = 0;
function nextId(): string { return `pf-${++_fid}-${Date.now()}`; }

// ─── Toast Component ────────────────────────────────────────────────

interface ToastData {
  id: string;
  message: string;
  accentColor?: string;
  type: 'error' | 'success' | 'info';
}

function ToastContainer({ toasts, onDismiss }: { toasts: ToastData[]; onDismiss: (id: string) => void }) {
  if (toasts.length === 0) return null;
  return createPortal(
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2 items-center pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="pointer-events-auto flex items-center gap-3 bg-white rounded-lg shadow-lg border px-4 py-3 min-w-[300px] max-w-[480px] animate-toast-in"
          style={{ borderLeftColor: t.accentColor || (t.type === 'error' ? '#ef4444' : t.type === 'success' ? '#10b981' : '#3b82f6'), borderLeftWidth: '3px' }}
        >
          <p className="text-sm text-gray-700 flex-1">{t.message}</p>
          <button
            onClick={() => onDismiss(t.id)}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>,
    document.body,
  );
}

// ─── Field Property Popover ─────────────────────────────────────────

interface PopoverProps {
  field: PlacedField;
  position: { x: number; y: number };
  signers: SignerInfo[];
  onUpdate: (id: string, updates: Partial<PlacedField>) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

function FieldPopover({ field, position, signers, onUpdate, onDelete, onClose }: PopoverProps) {
  const ref = useRef<HTMLDivElement>(null);

  // Click outside to close
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    // Delay so the triggering click doesn't immediately close
    const timer = setTimeout(() => document.addEventListener('mousedown', handler), 50);
    return () => { clearTimeout(timer); document.removeEventListener('mousedown', handler); };
  }, [onClose]);

  // Position the popover, ensuring it stays in viewport
  const style = useMemo(() => {
    const x = Math.min(position.x, window.innerWidth - 260);
    const y = Math.min(position.y, window.innerHeight - 280);
    return { left: Math.max(8, x), top: Math.max(8, y) };
  }, [position]);

  return createPortal(
    <div
      ref={ref}
      className="fixed z-[90] w-[240px] bg-white rounded-xl shadow-xl border border-gray-200 animate-popover-in"
      style={style}
    >
      <div className="p-4 flex flex-col gap-3">
        {/* Signer dropdown */}
        <div>
          <label className="block text-[11px] font-medium text-gray-500 uppercase tracking-wider mb-1">Recipient</label>
          <select
            value={field.signerId ?? ''}
            onChange={(e) => onUpdate(field.id, { signerId: e.target.value || null })}
            className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
          >
            <option value="">Unassigned</option>
            {signers.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>

        {/* Required toggle */}
        <label className="flex items-center justify-between cursor-pointer group">
          <span className="text-sm text-gray-700">Required</span>
          <button
            type="button"
            role="switch"
            aria-checked={field.required}
            onClick={() => onUpdate(field.id, { required: !field.required })}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
              field.required ? 'bg-blue-600' : 'bg-gray-200'
            }`}
          >
            <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform ${
              field.required ? 'translate-x-[18px]' : 'translate-x-[3px]'
            }`} />
          </button>
        </label>

        {/* Label input for text fields */}
        {field.type === 'text' && (
          <div>
            <label className="block text-[11px] font-medium text-gray-500 uppercase tracking-wider mb-1">Label</label>
            <input
              value={field.label}
              onChange={(e) => onUpdate(field.id, { label: e.target.value })}
              className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
              placeholder="Field label"
            />
          </div>
        )}

        {/* Divider */}
        <div className="border-t border-gray-100" />

        {/* Delete */}
        <button
          onClick={() => { onDelete(field.id); onClose(); }}
          className="flex items-center gap-2 text-sm text-red-500 hover:text-red-600 transition-colors py-0.5"
        >
          <Trash2 className="w-3.5 h-3.5" />
          Delete field
        </button>
      </div>
    </div>,
    document.body,
  );
}

// ─── Main Component ─────────────────────────────────────────────────

export function PreparePage() {
  const { envelopeId } = useParams<{ envelopeId: string }>();
  const navigate = useNavigate();

  // Data
  const [subject, setSubject] = useState('');
  const [signers, setSigners] = useState<SignerInfo[]>([]);
  const [fields, setFields] = useState<PlacedField[]>([]);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  // UI state
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeSigner, setActiveSigner] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [toasts, setToasts] = useState<ToastData[]>([]);
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  // Popover state
  const [popover, setPopover] = useState<{ fieldId: string; x: number; y: number } | null>(null);

  // Add/edit signer modal
  const [showAddSigner, setShowAddSigner] = useState(false);
  const [showExitDialog, setShowExitDialog] = useState(false);
  const [newSignerName, setNewSignerName] = useState('');
  const [newSignerEmail, setNewSignerEmail] = useState('');
  // Edit signer
  const [editingSignerId, setEditingSignerId] = useState<string | null>(null);
  const [editSignerName, setEditSignerName] = useState('');
  const [editSignerEmail, setEditSignerEmail] = useState('');

  // Drag state from palette
  const dragInfo = useRef<typeof FIELD_PALETTE[number] | null>(null);
  const pageDims = useRef<{ w: number; h: number }>({ w: 612, h: 792 });

  // ── Toast helpers ─────────────────────────────────────────────────
  const showToast = useCallback((message: string, type: ToastData['type'] = 'info', accentColor?: string) => {
    const id = `toast-${Date.now()}`;
    setToasts((prev) => [...prev, { id, message, type, accentColor }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // ── Auth token (JWT or API key) ──────────────────────────────────
  const apiKey = useRef('');
  if (!apiKey.current) {
    // Priority: 1) JWT from login, 2) API key from URL, 3) API key from session
    const jwt = localStorage.getItem('sendsign_token');
    if (jwt) {
      apiKey.current = jwt;
    } else {
      const params = new URLSearchParams(window.location.search);
      const fromUrl = params.get('apiKey');
      if (fromUrl) {
        sessionStorage.setItem('coseal_api_key', fromUrl);
        apiKey.current = fromUrl;
      } else {
        apiKey.current = sessionStorage.getItem('coseal_api_key') || '';
      }
    }
  }
  const authHeaders = useCallback(() => ({ Authorization: `Bearer ${apiKey.current}` }), []);
  const pdfFetchHeaders = useMemo(() => ({ Authorization: `Bearer ${apiKey.current}` }), []);

  // ── Load envelope ─────────────────────────────────────────────────
  useEffect(() => {
    if (!envelopeId) return;
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(`/api/envelopes/${envelopeId}`, { headers: authHeaders() });
        const data = await res.json();
        if (!data.success) { setError(data.error || 'Failed to load envelope'); setLoading(false); return; }
        if (cancelled) return;

        setSubject(data.data.subject);
        const envSigners: SignerInfo[] = (data.data.signers ?? []).map((s: { id: string; name: string; email: string; role: string }, i: number) => ({
          ...s,
          colorIndex: i % SIGNER_COLORS.length,
        }));
        setSigners(envSigners);
        if (envSigners.length > 0) setActiveSigner(envSigners[0].id);

        setPdfUrl(`/api/envelopes/${envelopeId}/document`);

        // Load existing fields
        const fres = await fetch(`/api/envelopes/${envelopeId}/fields`, { headers: authHeaders() });
        const fdata = await fres.json();
        if (fdata.success && Array.isArray(fdata.data)) {
          const pw = pageDims.current.w;
          const ph = pageDims.current.h;
          setFields(fdata.data.map((f: Record<string, unknown>) => ({
            id: f.id as string,
            type: f.type as FieldType,
            signerId: (f.signerId as string) ?? null,
            page: (f.page as number) ?? 1,
            x: ((f.x as number) ?? 0) * pw / 100,
            y: ((f.y as number) ?? 0) * ph / 100,
            width: ((f.width as number) ?? 30) * pw / 100,
            height: ((f.height as number) ?? 5) * ph / 100,
            required: (f.required as boolean) ?? true,
            label: (f.anchorText as string) || (f.type as string) || 'Field',
          })));
        }
      } catch {
        if (!cancelled) setError('Unable to connect to the server');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [envelopeId, authHeaders]);

  // ── Keyboard shortcut ─────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA' || (e.target as HTMLElement).tagName === 'SELECT') return;
        setFields((prev) => prev.filter((f) => f.id !== selectedId));
        setSelectedId(null);
        setPopover(null);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedId]);

  // ── Drag handlers ─────────────────────────────────────────────────
  const handlePaletteDragStart = useCallback((item: typeof FIELD_PALETTE[number], e: React.DragEvent) => {
    dragInfo.current = item;
    // Set a transparent drag image so we control the ghost ourselves via CSS
    const ghost = document.createElement('div');
    ghost.style.opacity = '0';
    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, 0, 0);
    setTimeout(() => document.body.removeChild(ghost), 0);
  }, []);

  const handleDropOnPage = useCallback(
    (e: React.DragEvent, pageNumber: number, pageWidth: number, _pageHeight: number) => {
      e.preventDefault();
      setIsDraggingOver(false);
      if (!dragInfo.current || !activeSigner) return;

      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const scale = rect.width / pageWidth;
      const dropX = snap((e.clientX - rect.left) / scale);
      const dropY = snap((e.clientY - rect.top) / scale);

      const item = dragInfo.current;
      const newField: PlacedField = {
        id: nextId(),
        type: item.type,
        signerId: activeSigner,
        page: pageNumber,
        x: Math.max(0, dropX),
        y: Math.max(0, dropY),
        width: item.defaultW,
        height: item.defaultH,
        required: true,
        label: item.label,
      };

      setFields((prev) => [...prev, newField]);
      setSelectedId(newField.id);
      dragInfo.current = null;
    },
    [activeSigner],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setIsDraggingOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDraggingOver(false);
  }, []);

  // ── Field helpers ─────────────────────────────────────────────────
  const updateField = useCallback((id: string, updates: Partial<PlacedField>) => {
    setFields((prev) => prev.map((f) => f.id === id ? { ...f, ...updates } : f));
  }, []);

  const deleteField = useCallback((id: string) => {
    setFields((prev) => prev.filter((f) => f.id !== id));
    if (selectedId === id) setSelectedId(null);
    if (popover?.fieldId === id) setPopover(null);
  }, [selectedId, popover]);

  // ── Save Draft ────────────────────────────────────────────────────
  const fieldsToApi = useCallback(() => {
    const pw = pageDims.current.w;
    const ph = pageDims.current.h;
    return fields.map((f) => ({
      type: f.type,
      signerId: f.signerId,
      page: f.page,
      x: (f.x / pw) * 100,
      y: (f.y / ph) * 100,
      width: (f.width / pw) * 100,
      height: (f.height / ph) * 100,
      required: f.required,
      label: f.label,
    }));
  }, [fields]);

  const handleSaveDraft = async () => {
    if (!envelopeId) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/envelopes/${envelopeId}/fields`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ fields: fieldsToApi() }),
      });
      const data = await res.json();
      if (data.success) {
        showToast('Draft saved successfully', 'success');
      } else {
        showToast(data.error || 'Failed to save', 'error');
      }
    } catch {
      showToast('Unable to save draft', 'error');
    } finally {
      setSaving(false);
    }
  };

  // ── Send ──────────────────────────────────────────────────────────
  const readyToSend = useMemo(() => {
    if (signers.length === 0) return false;
    if (fields.length === 0) return false;
    const signersNeedingSig = signers.filter((s) => s.role === 'signer');
    const signersWithSig = new Set(fields.filter((f) => f.type === 'signature').map((f) => f.signerId));
    return signersNeedingSig.every((s) => signersWithSig.has(s.id));
  }, [fields, signers]);

  const handleSend = async () => {
    if (!envelopeId) return;

    // Validate at least one signer
    if (signers.length === 0) {
      showToast('Add at least one recipient before sending', 'error');
      return;
    }

    // Validation with toast
    const signersNeedingSig = signers.filter((s) => s.role === 'signer');
    const signersWithSig = new Set(fields.filter((f) => f.type === 'signature').map((f) => f.signerId));
    const missing = signersNeedingSig.filter((s) => !signersWithSig.has(s.id));
    if (missing.length > 0) {
      missing.forEach((s) => {
        const color = signerColorAt(s.colorIndex);
        showToast(`${s.name} needs at least one signature field`, 'error', color);
      });
      return;
    }

    setSending(true);
    try {
      await fetch(`/api/envelopes/${envelopeId}/fields`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ fields: fieldsToApi() }),
      });

      const res = await fetch(`/api/envelopes/${envelopeId}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
      });
      const data = await res.json();
      if (data.success) {
        showToast('Envelope sent! Redirecting to dashboard...', 'success');
        // Redirect to dashboard after a brief delay so the user sees the success toast
        setTimeout(() => navigate(`/dashboard`), 1500);
      } else {
        showToast(data.error || 'Failed to send', 'error');
      }
    } catch {
      showToast('Unable to send envelope', 'error');
    } finally {
      setSending(false);
    }
  };

  // ── Add Signer ────────────────────────────────────────────────────
  const handleAddSigner = async () => {
    if (!newSignerName.trim() || !newSignerEmail.trim() || !envelopeId) return;

    try {
      const res = await fetch(`/api/envelopes/${envelopeId}/signers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          name: newSignerName.trim(),
          email: newSignerEmail.trim(),
          role: 'signer',
        }),
      });

      const data = await res.json();
      if (!data.success) {
        showToast(data.error || 'Failed to add recipient', 'error');
        return;
      }

      // Add to local state with real database ID
      const newSigner: SignerInfo = {
        id: data.data.id,
        name: data.data.name,
        email: data.data.email,
        role: data.data.role,
        colorIndex: signers.length % SIGNER_COLORS.length,
      };
      setSigners((prev) => [...prev, newSigner]);
      setActiveSigner(newSigner.id);
      setShowAddSigner(false);
      setNewSignerName('');
      setNewSignerEmail('');
      showToast(`${newSigner.name} added as recipient`, 'success');
    } catch {
      showToast('Unable to add recipient', 'error');
    }
  };

  // ── Delete signer ──────────────────────────────────────────────────
  const handleDeleteSigner = async (signerId: string) => {
    if (signers.length <= 1) {
      showToast('Cannot remove the last recipient', 'error');
      return;
    }

    const signer = signers.find((s) => s.id === signerId);
    if (!signer) return;

    const fieldCount = fields.filter((f) => f.signerId === signerId).length;
    const confirmMsg = fieldCount > 0
      ? `Remove ${signer.name} and their ${fieldCount} field${fieldCount > 1 ? 's' : ''}?`
      : `Remove ${signer.name}?`;

    if (!confirm(confirmMsg)) return;

    try {
      const res = await fetch(`/api/envelopes/${envelopeId}/signers/${signerId}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      const data = await res.json();
      if (!data.success) {
        showToast(data.error || 'Failed to remove recipient', 'error');
        return;
      }

      // Remove from local state
      setSigners((prev) => prev.filter((s) => s.id !== signerId));
      setFields((prev) => prev.filter((f) => f.signerId !== signerId));
      if (activeSigner === signerId) {
        setActiveSigner(signers.find((s) => s.id !== signerId)?.id || null);
      }
      showToast(`${signer.name} removed`, 'success');
    } catch {
      showToast('Unable to remove recipient', 'error');
    }
  };

  // ── Edit signer ───────────────────────────────────────────────────
  const handleStartEditSigner = (signer: typeof signers[0]) => {
    setEditingSignerId(signer.id);
    setEditSignerName(signer.name);
    setEditSignerEmail(signer.email);
  };

  const handleSaveEditSigner = async () => {
    if (!editingSignerId || !editSignerName.trim() || !editSignerEmail.trim()) return;

    try {
      const res = await fetch(`/api/envelopes/${envelopeId}/signers/${editingSignerId}`, {
        method: 'PUT',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editSignerName.trim(), email: editSignerEmail.trim() }),
      });
      const data = await res.json();
      if (!data.success) {
        showToast(data.error || 'Failed to update recipient', 'error');
        return;
      }

      setSigners((prev) =>
        prev.map((s) =>
          s.id === editingSignerId
            ? { ...s, name: editSignerName.trim(), email: editSignerEmail.trim() }
            : s
        )
      );
      setEditingSignerId(null);
      showToast('Recipient updated', 'success');
    } catch {
      showToast('Unable to update recipient', 'error');
    }
  };

  // ── Helpers ───────────────────────────────────────────────────────
  const getSignerColor = (signerId: string | null) => {
    const signer = signers.find((s) => s.id === signerId);
    return signerColorAt(signer?.colorIndex ?? 0);
  };

  const popoverField = popover ? fields.find((f) => f.id === popover.fieldId) ?? null : null;

  // ── Loading / Error ───────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-gray-400">Loading document...</p>
        </div>
      </div>
    );
  }

  if (error && !fields.length && !pdfUrl) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white">
        <div className="text-center max-w-md">
          <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
            <X className="w-6 h-6 text-red-500" />
          </div>
          <h1 className="text-lg font-semibold text-gray-900 mb-2">Something went wrong</h1>
          <p className="text-sm text-gray-500">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-white">
      {/* Toasts */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      {/* ═══ TOP BAR ═══ */}
      <header className="h-16 bg-white border-b border-gray-100 flex items-center shrink-0 z-20 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        {/* Left: logo + back aligned with sidebar */}
        <div className="w-[200px] flex items-center gap-2 px-3 shrink-0">
          <button
            onClick={() => setShowExitDialog(true)}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-all shrink-0"
            title="Back to Dashboard"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <img 
            src="/sendsign-logo.svg" 
            alt="SendSign" 
            className="h-[30px] w-auto cursor-pointer"
            onClick={() => setShowExitDialog(true)}
          />
        </div>
        {/* Subject */}
        <div className="flex-1 flex items-center px-6 min-w-0">
          <span className="text-sm text-gray-700 truncate font-medium">{subject || 'Untitled Document'}</span>
        </div>

        {/* Center: field count */}
        <div className="hidden sm:flex items-center">
          <span className="text-xs text-gray-400 bg-gray-50 px-3 py-1 rounded-full">
            {fields.length} field{fields.length !== 1 ? 's' : ''} placed
          </span>
        </div>

        {/* Right: actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleSaveDraft}
            disabled={saving}
            className="px-3.5 py-1.5 text-[13px] font-medium border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 hover:border-gray-300 disabled:opacity-50 transition-all"
          >
            {saving ? 'Saving...' : 'Save Draft'}
          </button>
          <button
            onClick={handleSend}
            disabled={sending || fields.length === 0}
            className={`flex items-center gap-1.5 px-4 py-1.5 text-[13px] font-semibold text-white rounded-lg disabled:opacity-50 transition-all ${
              readyToSend
                ? 'bg-[#2563eb] hover:bg-blue-700 shadow-sm hover:shadow-md animate-send-pulse'
                : 'bg-[#2563eb] hover:bg-blue-700 shadow-sm hover:shadow-md'
            }`}
          >
            {sending ? 'Sending...' : 'Send'}
            {!sending && <ArrowRight className="w-3.5 h-3.5" />}
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* ═══ LEFT SIDEBAR (200px) ═══ */}
        <aside className="w-[200px] bg-[#f8f9fa] border-r border-gray-300 flex flex-col shrink-0 overflow-y-auto shadow-sm">
          {/* Field palette */}
          <div className="p-3 pb-2">
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-[0.08em] mb-2.5">Fields</p>
            <div className="grid grid-cols-2 gap-1.5">
              {FIELD_PALETTE.map((item, i) => {
                const Icon = item.icon;
                return (
                  <div
                    key={`${item.type}-${item.label}-${i}`}
                    draggable
                    onDragStart={(e) => handlePaletteDragStart(item, e)}
                    className="flex items-center gap-1.5 px-2 py-[7px] bg-white border border-gray-200/80 rounded-full cursor-grab
                      hover:border-gray-300 hover:shadow-sm active:cursor-grabbing select-none transition-all
                      active:shadow-md active:scale-[1.02]"
                  >
                    <Icon className="w-3.5 h-3.5 text-gray-400 shrink-0" strokeWidth={1.5} />
                    <span className="text-[11px] font-medium text-gray-600 truncate leading-none">{item.label}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Divider */}
          <div className="mx-3 border-t border-gray-200/60" />

          {/* Recipients */}
          <div className="p-3 flex-1 flex flex-col">
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-[0.08em] mb-2.5">Recipients</p>
            <div className="flex flex-col gap-1">
              {signers.map((s) => {
                const color = signerColorAt(s.colorIndex);
                const isActive = activeSigner === s.id;
                const fieldCount = fields.filter((f) => f.signerId === s.id).length;
                return (
                  <div
                    key={s.id}
                    className={`group flex items-center gap-2 px-2.5 py-2 rounded-lg text-left transition-all cursor-pointer ${
                      isActive
                        ? 'bg-white shadow-sm border border-gray-200'
                        : 'hover:bg-white/60 border border-transparent'
                    }`}
                    onClick={() => setActiveSigner(s.id)}
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: color }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-medium text-gray-800 truncate">{s.name}</p>
                      <p className="text-[10px] text-gray-400 truncate">{s.email}</p>
                    </div>
                    {/* Field count or warning */}
                    {fieldCount > 0 ? (
                      <span
                        className="text-[10px] font-semibold rounded-full px-1.5 py-0.5 leading-none"
                        style={{ backgroundColor: `${color}15`, color }}
                      >
                        {fieldCount}
                      </span>
                    ) : (
                      <span title="No fields assigned" className="text-amber-400">
                        <AlertTriangle className="w-3 h-3" />
                      </span>
                    )}
                    {/* Edit / Delete buttons (visible on hover) */}
                    <div className="hidden group-hover:flex items-center gap-0.5 shrink-0">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleStartEditSigner(s); }}
                        className="p-1 text-gray-300 hover:text-blue-500 rounded transition-colors"
                        title="Edit recipient"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDeleteSigner(s.id); }}
                        className="p-1 text-gray-300 hover:text-red-500 rounded transition-colors"
                        title="Remove recipient"
                      >
                        <UserMinus className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            {signers.length === 0 && (
              <p className="text-[11px] text-gray-400 mt-1">No recipients yet</p>
            )}
            <button
              onClick={() => setShowAddSigner(true)}
              className="flex items-center gap-1.5 mt-2 text-[12px] font-medium text-blue-600 hover:text-blue-700 transition-colors py-1"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Recipient
            </button>
          </div>
        </aside>

        {/* ═══ CENTER — PDF ═══ */}
        <div
          className="flex-1 overflow-hidden bg-[#f0f0f0]"
          onClick={() => { setSelectedId(null); setPopover(null); }}
        >
          {pdfUrl ? (
            <PDFViewer pdfUrl={pdfUrl} fetchHeaders={pdfFetchHeaders}>
              {(page) => {
                if (page.pageNumber === 1) {
                  pageDims.current = { w: page.width, h: page.height };
                }
                const pageFields = fields.filter((f) => f.page === page.pageNumber);
                return (
                  <div
                    className={`absolute inset-0 transition-all duration-150 ${
                      isDraggingOver ? 'ring-2 ring-blue-400/50 ring-inset' : ''
                    }`}
                    onDrop={(e) => handleDropOnPage(e, page.pageNumber, page.width, page.height)}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                  >
                    {/* Empty state */}
                    {fields.length === 0 && page.pageNumber === 1 && (
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div className="flex items-center gap-2 text-gray-300">
                          <ArrowLeft className="w-5 h-5" />
                          <span className="text-sm font-medium">Drag fields from the sidebar onto the document</span>
                        </div>
                      </div>
                    )}

                    {pageFields.map((f) => (
                      <PrepareField
                        key={f.id}
                        field={f}
                        color={getSignerColor(f.signerId)}
                        isSelected={f.id === selectedId}
                        pageWidth={page.width}
                        pageHeight={page.height}
                        onSelect={() => { setSelectedId(f.id); setPopover(null); }}
                        onMove={(x, y) => updateField(f.id, { x: snap(x), y: snap(y) })}
                        onResize={(w, h) => updateField(f.id, { width: snap(w), height: snap(h) })}
                        onDelete={() => deleteField(f.id)}
                        onContextMenu={(x, y) => { setSelectedId(f.id); setPopover({ fieldId: f.id, x, y }); }}
                        onDoubleClick={(x, y) => { setSelectedId(f.id); setPopover({ fieldId: f.id, x, y }); }}
                      />
                    ))}
                  </div>
                );
              }}
            </PDFViewer>
          ) : (
            <div className="flex items-center justify-center h-full text-gray-400">
              <p className="text-sm">No document uploaded for this envelope</p>
            </div>
          )}
        </div>
      </div>

      {/* ═══ Field Property Popover ═══ */}
      {popover && popoverField && (
        <FieldPopover
          field={popoverField}
          position={{ x: popover.x, y: popover.y }}
          signers={signers}
          onUpdate={updateField}
          onDelete={deleteField}
          onClose={() => setPopover(null)}
        />
      )}

      {/* ═══ Add Signer Modal ═══ */}
      {/* ═══ EXIT DIALOG ═══ */}
      {showExitDialog && createPortal(
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 animate-fade-in" onClick={() => setShowExitDialog(false)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full mx-4 p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-base font-semibold text-gray-900 mb-2">Leave document?</h2>
            <p className="text-sm text-gray-500 mb-5">Would you like to save your progress as a draft or discard your changes?</p>
            <div className="flex flex-col gap-2">
              <button
                onClick={async () => {
                  setShowExitDialog(false);
                  await handleSaveDraft();
                  navigate(`/dashboard`);
                }}
                className="flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-[#2563eb] text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-all"
              >
                <Save className="w-4 h-4" />
                Save as Draft
              </button>
              <button
                onClick={() => {
                  setShowExitDialog(false);
                  navigate(`/dashboard`);
                }}
                className="flex items-center justify-center gap-2 w-full px-4 py-2.5 border border-red-200 text-red-500 text-sm font-medium rounded-lg hover:bg-red-50 transition-all"
              >
                <FileX className="w-4 h-4" />
                Discard Changes
              </button>
              <button
                onClick={() => setShowExitDialog(false)}
                className="w-full px-4 py-2 text-gray-500 text-sm font-medium rounded-lg hover:bg-gray-50 transition-all"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {showAddSigner && createPortal(
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 animate-fade-in" onClick={() => { setShowAddSigner(false); setNewSignerName(''); setNewSignerEmail(''); }}>
          <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full mx-4 p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-base font-semibold text-gray-900 mb-4">Add Recipient</h2>
            <div className="flex flex-col gap-3">
              <div>
                <label className="block text-[11px] font-medium text-gray-500 uppercase tracking-wider mb-1">Name</label>
                <input
                  value={newSignerName}
                  onChange={(e) => setNewSignerName(e.target.value)}
                  placeholder="Full name"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-gray-500 uppercase tracking-wider mb-1">Email</label>
                <input
                  value={newSignerEmail}
                  onChange={(e) => setNewSignerEmail(e.target.value)}
                  placeholder="email@example.com"
                  type="email"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
                  onKeyDown={(e) => { if (e.key === 'Enter') handleAddSigner(); }}
                />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button
                onClick={() => { setShowAddSigner(false); setNewSignerName(''); setNewSignerEmail(''); }}
                className="flex-1 px-4 py-2 border border-gray-200 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-50 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleAddSigner}
                disabled={!newSignerName.trim() || !newSignerEmail.trim()}
                className="flex-1 px-4 py-2 bg-[#2563eb] text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-all"
              >
                Add
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {/* Edit Signer Modal */}
      {editingSignerId && createPortal(
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 animate-fade-in" onClick={() => setEditingSignerId(null)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full mx-4 p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-base font-semibold text-gray-900 mb-4">Edit Recipient</h2>
            <div className="flex flex-col gap-3">
              <div>
                <label className="block text-[11px] font-medium text-gray-500 uppercase tracking-wider mb-1">Name</label>
                <input
                  value={editSignerName}
                  onChange={(e) => setEditSignerName(e.target.value)}
                  placeholder="Full name"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-gray-500 uppercase tracking-wider mb-1">Email</label>
                <input
                  value={editSignerEmail}
                  onChange={(e) => setEditSignerEmail(e.target.value)}
                  placeholder="email@example.com"
                  type="email"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSaveEditSigner(); }}
                />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button
                onClick={() => setEditingSignerId(null)}
                className="flex-1 px-4 py-2 border border-gray-200 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-50 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEditSigner}
                disabled={!editSignerName.trim() || !editSignerEmail.trim()}
                className="flex-1 px-4 py-2 bg-[#2563eb] text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-all"
              >
                Save
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

// ─── Draggable + Resizable Field ────────────────────────────────────

interface PrepareFieldProps {
  field: PlacedField;
  color: string;
  isSelected: boolean;
  pageWidth: number;
  pageHeight: number;
  onSelect: () => void;
  onMove: (x: number, y: number) => void;
  onResize: (w: number, h: number) => void;
  onDelete: () => void;
  onContextMenu: (x: number, y: number) => void;
  onDoubleClick: (x: number, y: number) => void;
}

function PrepareField({ field, color, isSelected, pageWidth, pageHeight, onSelect, onMove, onResize, onDelete, onContextMenu, onDoubleClick }: PrepareFieldProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [isHovered, setIsHovered] = useState(false);

  const pctX = (field.x / pageWidth) * 100;
  const pctY = (field.y / pageHeight) * 100;
  const pctW = (field.width / pageWidth) * 100;
  const pctH = (field.height / pageHeight) * 100;

  // ── Drag to reposition ────────────────────────────────────────────
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).dataset.handle) return;
    e.preventDefault();
    e.stopPropagation();
    onSelect();

    const parent = ref.current?.parentElement;
    if (!parent) return;
    const parentRect = parent.getBoundingClientRect();
    const scale = parentRect.width / pageWidth;
    const startX = e.clientX;
    const startY = e.clientY;
    const origX = field.x;
    const origY = field.y;

    const move = (ev: MouseEvent) => {
      const dx = (ev.clientX - startX) / scale;
      const dy = (ev.clientY - startY) / scale;
      onMove(
        Math.max(0, Math.min(pageWidth - field.width, origX + dx)),
        Math.max(0, Math.min(pageHeight - field.height, origY + dy)),
      );
    };
    const up = () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  }, [field.x, field.y, field.width, field.height, pageWidth, pageHeight, onSelect, onMove]);

  // ── Resize from corner handles ────────────────────────────────────
  const handleCornerResize = useCallback((e: React.MouseEvent, corner: 'tl' | 'tr' | 'bl' | 'br') => {
    e.preventDefault();
    e.stopPropagation();

    const parent = ref.current?.parentElement;
    if (!parent) return;
    const parentRect = parent.getBoundingClientRect();
    const scale = parentRect.width / pageWidth;
    const startX = e.clientX;
    const startY = e.clientY;
    const origW = field.width;
    const origH = field.height;
    const origX = field.x;
    const origY = field.y;

    const move = (ev: MouseEvent) => {
      const dx = (ev.clientX - startX) / scale;
      const dy = (ev.clientY - startY) / scale;

      let newW = origW;
      let newH = origH;
      let newX = origX;
      let newY = origY;

      if (corner === 'br') { newW = Math.max(20, origW + dx); newH = Math.max(15, origH + dy); }
      else if (corner === 'bl') { newW = Math.max(20, origW - dx); newH = Math.max(15, origH + dy); newX = origX + (origW - newW); }
      else if (corner === 'tr') { newW = Math.max(20, origW + dx); newH = Math.max(15, origH - dy); newY = origY + (origH - newH); }
      else if (corner === 'tl') { newW = Math.max(20, origW - dx); newH = Math.max(15, origH - dy); newX = origX + (origW - newW); newY = origY + (origH - newH); }

      onResize(newW, newH);
      onMove(newX, newY);
    };
    const up = () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  }, [field.x, field.y, field.width, field.height, pageWidth, onResize, onMove]);

  const handleContextMenuEvent = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onContextMenu(e.clientX, e.clientY);
  }, [onContextMenu]);

  const handleDoubleClickEvent = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onDoubleClick(e.clientX, e.clientY);
  }, [onDoubleClick]);

  return (
    <div
      ref={ref}
      onMouseDown={handleMouseDown}
      onClick={(e) => { e.stopPropagation(); onSelect(); }}
      onContextMenu={handleContextMenuEvent}
      onDoubleClick={handleDoubleClickEvent}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`absolute rounded-[6px] cursor-move select-none transition-all duration-100 animate-field-in ${
        isSelected ? 'z-20 shadow-md' : isHovered ? 'z-15 shadow-sm' : 'z-10'
      }`}
      style={{
        left: `${pctX}%`,
        top: `${pctY}%`,
        width: `${pctW}%`,
        height: `${pctH}%`,
        border: isSelected ? `2px solid ${color}` : `1.5px solid ${color}`,
        backgroundColor: isSelected ? `${color}18` : `${color}14`,
      }}
    >
      {/* Signer color dot */}
      <span
        className="absolute top-1 left-1 w-2 h-2 rounded-full pointer-events-none"
        style={{ backgroundColor: color }}
      />

      {/* Field label */}
      <span
        className="absolute inset-0 flex items-center justify-center text-[12px] font-medium pointer-events-none truncate px-4"
        style={{ color }}
      >
        {field.label}
      </span>

      {/* Delete button on hover */}
      {(isHovered || isSelected) && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="absolute -top-1.5 -right-1.5 w-[18px] h-[18px] bg-white border border-gray-200 rounded-full flex items-center justify-center
            hover:bg-red-50 hover:border-red-300 transition-all z-30 shadow-sm"
        >
          <X className="w-2.5 h-2.5 text-gray-400 hover:text-red-500" />
        </button>
      )}

      {/* Corner resize handles (selected only) */}
      {isSelected && (
        <>
          <div data-handle="resize" onMouseDown={(e) => handleCornerResize(e, 'tl')}
            className="absolute -top-1 -left-1 w-2 h-2 bg-white border border-gray-300 rounded-[2px] cursor-nw-resize z-30" />
          <div data-handle="resize" onMouseDown={(e) => handleCornerResize(e, 'tr')}
            className="absolute -top-1 -right-1 w-2 h-2 bg-white border border-gray-300 rounded-[2px] cursor-ne-resize z-30" />
          <div data-handle="resize" onMouseDown={(e) => handleCornerResize(e, 'bl')}
            className="absolute -bottom-1 -left-1 w-2 h-2 bg-white border border-gray-300 rounded-[2px] cursor-sw-resize z-30" />
          <div data-handle="resize" onMouseDown={(e) => handleCornerResize(e, 'br')}
            className="absolute -bottom-1 -right-1 w-2 h-2 bg-white border border-gray-300 rounded-[2px] cursor-se-resize z-30" />
        </>
      )}
    </div>
  );
}
