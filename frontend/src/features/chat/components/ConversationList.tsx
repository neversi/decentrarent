import { useChatStore } from '../store';
import { ChatBadge } from './ChatBadge';
import type { Conversation } from '../types';

interface ConversationListProps {
  currentUserId: string;
  onSelect: (conv: Conversation) => void;
}

export function ConversationList({ currentUserId, onSelect }: ConversationListProps) {
  const { conversations, activeConversationId, unreadCounts } = useChatStore();

  const isLandlord = (conv: Conversation) => conv.landlord_id === currentUserId;

  const shortWallet = (wallet: string) =>
    `${wallet.slice(0, 4)}...${wallet.slice(-4)}`;

  const formatTime = (dateStr: string | null) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    if (date.toDateString() === now.toDateString()) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  if (conversations.length === 0) {
    return (
      <div className="p-4 text-center text-gray-500">
        No conversations yet
      </div>
    );
  }

  return (
    <div className="divide-y divide-gray-800">
      {conversations.map((conv) => {
        const otherWallet = isLandlord(conv) ? conv.loaner_id : conv.landlord_id;
        const isActive = conv.id === activeConversationId;
        const unread = unreadCounts[conv.id] || 0;

        return (
          <button
            key={conv.id}
            onClick={() => onSelect(conv)}
            className={`w-full text-left p-3 hover:bg-gray-800/50 transition-colors ${
              isActive ? 'bg-gray-800' : ''
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium text-gray-200">
                {shortWallet(otherWallet)}
              </span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">
                  {formatTime(conv.last_message_at)}
                </span>
                <ChatBadge count={unread} />
              </div>
            </div>
            <p className="text-xs text-gray-500 truncate">
              Property: {conv.property_id.slice(0, 8)}...
            </p>
            {conv.last_message && (
              <p className="text-sm text-gray-400 truncate mt-1">
                {conv.last_message}
              </p>
            )}
          </button>
        );
      })}
    </div>
  );
}
