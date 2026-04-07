import { useEffect, useRef, useCallback, useState } from 'react';
import type { Message } from '../types';
import './MagicDog.css';

interface MessageListProps {
  messages: Message[];
  currentUserId: string;
  onLoadMore: () => Promise<number | undefined>;
}

const DOG_TYPES = new Set(['system', 'modal', 'document']);
const GROUP_GAP_MS = 60_000; // 1 minute

function isDogMessage(msg: Message) {
  return DOG_TYPES.has(msg.message_type || 'text');
}

/** Group consecutive dog messages that are within 1 minute of each other */
type RenderItem =
  | { kind: 'text'; msg: Message }
  | { kind: 'dog-group'; msgs: Message[] };

function buildRenderItems(messages: Message[]): RenderItem[] {
  const items: RenderItem[] = [];
  let currentGroup: Message[] = [];

  const flushGroup = () => {
    if (currentGroup.length > 0) {
      items.push({ kind: 'dog-group', msgs: [...currentGroup] });
      currentGroup = [];
    }
  };

  for (const msg of messages) {
    if (isDogMessage(msg)) {
      if (currentGroup.length > 0) {
        const lastTime = new Date(currentGroup[currentGroup.length - 1].created_at).getTime();
        const thisTime = new Date(msg.created_at).getTime();
        if (Math.abs(thisTime - lastTime) > GROUP_GAP_MS) {
          flushGroup();
        }
      }
      currentGroup.push(msg);
    } else {
      flushGroup();
      items.push({ kind: 'text', msg });
    }
  }
  flushGroup();

  return items;
}

export function MessageList({ messages, currentUserId, onLoadMore }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const prevLengthRef = useRef(0);

  useEffect(() => {
    if (messages.length > prevLengthRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
    prevLengthRef.current = messages.length;
  }, [messages.length]);

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

  const renderItems = buildRenderItems(messages);

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}
    >
      {renderItems.map((item) => {
        if (item.kind === 'dog-group') {
          return <DogGroup key={item.msgs[0].id} msgs={item.msgs} />;
        }

        const msg = item.msg;
        const isMine = msg.sender_id === currentUserId;
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
                  {shortWallet(msg.sender_id)}
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

/* ── Dog Avatar ── */

function DogAvatar() {
  return (
    <div style={{
      width: 32, height: 32, borderRadius: '50%', background: '#1C1C20',
      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    }}>
      <div style={{ position: 'relative', width: 22, height: 20 }}>
        <div style={{
          width: 8, height: 10, background: '#8B5E3C', borderRadius: '50% 50% 20% 20%',
          position: 'absolute', top: -2, left: 0, transform: 'rotate(-10deg)',
        }} />
        <div style={{
          width: 8, height: 10, background: '#8B5E3C', borderRadius: '50% 50% 20% 20%',
          position: 'absolute', top: -2, right: 0, transform: 'rotate(10deg)',
        }} />
        <div style={{
          width: 20, height: 17, background: '#C68642', borderRadius: '50% 50% 45% 45%',
          position: 'absolute', top: 3, left: 1,
        }}>
          <div style={{ width: 3, height: 3, background: '#1a1a2e', borderRadius: '50%', position: 'absolute', top: 7, left: 5 }} />
          <div style={{ width: 3, height: 3, background: '#1a1a2e', borderRadius: '50%', position: 'absolute', top: 7, right: 5 }} />
          <div style={{ width: 4, height: 3, background: '#2d2d3d', borderRadius: '50%', position: 'absolute', bottom: 3, left: '50%', transform: 'translateX(-50%)' }} />
        </div>
      </div>
    </div>
  );
}

/* ── Dog Group: one avatar, multiple bubbles stacked ── */

function DogGroup({ msgs }: { msgs: Message[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, margin: '8px 0' }}>
      <DogAvatar />
      {msgs.map((msg) => {
        const msgType = msg.message_type || 'text';
        if (msgType === 'modal') return <ModalBubble key={msg.id} msg={msg} />;
        if (msgType === 'document') return <DocumentBubble key={msg.id} msg={msg} />;
        return <SystemBubble key={msg.id} msg={msg} />;
      })}
    </div>
  );
}

/* ── System Bubble (no avatar, just the card) ── */

function SystemBubble({ msg }: { msg: Message }) {
  
  return (
    <div style={{
      background: 'rgba(224, 120, 64, 0.08)',
      border: '1px solid rgba(224, 120, 64, 0.15)',
      borderRadius: 12,
      padding: '8px 16px',
      maxWidth: '80%',
      textAlign: 'center',
    }}>
      <p style={{ fontSize: 13, color: '#E07840', fontWeight: 500 }}>{msg.content}</p>
      {msg.metadata?.tx && (
        <a
          href={`https://solscan.io/tx/${msg.metadata.tx}?cluster=devnet`}
          target="_blank"
          rel="noopener noreferrer"
          style={{ display: 'block', fontSize: 11, color: '#9945FF', marginTop: 4, textDecoration: 'none' }}
        >
          View transaction ↗
        </a>
      )}
      <p style={{ fontSize: 10, color: '#6A6A7A', marginTop: 4 }}>
        {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </p>
    </div>
  );
}

/* ── Modal Bubble (no avatar, just the card with buttons) ── */

function ModalBubble({ msg }: { msg: Message }) {
  const [localStatus] = useState(msg.metadata?.modal_status || 'pending');

  const statusLabel = localStatus === 'accepted' ? 'Accepted' : localStatus === 'rejected' ? 'Rejected' : localStatus === 'expired' ? 'Expired' : null;
  const statusColor = localStatus === 'accepted' ? '#3DD68C' : localStatus === 'rejected' ? '#FF4D6A' : '#6A6A7A';

  return (
    <div style={{
      background: '#141416',
      border: `1px solid rgba(224, 120, 64, 0.12)`,
      borderRadius: 12,
      padding: '12px 16px',
      maxWidth: '85%',
      minWidth: 200,
      textAlign: 'center',
    }}>
      <p style={{ fontSize: 13, color: '#e2e8f0', fontWeight: 500, marginBottom: 4 }}>{msg.content}</p>

      {statusLabel && (
        <p style={{ fontSize: 11, color: statusColor, fontWeight: 600 }}>{statusLabel}</p>
      )}

      <p style={{ fontSize: 10, color: '#6A6A7A', marginTop: 6 }}>
        {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </p>
    </div>
  );
}

/* ── Document Bubble (no avatar, just the card) ── */

function DocumentBubble({ msg }: { msg: Message }) {
  const docName = msg.metadata?.document_name || 'Document';
  const docUrl = msg.metadata?.document_url;

  return (
    <div style={{
      background: 'rgba(153, 69, 255, 0.08)',
      border: '1px solid rgba(153, 69, 255, 0.2)',
      borderRadius: 12,
      padding: '10px 16px',
      maxWidth: '80%',
      textAlign: 'center',
    }}>
      <p style={{ fontSize: 13, color: '#e2e8f0', marginBottom: 6 }}>{msg.content}</p>
      {docUrl && (
        <a
          href={docUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '5px 12px', background: 'rgba(153, 69, 255, 0.15)',
            border: '1px solid rgba(153, 69, 255, 0.3)', borderRadius: 6,
            color: '#9945FF', fontSize: 12, fontWeight: 600, textDecoration: 'none',
          }}
        >
          {'\uD83D\uDCC4'} {docName}
        </a>
      )}
      <p style={{ fontSize: 10, color: '#6A6A7A', marginTop: 6 }}>
        {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </p>
    </div>
  );
}
