import { useEffect, useRef, useState, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';

// Use the local worker bundled with pdfjs-dist instead of a CDN URL.
// The ?url suffix tells Vite to emit the file and return its public URL.
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

interface PDFViewerProps {
  pdfUrl: string;
  /** Optional headers to include when fetching the PDF (e.g. Authorization). */
  fetchHeaders?: Record<string, string>;
  children?: (pageInfo: { pageNumber: number; width: number; height: number }) => React.ReactNode;
  activeDocument?: number;
  documentCount?: number;
  onDocumentChange?: (index: number) => void;
}

interface PageRendered {
  pageNumber: number;
  width: number;
  height: number;
}

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

export function PDFViewer({ pdfUrl, fetchHeaders, children, activeDocument, documentCount, onDocumentChange }: PDFViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pages, setPages] = useState<PageRendered[]>([]);
  // Base scale is 1.5x (displayed as 100%). Range: 1.125x (75%) to 3.0x (200%)
  const [scale, setScale] = useState(1.5);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const canvasRefs = useRef<Map<number, HTMLCanvasElement>>(new Map());
  const isMobile = useIsMobile();
  
  // Convert actual scale to display percentage (1.5 = 100%)
  const displayPercent = Math.round((scale / 1.5) * 100);

  // Store the parsed PDF document so we can re-render pages when scale
  // changes without re-fetching from the server.
  const pdfDocRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);

  // Touch gesture state for pinch-to-zoom
  const touchState = useRef<{
    initialDistance: number | null;
    initialScale: number;
  }>({ initialDistance: null, initialScale: 1 });

  // Auto-fit scale on mobile
  useEffect(() => {
    if (isMobile && containerRef.current) {
      const containerWidth = containerRef.current.clientWidth - 16; // padding
      if (pages.length > 0) {
        const pageWidth = pages[0].width;
        const fitScale = containerWidth / pageWidth;
        // Cap at 150% display (2.25x actual) for mobile auto-fit
        setScale(Math.min(fitScale, 2.25));
      }
    }
  }, [isMobile, pages]);

  // Track scroll position to determine current page
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !isMobile) return;

    const handleScroll = () => {
      const children = container.querySelectorAll('[data-page-number]');
      let closestPage = 1;
      let closestDistance = Infinity;

      children.forEach((child) => {
        const rect = child.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        const distance = Math.abs(rect.top - containerRect.top);
        if (distance < closestDistance) {
          closestDistance = distance;
          closestPage = parseInt(child.getAttribute('data-page-number') ?? '1', 10);
        }
      });

      setCurrentPage(closestPage);
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [isMobile, pages]);

  // Pinch-to-zoom handling
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      touchState.current.initialDistance = Math.sqrt(dx * dx + dy * dy);
      touchState.current.initialScale = scale;
    }
  }, [scale]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2 && touchState.current.initialDistance !== null) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const currentDistance = Math.sqrt(dx * dx + dy * dy);
      const ratio = currentDistance / touchState.current.initialDistance;
      const newScale = Math.max(1.125, Math.min(3.0, touchState.current.initialScale * ratio));
      setScale(newScale);
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    touchState.current.initialDistance = null;
  }, []);

  // ── Effect 1: Load and parse the PDF (only when URL changes) ──────
  useEffect(() => {
    let cancelled = false;

    async function loadPdf() {
      try {
        setLoading(true);
        setError(null);
        setPages([]);
        pdfDocRef.current = null;

        // Pre-flight fetch to check for server-side errors
        // (e.g. 422 "PDF conversion required") before handing to pdf.js
        const response = await fetch(pdfUrl, fetchHeaders ? { headers: fetchHeaders } : undefined);
        if (!response.ok) {
          const contentType = response.headers.get('content-type') || '';
          if (contentType.includes('application/json')) {
            const errData = await response.json();
            if (errData.error === 'PDF conversion required') {
              setError(
                'This document was uploaded in a non-PDF format and could not be converted automatically. ' +
                'Please ask the sender to re-upload it as a PDF, or install LibreOffice on the server.',
              );
              setLoading(false);
              return;
            }
            setError(errData.error || errData.detail || 'Failed to load document');
          } else {
            setError(`Failed to load PDF (HTTP ${response.status})`);
          }
          setLoading(false);
          return;
        }

        // Convert response to ArrayBuffer and hand to pdf.js
        const pdfData = new Uint8Array(await response.arrayBuffer());
        const loadingTask = pdfjsLib.getDocument({ data: pdfData });
        const pdf = await loadingTask.promise;

        if (cancelled) return;

        pdfDocRef.current = pdf;

        // Extract page dimensions at scale=1
        const pageInfos: PageRendered[] = [];
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const viewport = page.getViewport({ scale: 1.0 });
          pageInfos.push({ pageNumber: i, width: viewport.width, height: viewport.height });
        }

        if (cancelled) return;

        // Setting pages triggers a re-render which creates the canvas
        // elements. Effect 2 (below) handles the actual rendering.
        setPages(pageInfos);
        setLoading(false);
      } catch (err) {
        if (!cancelled) {
          console.error('[PDFViewer] Failed to load PDF:', err);
          setError('Failed to load PDF');
          setLoading(false);
        }
      }
    }

    loadPdf();
    return () => { cancelled = true; };
  }, [pdfUrl, fetchHeaders]);

  // ── Effect 2: Render pages to canvases (when pages load or scale changes) ──
  useEffect(() => {
    if (pages.length === 0 || !pdfDocRef.current) return;

    let cancelled = false;
    const pdf = pdfDocRef.current;

    async function renderPages() {
      for (let i = 1; i <= pdf.numPages; i++) {
        if (cancelled) return;

        const canvas = canvasRefs.current.get(i);
        if (!canvas) continue;

        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale });

        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) continue;

        await page.render({ canvasContext: ctx, viewport } as Parameters<typeof page.render>[0]).promise;
      }
    }

    renderPages();
    return () => { cancelled = true; };
  }, [pages, scale]);

  // Navigate to page (mobile)
  const scrollToPage = (pageNumber: number) => {
    const container = containerRef.current;
    if (!container) return;
    const pageEl = container.querySelector(`[data-page-number="${pageNumber}"]`);
    if (pageEl) {
      pageEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 sm:px-4 py-2 bg-white border-b border-gray-200 shrink-0">
        <div className="flex items-center gap-2">
          {documentCount && documentCount > 1 && (
            <div className="flex gap-1 mr-2 sm:mr-4">
              {Array.from({ length: documentCount }, (_, i) => (
                <button
                  key={i}
                  onClick={() => onDocumentChange?.(i)}
                  className={`px-2 sm:px-3 py-1 text-xs rounded-full transition-colors ${
                    (activeDocument ?? 0) === i
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                  aria-label={`Document ${i + 1}`}
                >
                  Doc {i + 1}
                </button>
              ))}
            </div>
          )}

          {/* Page indicator (mobile) */}
          {isMobile && pages.length > 1 ? (
            <span className="text-xs text-gray-500">
              Page {currentPage} of {pages.length}
            </span>
          ) : (
            <span className="text-sm text-gray-500">
              {pages.length > 0 ? `${pages.length} page${pages.length > 1 ? 's' : ''}` : ''}
            </span>
          )}
        </div>

        {/* Zoom controls */}
        <div className="flex items-center gap-1 sm:gap-2">
          <button
            onClick={() => setScale((s) => Math.max(1.125, s - 0.375))}
            className="p-1.5 sm:p-1 rounded hover:bg-gray-100 text-gray-600 active:bg-gray-200"
            aria-label="Zoom out"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" /></svg>
          </button>
          <span className="text-xs sm:text-sm text-gray-600 min-w-[2.5rem] sm:min-w-[3rem] text-center">{displayPercent}%</span>
          <button
            onClick={() => setScale((s) => Math.min(3.0, s + 0.375))}
            className="p-1.5 sm:p-1 rounded hover:bg-gray-100 text-gray-600 active:bg-gray-200"
            aria-label="Zoom in"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          </button>

          {/* Fit to width button (mobile) */}
          {isMobile && (
            <button
              onClick={() => {
                if (containerRef.current && pages.length > 0) {
                  const containerWidth = containerRef.current.clientWidth - 16;
                  setScale(containerWidth / pages[0].width);
                }
              }}
              className="p-1.5 rounded hover:bg-gray-100 text-gray-600 active:bg-gray-200 ml-1"
              aria-label="Fit to width"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* PDF pages */}
      <div
        ref={containerRef}
        className={`flex-1 overflow-auto bg-gray-100 ${isMobile ? 'p-2' : 'p-4'}`}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {loading && (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
          </div>
        )}

        {error && (
          <div className="text-center text-red-600 py-8">
            <p className="text-lg font-medium">{error}</p>
            <p className="text-sm text-gray-500 mt-1">Please try refreshing the page.</p>
          </div>
        )}

        {pages.map((page) => (
          <div
            key={page.pageNumber}
            data-page-number={page.pageNumber}
            className={`relative mx-auto ${isMobile ? 'mb-2' : 'mb-4'} shadow-lg bg-white`}
            style={{ width: page.width * scale, height: page.height * scale }}
          >
            <canvas
              ref={(el) => { if (el) canvasRefs.current.set(page.pageNumber, el); }}
              className="block"
            />
            {/* Field overlays */}
            {children?.(page)}
          </div>
        ))}
      </div>

      {/* Mobile page navigation dots */}
      {isMobile && pages.length > 1 && (
        <div className="flex items-center justify-center gap-2 py-2 bg-white border-t border-gray-200 safe-area-bottom">
          {pages.map((page) => (
            <button
              key={page.pageNumber}
              onClick={() => scrollToPage(page.pageNumber)}
              className={`w-2.5 h-2.5 rounded-full transition-colors ${
                currentPage === page.pageNumber ? 'bg-blue-600' : 'bg-gray-300'
              }`}
              aria-label={`Go to page ${page.pageNumber}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
