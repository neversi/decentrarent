import { useMemo, useState } from 'react';
import { useCentrifugo } from '../hooks/useCentrifugo';
import { useConversations } from '../hooks/useConversations';
import { useChat } from '../hooks/useChat';
import { useChatStore } from '../store';
import { useAuthStore } from '../../auth/store';
import { apiFetch } from '../../../lib/api';
import { MessageList } from './MessageList';
import { MessageInput } from './MessageInput';
import { ChatBadge } from './ChatBadge';
import type { Conversation } from '../types';

export function ChatWindow() {
  const centrifugoRef = useCentrifugo();
  const { conversations, refetch } = useConversations();
  const { activeConversationId, setActiveConversation, clearUnread } = useChatStore();
  const { token } = useAuthStore();
  const [seeding, setSeeding] = useState(false);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);

  const { user } = useAuthStore();
  const currentUserId = user?.id || '';

  const activeConv = useMemo(
    () => selectedConversation || conversations.find((c) => c.id === activeConversationId) || null,
    [conversations, activeConversationId, selectedConversation],
  );

  const channel = useMemo(() => {
    if (!activeConv) return null;
    return `property:${activeConv.property_id}:chat:${activeConv.loaner_id}`;
  }, [activeConv]);

  const { messages, sendMessage, loadMore } = useChat(
    centrifugoRef,
    activeConv?.id || null,
    channel,
  );

  const handleSelectConversation = (conv: Conversation) => {
    setSelectedConversation(conv);
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

  const isLandlord = (conv: Conversation) => conv.landlord_id === currentUserId;
  const shortWallet = (wallet: string) => `${wallet.slice(0, 4)}...${wallet.slice(-4)}`;
  const formatTime = (dateStr: string | null) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    if (date.toDateString() === now.toDateString()) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  if (selectedConversation) {
    return (
      <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: '#0a0a0f', color: '#fff', zIndex: 1000 }}>
        <div style={{ flexShrink: 0, padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <button onClick={() => setSelectedConversation(null)} style={{ background: 'none', border: 'none', color: '#E07840', fontSize: 16, cursor: 'pointer', marginRight: 16 }}>
              ← Back
            </button>
            <div>
              <p style={{ fontSize: 14, fontWeight: 600 }}>
                Property: {selectedConversation.property_id.slice(0, 8)}...
              </p>
              <p style={{ fontSize: 12, color: '#6A6A7A' }}>
                {isLandlord(selectedConversation)
                  ? `Loaner: ${shortWallet(selectedConversation.loaner_id)}`
                  : `Landlord: ${shortWallet(selectedConversation.landlord_id)}`}
              </p>
            </div>
          </div>
        </div>
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <MessageList
            messages={messages}
            currentUserId={currentUserId}
            onLoadMore={loadMore}
          />
          <MessageInput onSend={sendMessage} />
        </div>
      </div>
    );
  }  return (
    <div style={{ padding: '0 20px 100px', minHeight: '100vh', background: '#0a0a0f', color: '#fff' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '56px 0 28px' }}>
        <div>
          <h1 style={{ fontFamily: "'Syne', sans-serif", fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em', color: '#fff' }}>
            Messages
          </h1>
        </div>
        <button
          onClick={handleSeedChat}
          disabled={seeding}
          style={{ padding: '8px 12px', borderRadius: 8, background: '#E07840', color: '#fff', border: 'none', cursor: 'pointer' }}
        >
          {seeding ? '...' : '+ Test Chat'}
        </button>
      </div>

      {conversations.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#6A6A7A' }}>
          No conversations yet
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {conversations.map((conv) => {
            const otherWallet = isLandlord(conv) ? conv.loaner_id : conv.landlord_id;
            const unread = useChatStore.getState().unreadCounts[conv.id] || 0;

            return (
              <button
                key={conv.id}
                onClick={() => handleSelectConversation(conv)}
                style={{
                  background: '#141416',
                  border: '1px solid rgba(255,255,255,0.07)',
                  borderRadius: 16,
                  padding: '16px 18px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  textAlign: 'left',
                  cursor: 'pointer',
                  transition: 'background 0.2s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#1C1C20')}
                onMouseLeave={(e) => (e.currentTarget.style.background = '#141416')}
              >
                <div style={{ width: 46, height: 46, borderRadius: 12, background: '#1C1C20', border: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>
                  💬
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <p style={{ fontWeight: 600, fontSize: 14, color: '#fff' }}>
                      {shortWallet(otherWallet)}
                    </p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 12, color: '#6A6A7A' }}>
                        {formatTime(conv.last_message_at)}
                      </span>
                      <ChatBadge count={unread} />
                    </div>
                  </div>
                  <p style={{ fontSize: 12, color: '#6A6A7A', marginBottom: 4 }}>
                    Property: {conv.property_id.slice(0, 8)}...
                  </p>
                  {conv.last_message && (
                    <p style={{ fontSize: 14, color: '#9A9AAA', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {conv.last_message}
                    </p>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
