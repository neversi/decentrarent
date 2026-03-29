import { useEffect, useRef, useCallback } from 'react';
import type { Message } from '../types';

interface MessageListProps {
  messages: Message[];
  currentWallet: string;
  onLoadMore: () => Promise<number | undefined>;
}

export function MessageList({ messages, currentWallet, onLoadMore }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const prevLengthRef = useRef(0);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (messages.length > prevLengthRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
    prevLengthRef.current = messages.length;
  }, [messages.length]);

  // Scroll-up to load more
  const handleScroll = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    if (container.scrollTop === 0 && messages.length > 0) {
      onLoadMore();
    }
  }, [messages.length, onLoadMore]);

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const shortWallet = (wallet: string) =>
    `${wallet.slice(0, 4)}...${wallet.slice(-4)}`;

  if (messages.length === 0) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6A6A7A', padding: '16px' }}>
        No messages yet. Start the conversation!
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}
    >
      {messages.map((msg) => {
        const isMine = msg.sender_wallet === currentWallet;
        return (
          <div
            key={msg.id}
            className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[75%] rounded-lg px-3 py-2 ${
                isMine
                  ? 'bg-purple-600 text-white'
                  : 'bg-gray-800 text-gray-100'
              }`}
            >
              {!isMine && (
                <p className="text-xs text-gray-400 mb-1">
                  {shortWallet(msg.sender_wallet)}
                </p>
              )}
              <p className="text-sm break-words">{msg.content}</p>
              <p
                className={`text-xs mt-1 ${
                  isMine ? 'text-purple-200' : 'text-gray-500'
                }`}
              >
                {formatTime(msg.created_at)}
              </p>
            </div>
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
