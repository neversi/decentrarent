import { useMemo, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useCentrifugo } from '../hooks/useCentrifugo';
import { useConversations } from '../hooks/useConversations';
import { useChat } from '../hooks/useChat';
import { useChatStore } from '../store';
import { useAuthStore } from '../../auth/store';
import { apiFetch } from '../../../lib/api';
import { ConversationList } from './ConversationList';
import { MessageList } from './MessageList';
import { MessageInput } from './MessageInput';
import type { Conversation } from '../types';

export function ChatWindow() {
  const { publicKey } = useWallet();
  const centrifugoRef = useCentrifugo();
  const { conversations, refetch } = useConversations();
  const { activeConversationId, setActiveConversation, clearUnread } = useChatStore();
  const { token } = useAuthStore();
  const [seeding, setSeeding] = useState(false);

  const currentWallet = publicKey?.toBase58() || '';

  const activeConv = useMemo(
    () => conversations.find((c) => c.id === activeConversationId) || null,
    [conversations, activeConversationId],
  );

  const channel = useMemo(() => {
    if (!activeConv) return null;
    return `property:${activeConv.property_id}:chat:${activeConv.loaner_wallet}`;
  }, [activeConv]);

  const { messages, sendMessage, loadMore } = useChat(
    centrifugoRef,
    activeConversationId,
    channel,
  );

  const handleSelectConversation = (conv: Conversation) => {
    setActiveConversation(conv.id);
    clearUnread(conv.id);
  };

  const handleSeedChat = async () => {
    setSeeding(true);
    try {
      await apiFetch('/dev/seed-chat', { method: 'POST' }, token);
      refetch();
    } catch (e) {
      console.error('Seed failed:', e);
    } finally {
      setSeeding(false);
    }
  };

  return (
    <div className="flex h-[calc(100vh-57px)] bg-[#0a0a0f]">
      {/* Conversation list sidebar */}
      <div className="w-80 border-r border-gray-800 overflow-y-auto flex-shrink-0">
        <div className="p-3 border-b border-gray-800 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">
            Conversations
          </h2>
          <button
            onClick={handleSeedChat}
            disabled={seeding}
            className="text-xs px-2 py-1 rounded bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200 transition-colors disabled:opacity-50"
          >
            {seeding ? '...' : '+ Test Chat'}
          </button>
        </div>
        <ConversationList
          currentWallet={currentWallet}
          onSelect={handleSelectConversation}
        />
      </div>

      {/* Chat area */}
      <div className="flex-1 flex flex-col">
        {activeConv ? (
          <>
            <div className="p-3 border-b border-gray-800">
              <p className="text-sm text-gray-300">
                Property: {activeConv.property_id.slice(0, 8)}...
              </p>
              <p className="text-xs text-gray-500">
                {activeConv.landlord_wallet === currentWallet
                  ? `Loaner: ${activeConv.loaner_wallet.slice(0, 4)}...${activeConv.loaner_wallet.slice(-4)}`
                  : `Landlord: ${activeConv.landlord_wallet.slice(0, 4)}...${activeConv.landlord_wallet.slice(-4)}`}
              </p>
            </div>
            <MessageList
              messages={messages}
              currentWallet={currentWallet}
              onLoadMore={loadMore}
            />
            <MessageInput onSend={sendMessage} />
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-500">
            Select a conversation to start chatting
          </div>
        )}
      </div>
    </div>
  );
}
