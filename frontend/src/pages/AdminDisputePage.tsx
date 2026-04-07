import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../features/auth/store';
import { listDisputedOrders, resolveDispute } from '../features/orders/api';
import { useToastStore } from '../features/toast/store';
import { toDisplayAmount } from '../lib/tokenAmount';
import { apiFetch } from '../lib/api';
import type { Order } from '../features/orders/types';

const formatDate = (s: string) => new Date(s).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });

function DisputeCard({ order, onResolved }: { order: Order; onResolved: () => void }) {
  const { token } = useAuthStore();
  const { addToast } = useToastStore();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [navLoading, setNavLoading] = useState(false);
  const [reason, setReason] = useState('');

  const handleViewChat = async () => {
    if (!token) return;
    setNavLoading(true);
    try {
      const conversation = await apiFetch(`/conversations/${order.conversation_id}`, {}, token);
      navigate('/chat', { state: { conversation } });
    } catch {
      addToast({ variant: 'error', title: 'Failed to open conversation' });
    } finally {
      setNavLoading(false);
    }
  };

  const handleResolve = async (winner: 'tenant' | 'landlord') => {
    if (!reason.trim()) {
      addToast({ variant: 'error', title: 'Reason required', message: 'Enter a resolution reason' });
      return;
    }
    setLoading(true);
    try {
      await resolveDispute(order.id, winner, reason.trim(), token!);
      addToast({ variant: 'onchain', title: 'Resolve submitted', message: `Resolving in favour of ${winner}` });
      onResolved();
    } catch (err) {
      addToast({ variant: 'error', title: 'Failed', message: err instanceof Error ? err.message : '' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      background: '#141416',
      border: '1px solid rgba(255,77,106,0.25)',
      borderRadius: 12,
      padding: 16,
      marginBottom: 12,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ color: '#FF4D6A', fontWeight: 700, fontSize: 13 }}>DISPUTED</span>
        <span style={{ color: '#64748b', fontSize: 11 }}>{formatDate(order.updated_at)}</span>
      </div>

      <div style={{ color: '#94a3b8', fontSize: 12, lineHeight: 1.9 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Escrow:</span>
          <a
            href={`https://solscan.io/account/${order.escrow_address}?cluster=devnet`}
            target="_blank" rel="noopener noreferrer"
            style={{ color: '#9945FF', fontSize: 12 }}
          >
            {order.escrow_address.slice(0, 6)}...{order.escrow_address.slice(-4)} ↗
          </a>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Deposit:</span>
          <span style={{ color: '#e2e8f0' }}>{toDisplayAmount(order.deposit_amount, order.token_mint)} {order.token_mint}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Period:</span>
          <span style={{ color: '#e2e8f0' }}>{formatDate(order.rent_start_date)} — {formatDate(order.rent_end_date)}</span>
        </div>
        {order.dispute_reason && (
          <div style={{ marginTop: 6, padding: '6px 8px', background: 'rgba(255,77,106,0.08)', borderRadius: 6, color: '#FF4D6A', fontSize: 12 }}>
            Reason: {order.dispute_reason}
          </div>
        )}
      </div>

      <button
        onClick={handleViewChat}
        disabled={navLoading}
        style={{
          width: '100%', marginTop: 10, padding: '7px 0',
          background: 'transparent', border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 6, color: '#94a3b8', fontSize: 12,
          cursor: navLoading ? 'default' : 'pointer',
          opacity: navLoading ? 0.5 : 1,
        }}
      >
        {navLoading ? 'Opening…' : '💬 View conversation'}
      </button>

      <div style={{ marginTop: 10 }}>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Resolution reason..."
          disabled={loading}
          style={{
            width: '100%', boxSizing: 'border-box',
            background: '#0d0d10', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 6, color: '#e2e8f0', fontSize: 12,
            padding: '8px 10px', resize: 'none', height: 60,
            fontFamily: 'inherit', outline: 'none',
          }}
        />
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button
            onClick={() => handleResolve('tenant')}
            disabled={loading}
            style={{
              flex: 1, padding: '8px 0', borderRadius: 6, border: 'none',
              background: '#3DD68C', color: '#0a0a0f',
              fontWeight: 700, fontSize: 12, cursor: loading ? 'default' : 'pointer',
              opacity: loading ? 0.5 : 1,
            }}
          >
            Resolve → Tenant
          </button>
          <button
            onClick={() => handleResolve('landlord')}
            disabled={loading}
            style={{
              flex: 1, padding: '8px 0', borderRadius: 6, border: 'none',
              background: '#9945FF', color: '#fff',
              fontWeight: 700, fontSize: 12, cursor: loading ? 'default' : 'pointer',
              opacity: loading ? 0.5 : 1,
            }}
          >
            Resolve → Landlord
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminDisputePage() {
  const { token, user } = useAuthStore();
  const { addToast } = useToastStore();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const result = await listDisputedOrders(token);
      setOrders(result);
    } catch {
      addToast({ variant: 'error', title: 'Failed to load disputes' });
    } finally {
      setLoading(false);
    }
  }, [token, addToast]);

  useEffect(() => { load(); }, [load]);

  if (!user?.is_admin) {
    return (
      <div style={{ padding: 24, textAlign: 'center', color: '#FF4D6A', marginTop: 80 }}>
        Access denied
      </div>
    );
  }

  return (
    <div style={{ padding: '80px 16px 120px', maxWidth: 480, margin: '0 auto' }}>
      <h2 style={{ color: '#fff', fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Dispute Queue</h2>
      <p style={{ color: '#64748b', fontSize: 13, marginBottom: 20 }}>
        {orders.length} disputed {orders.length === 1 ? 'order' : 'orders'}
      </p>

      {loading && (
        <div style={{ color: '#64748b', fontSize: 13, textAlign: 'center', marginTop: 40 }}>Loading...</div>
      )}

      {!loading && orders.length === 0 && (
        <div style={{ color: '#64748b', fontSize: 13, textAlign: 'center', marginTop: 40 }}>
          No disputed orders
        </div>
      )}

      {orders.map((order) => (
        <DisputeCard key={order.id} order={order} onResolved={load} />
      ))}
    </div>
  );
}
