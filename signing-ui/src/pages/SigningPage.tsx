import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { MessageSquare } from 'lucide-react';
import { PDFViewer } from '../components/PDFViewer';
import { FieldOverlay } from '../components/FieldOverlay';
import { CoSealBranding } from '../components/CoSealBranding';
import { CommentPanel } from '../components/CommentPanel';
import { ConsentModal } from '../components/ConsentModal';
import { useFieldState } from '../hooks/useFieldLogic';
import type { SigningSessionData, FieldData } from '../types/index';

function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  return isMobile;
}

export function SigningPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [session, setSession] = useState<SigningSessionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showFieldNav, setShowFieldNav] = useState(false);
  const [showDelegateModal, setShowDelegateModal] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [commentFilterField, setCommentFilterField] = useState<string | null>(null);
  const [delegateEmail, setDelegateEmail] = useState('');
  const [delegateName, setDelegateName] = useState('');
  const [delegating, setDelegating] = useState(false);
  const [hasConsented, setHasConsented] = useState(false);
  const [showConsentModal, setShowConsentModal] = useState(false);
  const isMobile = useIsMobile();

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/sign/${token}`);
        const data = await res.json();

        if (!data.success) {
          if (res.status === 401) {
            navigate(`/expired?reason=${encodeURIComponent(data.error || 'expired')}`);
            return;
          }
          setError(data.error || 'Failed to load signing session');
          return;
        }

        setSession(data.data);
        // Show consent modal after successful load
        setShowConsentModal(true);
      } catch {
        setError('Unable to connect to the server');
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [token, navigate]);

  const fieldState = useFieldState(session?.fields ?? []);

  // Create stable onChange callbacks for each field to prevent modal flashing
  const fieldOnChangeHandlers = useMemo(() => {
    const handlers: Record<string, (value: string) => void> = {};
    if (!session) return handlers;
    for (const field of session.fields) {
      handlers[field.id] = (v: string) => fieldState.setValue(field.id, v);
    }
    return handlers;
  }, [session, fieldState.setValue]);

  const handleFinish = async () => {
    if (!session || !fieldState.allRequiredComplete) return;

    setSubmitting(true);
    try {
      const res = await fetch(`/api/sign/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: Object.entries(fieldState.values).map(([fieldId, value]) => ({
            fieldId,
            value,
          })),
        }),
      });

      const data = await res.json();
      if (data.success) {
        // Pass envelope ID to completion page for download links
        navigate(`/complete?envelopeId=${session.envelope.id}&token=${token}`);
      } else {
        setError(data.error || 'Failed to submit signature');
      }
    } catch {
      setError('Unable to submit. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelegate = async () => {
    if (!delegateEmail || !delegateName || !token) return;

    setDelegating(true);
    try {
      const res = await fetch(`/api/sign/${token}/delegate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          delegateEmail,
          delegateName,
        }),
      });

      const data = await res.json();
      if (data.success) {
        navigate(`/delegated?to=${encodeURIComponent(delegateName)}`);
      } else {
        setError(data.error || 'Failed to delegate signing');
      }
    } catch {
      setError('Unable to delegate. Please try again.');
    } finally {
      setDelegating(false);
    }
  };

  const handleConsentAccept = async () => {
    if (!token) return;

    try {
      // Record consent with the backend
      await fetch(`/api/sign/${token}/consent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          consentedAt: new Date().toISOString(),
          userAgent: navigator.userAgent,
        }),
      });

      setHasConsented(true);
      setShowConsentModal(false);
    } catch (err) {
      console.error('Failed to record consent:', err);
      // Still allow them to proceed even if the consent recording fails
      setHasConsented(true);
      setShowConsentModal(false);
    }
  };

  const handleConsentDecline = () => {
    navigate('/expired?reason=consent_declined');
  };

  // Navigate to a specific field
  const scrollToField = useCallback((field: FieldData) => {
    const el = document.querySelector(`[data-field-id="${field.id}"]`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // Highlight briefly
      el.classList.add('ring-2', 'ring-blue-500');
      setTimeout(() => el.classList.remove('ring-2', 'ring-blue-500'), 2000);
    }
    setShowFieldNav(false);
  }, []);

  // Get next incomplete required field
  const getNextIncompleteField = useCallback((): FieldData | null => {
    if (!session) return null;
    return session.fields.find((f) =>
      fieldState.required[f.id] && !fieldState.completed[f.id]
    ) ?? null;
  }, [session, fieldState]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto" />
          <p className="mt-4 text-gray-600">Loading document...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen px-4">
        <div className="text-center max-w-md">
          <div className="text-red-500 text-5xl mb-4">!</div>
          <h1 className="text-xl font-semibold text-gray-900 mb-2">Something went wrong</h1>
          <p className="text-gray-600">{error}</p>
        </div>
      </div>
    );
  }

  if (!session) return null;

  const nextField = getNextIncompleteField();
  const requiredFields = session.fields.filter((f) => fieldState.required[f.id]);

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 sm:px-5 py-4 flex items-center gap-4 sm:gap-5 shrink-0 safe-area-top">
        {/* Logo */}
        <img 
          src="/sendsign-logo.svg" 
          alt="SendSign" 
            className="h-12 sm:h-14 w-auto shrink-0"
        />

        <div className="min-w-0 flex-1 mr-3">
          <h1 className="text-sm sm:text-lg font-semibold text-gray-900 truncate">{session.envelope.subject}</h1>
          <p className="text-xs sm:text-sm text-gray-500 truncate">
            Signing as <span className="font-medium">{session.signer.name}</span>
          </p>
        </div>
        <div className="flex items-center gap-2 sm:gap-4 shrink-0">
          {/* Progress - visible on all sizes */}
          <div className="flex flex-col items-end gap-1">
            <div className="flex items-center gap-2">
              <div className="w-16 sm:w-32 h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-600 transition-all duration-300 rounded-full"
                  style={{ width: `${fieldState.requiredCount > 0 ? (fieldState.requiredCompleted / fieldState.requiredCount) * 100 : 0}%` }}
                />
              </div>
              <span className="text-xs sm:text-sm text-gray-600 whitespace-nowrap">
                {fieldState.requiredCompleted}/{fieldState.requiredCount}
              </span>
            </div>
            <p className="text-[10px] sm:text-xs text-gray-400">
              Field {fieldState.requiredCompleted} of {fieldState.requiredCount} completed
            </p>
          </div>

          {/* Comments button */}
          <button
            onClick={() => { setCommentFilterField(null); setShowComments(!showComments); }}
            className="relative p-2 text-gray-500 hover:text-blue-600 rounded-md hover:bg-gray-100"
            aria-label="Toggle comments"
            title="Comments"
          >
            <MessageSquare className="w-5 h-5" />
          </button>

          <button
            onClick={handleFinish}
            disabled={!fieldState.allRequiredComplete || submitting}
            className="btn-primary text-xs sm:text-sm px-4 sm:px-8 py-2.5 sm:py-3.5 font-semibold shadow-lg hover:shadow-xl transition-all disabled:shadow-none"
            aria-label="Finish signing"
          >
            {submitting ? 'Submitting...' : 'Finish Signing'}
          </button>
        </div>
      </header>

      {/* Message banner */}
      {session.envelope.message && (
        <div className="bg-blue-50 px-3 sm:px-4 py-2 text-xs sm:text-sm text-blue-800 border-b border-blue-100">
          {session.envelope.message}
        </div>
      )}

      {/* Delegation banner - only show if no fields have been filled */}
      {fieldState.requiredCompleted === 0 && (
        <div className="bg-gray-50 px-3 sm:px-4 py-2 text-xs sm:text-sm text-gray-700 border-b border-gray-200 flex items-center justify-between">
          <span>Can't sign right now?</span>
          <button
            onClick={() => setShowDelegateModal(true)}
            className="text-blue-600 hover:text-blue-700 font-medium underline"
          >
            Delegate to someone else
          </button>
        </div>
      )}

      {/* Delegation Modal */}
      {showDelegateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Delegate Signing</h2>
            <p className="text-sm text-gray-600 mb-4">
              Transfer signing responsibility to another person. They'll receive a new signing link via email.
            </p>

            <div className="space-y-4">
              <div>
                <label htmlFor="delegateName" className="block text-sm font-medium text-gray-700 mb-1">
                  Delegate's Name
                </label>
                <input
                  id="delegateName"
                  type="text"
                  value={delegateName}
                  onChange={(e) => setDelegateName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="John Doe"
                />
              </div>

              <div>
                <label htmlFor="delegateEmail" className="block text-sm font-medium text-gray-700 mb-1">
                  Delegate's Email
                </label>
                <input
                  id="delegateEmail"
                  type="email"
                  value={delegateEmail}
                  onChange={(e) => setDelegateEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="john@example.com"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowDelegateModal(false)}
                disabled={delegating}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDelegate}
                disabled={!delegateEmail || !delegateName || delegating}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {delegating ? 'Delegating...' : 'Delegate'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PDF viewer with field overlays */}
      <div className="flex-1 overflow-hidden">
        <PDFViewer pdfUrl={`/api/signing/${token}/document`}>
          {(page) => (
            <>
              {session.fields
                .filter((f) => f.page === page.pageNumber && fieldState.visibility[f.id])
                .map((field) => (
                  <FieldOverlay
                    key={field.id}
                    field={field}
                    value={fieldState.values[field.id] ?? ''}
                    onChange={fieldOnChangeHandlers[field.id]}
                    visible={fieldState.visibility[field.id]}
                    required={fieldState.required[field.id]}
                    completed={fieldState.completed[field.id]}
                    errors={fieldState.errors[field.id] ?? []}
                    pageWidth={page.width}
                    pageHeight={page.height}
                    scale={1}
                  />
                ))}
            </>
          )}
        </PDFViewer>
      </div>

      {/* Mobile bottom bar with "Next field" button and field navigator */}
      {isMobile && (
        <div className="bg-white border-t border-gray-200 safe-area-bottom">
          <div className="flex items-center gap-2 px-3 py-2">
            {/* Next field button */}
            {nextField ? (
              <button
                onClick={() => scrollToField(nextField)}
                className="flex-1 flex items-center justify-center gap-2 py-3 bg-blue-600 text-white rounded-lg font-medium active:bg-blue-700"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                </svg>
                Next: {getFieldLabel(nextField)}
              </button>
            ) : (
              <button
                onClick={handleFinish}
                disabled={!fieldState.allRequiredComplete || submitting}
                className="flex-1 py-3 bg-green-600 text-white rounded-lg font-medium disabled:bg-gray-300 active:bg-green-700"
              >
                {submitting ? 'Submitting...' : 'All done — Finish'}
              </button>
            )}

            {/* Field list toggle */}
            <button
              onClick={() => setShowFieldNav(!showFieldNav)}
              className="p-3 rounded-lg border border-gray-300 text-gray-600 active:bg-gray-100"
              aria-label="Toggle field list"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          </div>

          {/* Bottom-sheet field navigator */}
          {showFieldNav && (
            <div className="border-t border-gray-200 max-h-64 overflow-auto">
              <div className="px-3 py-2 bg-gray-50 border-b border-gray-200">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Fields to complete</p>
              </div>
              {requiredFields.map((field) => {
                const completed = fieldState.completed[field.id];
                return (
                  <button
                    key={field.id}
                    onClick={() => scrollToField(field)}
                    className="w-full flex items-center gap-3 px-3 py-3 border-b border-gray-100 text-left active:bg-gray-50"
                  >
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
                      completed ? 'bg-green-100 text-green-600' : 'bg-blue-100 text-blue-600'
                    }`}>
                      {completed ? (
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        <span className="text-xs font-bold">{field.page}</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium ${completed ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                        {getFieldLabel(field)}
                      </p>
                      <p className="text-xs text-gray-400">Page {field.page}</p>
                    </div>
                    <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      <CoSealBranding />

      {/* Comment Panel */}
      {token && (
        <CommentPanel
          token={token}
          isOpen={showComments}
          onClose={() => setShowComments(false)}
          filterFieldId={commentFilterField}
        />
      )}

      {/* Consent Modal */}
      {showConsentModal && !hasConsented && (
        <ConsentModal
          onAccept={handleConsentAccept}
          onDecline={handleConsentDecline}
        />
      )}
    </div>
  );
}

function getFieldLabel(field: FieldData): string {
  if (field.label) return field.label;
  switch (field.type) {
    case 'signature': return 'Signature';
    case 'initial': return 'Initials';
    case 'date': return 'Date';
    case 'text': return 'Text';
    case 'checkbox': return 'Checkbox';
    case 'radio': return 'Selection';
    case 'dropdown': return 'Dropdown';
    case 'number': return 'Number';
    case 'currency': return 'Amount';
    case 'attachment': return 'Attachment';
    default: return 'Field';
  }
}
