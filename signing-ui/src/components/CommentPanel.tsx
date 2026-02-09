import { useState, useEffect, useRef } from 'react';

export interface CommentData {
  id: string;
  signerId: string;
  content: string;
  fieldId: string | null;
  page: number | null;
  x: number | null;
  y: number | null;
  parentId: string | null;
  resolved: boolean;
  createdAt: string;
  author: { name: string; email: string };
  replies?: CommentData[];
}

interface CommentPanelProps {
  token: string;
  isOpen: boolean;
  onClose: () => void;
  filterFieldId?: string | null;
}

export function CommentPanel({ token, isOpen, onClose, filterFieldId }: CommentPanelProps) {
  const [comments, setComments] = useState<CommentData[]>([]);
  const [newComment, setNewComment] = useState('');
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState('');
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const fetchComments = async () => {
    try {
      const res = await fetch(`/api/sign/${token}/comments`);
      const data = await res.json();
      if (data.success) {
        setComments(data.data);
      }
    } catch {
      // Silent fail
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchComments();
    }
  }, [isOpen, token]);

  const handleSubmit = async () => {
    if (!newComment.trim()) return;
    setLoading(true);

    try {
      const res = await fetch(`/api/sign/${token}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: newComment,
          fieldId: filterFieldId || undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setNewComment('');
        await fetchComments();
      }
    } catch {
      // Silent fail
    } finally {
      setLoading(false);
    }
  };

  const handleReply = async (commentId: string) => {
    if (!replyContent.trim()) return;
    setLoading(true);

    try {
      const res = await fetch(`/api/sign/${token}/comments/${commentId}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: replyContent }),
      });
      const data = await res.json();
      if (data.success) {
        setReplyContent('');
        setReplyTo(null);
        await fetchComments();
      }
    } catch {
      // Silent fail
    } finally {
      setLoading(false);
    }
  };

  const handleResolve = async (commentId: string) => {
    try {
      await fetch(`/api/sign/${token}/comments/${commentId}/resolve`, {
        method: 'PUT',
      });
      await fetchComments();
    } catch {
      // Silent fail
    }
  };

  const displayComments = filterFieldId
    ? comments.filter((c) => c.fieldId === filterFieldId)
    : comments;

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .substring(0, 2);
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-y-0 right-0 w-80 sm:w-96 bg-white shadow-xl z-40 flex flex-col border-l border-gray-200">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gray-50">
        <h2 className="text-lg font-semibold text-gray-900">
          Comments
          {filterFieldId && (
            <span className="text-sm font-normal text-gray-500 ml-2">(field)</span>
          )}
        </h2>
        <button
          onClick={onClose}
          className="p-1 text-gray-400 hover:text-gray-600 rounded"
          aria-label="Close comments"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Comments List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {displayComments.length === 0 && (
          <div className="text-center text-gray-400 py-8">
            <svg className="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            <p>No comments yet</p>
            <p className="text-sm mt-1">Start a conversation about this document</p>
          </div>
        )}

        {displayComments.map((comment) => (
          <div
            key={comment.id}
            className={`rounded-lg border ${comment.resolved ? 'bg-green-50 border-green-200' : 'bg-white border-gray-200'} p-3`}
          >
            {/* Comment header */}
            <div className="flex items-center gap-2 mb-2">
              <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-semibold">
                {getInitials(comment.author.name)}
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium text-gray-900 truncate block">
                  {comment.author.name}
                </span>
              </div>
              <span className="text-xs text-gray-400 whitespace-nowrap">
                {formatTime(comment.createdAt)}
              </span>
            </div>

            {/* Comment content */}
            <p className="text-sm text-gray-700 mb-2">{comment.content}</p>

            {/* Resolved badge */}
            {comment.resolved && (
              <span className="inline-flex items-center text-xs text-green-700 bg-green-100 px-2 py-0.5 rounded-full mb-2">
                Resolved
              </span>
            )}

            {/* Actions */}
            <div className="flex items-center gap-3 text-xs">
              <button
                onClick={() => setReplyTo(replyTo === comment.id ? null : comment.id)}
                className="text-blue-600 hover:text-blue-700 font-medium"
              >
                Reply
              </button>
              {!comment.resolved && (
                <button
                  onClick={() => handleResolve(comment.id)}
                  className="text-gray-500 hover:text-green-600 font-medium"
                >
                  Resolve
                </button>
              )}
            </div>

            {/* Replies */}
            {comment.replies && comment.replies.length > 0 && (
              <div className="mt-3 ml-4 space-y-2 border-l-2 border-gray-100 pl-3">
                {comment.replies.map((reply) => (
                  <div key={reply.id} className="text-sm">
                    <div className="flex items-center gap-1 mb-0.5">
                      <span className="font-medium text-gray-800">{reply.author.name}</span>
                      <span className="text-xs text-gray-400">{formatTime(reply.createdAt)}</span>
                    </div>
                    <p className="text-gray-600">{reply.content}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Reply input */}
            {replyTo === comment.id && (
              <div className="mt-3 flex gap-2">
                <input
                  type="text"
                  value={replyContent}
                  onChange={(e) => setReplyContent(e.target.value)}
                  placeholder="Write a reply..."
                  className="flex-1 text-sm px-2 py-1.5 border border-gray-300 rounded-md focus:ring-1 focus:ring-blue-500 focus:border-transparent"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleReply(comment.id);
                    }
                  }}
                />
                <button
                  onClick={() => handleReply(comment.id)}
                  disabled={!replyContent.trim() || loading}
                  className="text-sm px-3 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                  Send
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* New Comment Input */}
      <div className="border-t border-gray-200 p-3 bg-gray-50">
        <div className="flex gap-2">
          <textarea
            ref={inputRef}
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="Add a comment..."
            rows={2}
            className="flex-1 text-sm px-3 py-2 border border-gray-300 rounded-md resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                handleSubmit();
              }
            }}
          />
        </div>
        <div className="flex justify-between items-center mt-2">
          <span className="text-xs text-gray-400">Ctrl+Enter to send</span>
          <button
            onClick={handleSubmit}
            disabled={!newComment.trim() || loading}
            className="text-sm px-4 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Sending...' : 'Comment'}
          </button>
        </div>
      </div>
    </div>
  );
}
