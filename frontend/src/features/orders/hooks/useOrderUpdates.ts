import { useEffect, useRef, useCallback, useState } from 'react';
import type { Centrifuge, Subscription } from 'centrifuge';
import { useToastStore } from '../../toast/store';
import { listOrdersByConversation } from '../api';
import { useAuthStore } from '../../auth/store';
import type { Order, OrderStatus, OrderUpdateEvent } from '../types';

export function useOrderUpdates(
  centrifugoRef: React.RefObject<Centrifuge | null>,
  conversationId: string | null,
) {
  const { token } = useAuthStore();
  const { addToast } = useToastStore();
  const [orders, setOrders] = useState<Order[]>([]);
  const [wsOrderIds, setWsOrderIds] = useState<Set<string>>(new Set());
  const subRef = useRef<Subscription | null>(null);

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

      setWsOrderIds((prev) => new Set([...prev, evt.order_id]));

      setOrders((prev) => {
        const idx = prev.findIndex((o) => o.id === evt.order_id);
        if (idx >= 0) {
          const existing = prev[idx];
          const merged = {
            ...evt.order,
            landlord_pk: evt.order.landlord_pk || existing.landlord_pk,
            tenant_pk: evt.order.tenant_pk || existing.tenant_pk,
          };
          const updated = [...prev];
          updated[idx] = merged;
          return updated;
        }
        return [evt.order, ...prev];
      });

      switch (evt.type) {
        case 'order_created':
          break;
        case 'order_accepted':
          addToast({ variant: 'success', title: 'Order Accepted', message: 'Waiting for tenant to lock deposit' });
          break;
        case 'order_both_accepted':
          addToast({ variant: 'success', title: 'Order Both Accepted', message: 'Both parties have accepted the order' });
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
        case 'dispute_opened':
          addToast({ variant: 'error', title: 'Dispute Opened', message: evt.order.dispute_reason || 'Deposit frozen pending resolution' });
          break;
        case 'rent_paid':
          addToast({ variant: 'onchain', title: 'Rent Paid', message: 'Payment confirmed on-chain' });
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
  }, [centrifugoRef, conversationId, addToast]);

  const TERMINAL: OrderStatus[] = ['rejected', 'expired', 'settled', 'dispute_resolved_tenant', 'dispute_resolved_landlord'];
  const chatOrders = orders.filter((o) => !TERMINAL.includes(o.escrow_status) || wsOrderIds.has(o.id));

  return { orders, chatOrders, setOrders, loadOrders };
}
