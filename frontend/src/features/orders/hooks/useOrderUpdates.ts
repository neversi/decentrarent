import { useEffect, useRef, useCallback, useState } from 'react';
import type { Centrifuge, Subscription } from 'centrifuge';
import { useToastStore } from '../../toast/store';
import { listOrdersByConversation } from '../api';
import { useAuthStore } from '../../auth/store';
import type { Order, OrderUpdateEvent } from '../types';

export function useOrderUpdates(
  centrifugoRef: React.RefObject<Centrifuge | null>,
  conversationId: string | null,
) {
  const { token, user } = useAuthStore();
  const { addToast } = useToastStore();
  const [orders, setOrders] = useState<Order[]>([]);
  const subRef = useRef<Subscription | null>(null);
  const currentUserId = user?.id || '';

  const loadOrders = useCallback(async () => {
    if (!conversationId || !token) return;
    try {
      const result = await listOrdersByConversation(conversationId, token);
      setOrders(result);
    } catch {
      setOrders([]);
    }
  }, [conversationId, token]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  useEffect(() => {
    const client = centrifugoRef.current;
    if (!client || !conversationId) return;

    const channel = `orders:${conversationId}`;
    const sub = client.newSubscription(channel);

    sub.on('publication', (ctx) => {
      const evt = ctx.data as OrderUpdateEvent;

      setOrders((prev) => {
        const idx = prev.findIndex((o) => o.id === evt.order_id);
        if (idx >= 0) {
          const updated = [...prev];
          updated[idx] = evt.order;
          return updated;
        }
        return [evt.order, ...prev];
      });

      const isMe = evt.order.created_by === currentUserId;
      switch (evt.type) {
        case 'order_created':
          if (!isMe) {
            addToast({ variant: 'info', title: 'New Order Proposal', message: `${evt.order.rent_amount} SOL/period` });
          }
          break;
        case 'order_accepted':
          addToast({ variant: 'success', title: 'Order Accepted', message: 'Waiting for tenant to lock deposit' });
          break;
        case 'order_rejected':
          addToast({ variant: 'error', title: 'Order Rejected' });
          break;
        case 'deposit_locked':
          addToast({ variant: 'onchain', title: 'Deposit Locked On-Chain', message: 'Ready for signatures' });
          break;
        case 'party_signed':
          addToast({
            variant: 'onchain',
            title: 'Order Signed',
            message: `${evt.order.tenant_signed ? '\u2713' : '\u25CB'} Tenant  ${evt.order.landlord_signed ? '\u2713' : '\u25CB'} Landlord`,
          });
          break;
        case 'order_activated':
          addToast({ variant: 'success', title: 'Order Active', message: 'Both parties signed \u2014 order is live' });
          break;
        case 'order_expired':
          addToast({ variant: 'error', title: 'Order Expired', message: 'Sign deadline passed' });
          break;
      }
    });

    sub.subscribe();
    subRef.current = sub;

    return () => {
      sub.unsubscribe();
      sub.removeAllListeners();
      subRef.current = null;
    };
  }, [centrifugoRef, conversationId, currentUserId, addToast]);

  return { orders, setOrders, loadOrders };
}
