import { useState, useRef, useCallback, useEffect } from 'react';

interface SignaturePadProps {
  onApply: (dataUrl: string) => void;
  onCancel: () => void;
}

type TabMode = 'draw' | 'type' | 'upload';

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

export function SignaturePad({ onApply, onCancel }: SignaturePadProps) {
  const [mode, setMode] = useState<TabMode>('draw');
  const [typedName, setTypedName] = useState('');
  const [preview, setPreview] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawing = useRef(false);
  const lastPoint = useRef<{ x: number; y: number } | null>(null);
  const isMobile = useIsMobile();

  // Resize canvas to fill container on mobile
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;

      const rect = parent.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;

      // On mobile, use full width; on desktop, fixed size
      const w = isMobile ? rect.width : 440;
      const h = isMobile ? Math.max(180, rect.height) : 140;

      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;

      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.scale(dpr, dpr);
      }
    };

    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [isMobile, mode]);

  // --- Draw mode ---
  const getPos = useCallback((e: React.MouseEvent | React.TouchEvent): { x: number; y: number } => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    if ('touches' in e) {
      const touch = e.touches[0];
      if (!touch) return { x: 0, y: 0 };
      return { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
    }
    return { x: (e as React.MouseEvent).clientX - rect.left, y: (e as React.MouseEvent).clientY - rect.top };
  }, []);

  const startDraw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    isDrawing.current = true;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const pos = getPos(e);
    lastPoint.current = pos;
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  }, [getPos]);

  const draw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if (!isDrawing.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const pos = getPos(e);

    // Smooth drawing with quadratic curves
    if (lastPoint.current) {
      const midX = (lastPoint.current.x + pos.x) / 2;
      const midY = (lastPoint.current.y + pos.y) / 2;
      ctx.quadraticCurveTo(lastPoint.current.x, lastPoint.current.y, midX, midY);
    } else {
      ctx.lineTo(pos.x, pos.y);
    }

    // Thicker line on mobile for finger drawing
    ctx.lineWidth = isMobile ? 3 : 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#1a1a1a';
    ctx.stroke();

    lastPoint.current = pos;
  }, [getPos, isMobile]);

  const endDraw = useCallback(() => {
    isDrawing.current = false;
    lastPoint.current = null;
  }, []);

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const dpr = window.devicePixelRatio || 1;
      ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
    }
    setPreview(null);
  };

  // --- Type mode ---
  const typePreviewCanvas = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 100;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 400, 100);
    ctx.font = 'italic 36px "Georgia", "Times New Roman", serif';
    ctx.fillStyle = '#1a1a1a';
    ctx.textBaseline = 'middle';
    ctx.fillText(typedName, 20, 50);
    return canvas.toDataURL('image/png');
  };

  // --- Upload mode ---
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setPreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleApply = () => {
    if (mode === 'draw') {
      const canvas = canvasRef.current;
      if (canvas) onApply(canvas.toDataURL('image/png'));
    } else if (mode === 'type') {
      onApply(typePreviewCanvas());
    } else if (mode === 'upload' && preview) {
      onApply(preview);
    }
  };

  // On mobile, use full-screen modal
  const containerClass = isMobile
    ? 'fixed inset-0 bg-white z-50 flex flex-col safe-area-inset'
    : 'fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4';

  const panelClass = isMobile
    ? 'flex flex-col flex-1'
    : 'bg-white rounded-2xl shadow-2xl w-full max-w-lg';

  return (
    <div className={containerClass} role="dialog" aria-label="Signature pad">
      <div className={panelClass}>
        {/* Header */}
        <div className={`p-4 sm:p-6 ${isMobile ? 'border-b border-gray-200' : ''}`}>
          <div className="flex items-center justify-between">
            <h2 className="text-lg sm:text-xl font-semibold text-gray-900">Add Your Signature</h2>
            {isMobile && (
              <button
                onClick={onCancel}
                className="p-2 -mr-2 text-gray-400 hover:text-gray-600"
                aria-label="Close"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>

          {/* Tabs */}
          <div className="flex border-b border-gray-200 mt-3" role="tablist">
            {(['draw', 'type', 'upload'] as TabMode[]).map((t) => (
              <button
                key={t}
                role="tab"
                aria-selected={mode === t}
                className={`flex-1 py-3 text-sm font-medium transition-colors ${
                  mode === t ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'
                }`}
                onClick={() => setMode(t)}
              >
                {t === 'draw' ? 'Draw' : t === 'type' ? 'Type' : 'Upload'}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className={`flex-1 p-4 sm:p-6 ${isMobile ? 'overflow-auto' : ''}`}>
          {mode === 'draw' && (
            <div className={`flex flex-col ${isMobile ? 'flex-1' : ''}`}>
              <div className={`relative ${isMobile ? 'flex-1 min-h-[200px]' : ''}`}>
                <canvas
                  ref={canvasRef}
                  className="w-full border border-gray-300 rounded-lg cursor-crosshair bg-white touch-none"
                  onMouseDown={startDraw}
                  onMouseMove={draw}
                  onMouseUp={endDraw}
                  onMouseLeave={endDraw}
                  onTouchStart={startDraw}
                  onTouchMove={draw}
                  onTouchEnd={endDraw}
                  aria-label="Signature drawing area"
                />
                {/* Guide text */}
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                  <p className="text-gray-300 text-lg select-none">Sign here</p>
                </div>
              </div>
              <button onClick={clearCanvas} className="mt-3 text-sm text-gray-500 hover:text-gray-700 py-2">
                Clear
              </button>
            </div>
          )}

          {mode === 'type' && (
            <div>
              <input
                type="text"
                className="input-field text-xl sm:text-2xl italic py-3"
                style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}
                placeholder="Type your name"
                value={typedName}
                onChange={(e) => setTypedName(e.target.value)}
                aria-label="Type your signature"
                autoFocus
              />
              {typedName && (
                <div className="mt-4 p-4 border border-gray-200 rounded-lg bg-gray-50">
                  <p className="text-xs text-gray-400 mb-1">Preview:</p>
                  <p className="text-2xl sm:text-3xl italic" style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}>
                    {typedName}
                  </p>
                </div>
              )}
            </div>
          )}

          {mode === 'upload' && (
            <div>
              <label className="block w-full border-2 border-dashed border-gray-300 rounded-lg p-6 sm:p-8 text-center cursor-pointer hover:border-blue-500 active:border-blue-600 transition-colors">
                <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFileUpload} aria-label="Upload signature image" />
                <svg className="w-10 h-10 mx-auto text-gray-400 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <p className="text-gray-500">{isMobile ? 'Tap to take photo or upload' : 'Click to upload a signature image'}</p>
                <p className="text-xs text-gray-400 mt-1">PNG, JPG, or GIF</p>
              </label>
              {preview && <img src={preview} alt="Uploaded signature" className="mt-3 max-h-24 mx-auto" />}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className={`flex gap-3 p-4 ${isMobile ? 'border-t border-gray-200 safe-area-bottom' : 'bg-gray-50 rounded-b-2xl'}`}>
          {!isMobile && (
            <button onClick={onCancel} className="btn-secondary flex-1">Cancel</button>
          )}
          <button
            onClick={handleApply}
            className={`btn-primary ${isMobile ? 'w-full py-4 text-base' : 'flex-1'}`}
          >
            Apply Signature
          </button>
        </div>
      </div>
    </div>
  );
}
