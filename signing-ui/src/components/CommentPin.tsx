import { useState } from 'react';

interface CommentPinProps {
  x: number;
  y: number;
  authorName: string;
  content: string;
  resolved: boolean;
  onClick: () => void;
  pageWidth: number;
  pageHeight: number;
}

/**
 * Small dot overlay on the PDF at the comment's x/y position.
 * Click highlights the related comment in the CommentPanel.
 * Hover shows preview of comment text.
 */
export function CommentPin({
  x,
  y,
  authorName,
  content,
  resolved,
  onClick,
  pageWidth,
  pageHeight,
}: CommentPinProps) {
  const [showPreview, setShowPreview] = useState(false);

  const left = (x / 100) * pageWidth;
  const top = (y / 100) * pageHeight;

  return (
    <div
      className="absolute z-20"
      style={{ left: `${left}px`, top: `${top}px` }}
    >
      {/* Pin dot */}
      <button
        onClick={onClick}
        onMouseEnter={() => setShowPreview(true)}
        onMouseLeave={() => setShowPreview(false)}
        className={`w-6 h-6 rounded-full flex items-center justify-center shadow-md cursor-pointer transition-transform hover:scale-110 ${
          resolved
            ? 'bg-green-500 text-white'
            : 'bg-yellow-400 text-yellow-900'
        }`}
        aria-label={`Comment by ${authorName}`}
      >
        <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
          <path
            fillRule="evenodd"
            d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {/* Hover preview */}
      {showPreview && (
        <div className="absolute left-8 top-0 w-56 bg-white border border-gray-200 rounded-lg shadow-lg p-3 z-30 pointer-events-none">
          <div className="flex items-center gap-1.5 mb-1">
            <span className="text-xs font-semibold text-gray-800">{authorName}</span>
            {resolved && (
              <span className="text-xs text-green-600 font-medium">Resolved</span>
            )}
          </div>
          <p className="text-xs text-gray-600 line-clamp-3">{content}</p>
        </div>
      )}
    </div>
  );
}
