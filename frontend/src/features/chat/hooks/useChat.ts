import { useCallback, useEffect, useRef } from 'react';
import type { Centrifuge, Subscription } from 'centrifuge';
import { useAuthStore } from '../../auth/store';
import { useChatStore } from '../store';
import { apiFetch } from '../../../lib/api';
import type { Message } from '../types';

export function useChat(
  centrifugoRef: React.RefObject<Centrifuge | null>,
  conversationId: string | null,
  channel: string | null,
) {
  const { token } = useAuthStore();
  const {
    messages,
    addMessage,
    setMessages,
    prependMessages,
    incrementUnread,
    activeConversationId,
    updateConversationLastMessage,
  } = useChatStore();
  const subRef = useRef<Subscription | null>(null);

  // Subscribe to channel for real-time updates
  useEffect(() => {
    const client = centrifugoRef.current;
    if (!client || !channel || !conversationId) return;

    const sub = client.newSubscription(channel, {
      since: { offset: 0, epoch: '' },
    });

    sub.on('publication', (ctx) => {
      const msg = ctx.data as Message;

      if (conversationId === activeConversationId) {
        addMessage(conversationId, msg);
      } else {
        incrementUnread(conversationId);
      }
      updateConversationLastMessage(conversationId, msg.content, msg.created_at);
    });

    sub.on('subscribed', (ctx) => {
      if (ctx.publications && ctx.publications.length > 0) {
        const historyMsgs = ctx.publications.map((p) => p.data as Message);
        setMessages(conversationId, historyMsgs);
      }
    });

    sub.subscribe();
    subRef.current = sub;

    return () => {
      sub.unsubscribe();
      sub.removeAllListeners();
      subRef.current = null;
    };
  }, [
    centrifugoRef,
    channel,
    conversationId,
    activeConversationId,
    addMessage,
    setMessages,
    incrementUnread,
    updateConversationLastMessage,
  ]);

  // Load initial messages from REST API
  useEffect(() => {
    if (!conversationId || !token) return;
    const currentMsgs = messages[conversationId];
    if (currentMsgs && currentMsgs.length > 0) return; // already loaded

    apiFetch<Message[]>(
      `/conversations/${conversationId}/messages?limit=50`,
      {},
      token,
    ).then((msgs) => {
      if (msgs.length > 0) {
        setMessages(conversationId, msgs);
      }
    });
  }, [conversationId, token, messages, setMessages]);

  const sendMessage = useCallback(
    async (content: string) => {
      const client = centrifugoRef.current;
      if (!client || !channel || !conversationId) return;
      await client.publish(channel, { content });
    },
    [centrifugoRef, channel, conversationId],
  );

  // Load older messages
  const loadMore = useCallback(async () => {
    if (!conversationId || !token) return;

    const currentMsgs = messages[conversationId] || [];
    if (currentMsgs.length === 0) return;

    const oldestMsg = currentMsgs[0];
    const olderMsgs = await apiFetch<Message[]>(
      `/conversations/${conversationId}/messages?before=${encodeURIComponent(oldestMsg.created_at)}&limit=20`,
      {},
      token,
    );

    if (olderMsgs.length > 0) {
      prependMessages(conversationId, olderMsgs);
    }

    return olderMsgs.length;
  }, [conversationId, token, messages, prependMessages]);

  const currentMessages = conversationId ? messages[conversationId] || [] : [];

  return { messages: currentMessages, sendMessage, loadMore };
}
