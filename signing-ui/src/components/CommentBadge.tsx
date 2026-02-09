interface CommentBadgeProps {
  count: number;
  onClick: () => void;
}

/**
 * Small badge overlay on fields that have comments.
 * Shows comment count and opens the CommentPanel filtered to that field.
 */
export function CommentBadge({ count, onClick }: CommentBadgeProps) {
  if (count === 0) return null;

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="absolute -top-2 -right-2 z-10 w-5 h-5 rounded-full bg-yellow-400 text-yellow-900 text-xs font-bold flex items-center justify-center shadow-sm hover:bg-yellow-500 transition-colors cursor-pointer"
      aria-label={`${count} comment${count !== 1 ? 's' : ''}`}
      title={`${count} comment${count !== 1 ? 's' : ''} on this field`}
    >
      {count}
    </button>
  );
}
