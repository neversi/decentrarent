import { useCallback, useEffect } from 'react';
import { useAuthStore } from '../../auth/store';
import { useChatStore } from '../store';
import { apiFetch } from '../../../lib/api';
import type { Conversation } from '../types';

export function useConversations() {
  const { token, isAuthenticated } = useAuthStore();
  const { conversations, setConversations } = useChatStore();

  const fetchConversations = useCallback(async () => {
    if (!token) return;
    const convs = await apiFetch<Conversation[]>('/conversations', {}, token);
    setConversations(convs);
  }, [token, setConversations]);

  useEffect(() => {
    if (isAuthenticated) {
      fetchConversations();
    }
  }, [isAuthenticated, fetchConversations]);

  return { conversations, refetch: fetchConversations };
}
