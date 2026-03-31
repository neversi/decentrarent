import { useState } from 'react';
import { acceptOrder, rejectOrder } from '../api';
import { useAuthStore } from '../../auth/store';
import { useToastStore } from '../../toast/store';
import { useLockDeposit } from '../../escrow/hooks/useLockDeposit';
import { useTenantSign } from '../../escrow/hooks/useTenantSign';
import { useLandlordSign } from '../../escrow/hooks/useLandlordSign';
import type { Order, OrderStatus } from '../types';

interface OrderCardProps {
  order: Order;
  onUpdated: () => void;
}

const SOLSCAN_BASE = 'https://solscan.io/tx';

const statusColors: Record<OrderStatus, { bg: string; text: string; border: string }> = {
  new: { bg: 'rgba(224,120,64,0.15)', text: '#E07840', border: 'rgba(224,120,64,0.3)' },
  rejected: { bg: 'rgba(255,77,106,0.15)', text: '#FF4D6A', border: 'rgba(255,77,106,0.2)' },
  awaiting_deposit: { bg: 'rgba(224,120,64,0.15)', text: '#E07840', border: 'rgba(224,120,64,0.3)' },
  awaiting_signatures: { bg: 'rgba(224,120,64,0.15)', text: '#E07840', border: 'rgba(224,120,64,0.3)' },
  active: { bg: 'rgba(61,214,140,0.15)', text: '#3DD68C', border: 'rgba(61,214,140,0.3)' },
  disputed: { bg: 'rgba(255,77,106,0.15)', text: '#FF4D6A', border: 'rgba(255,77,106,0.2)' },
  settled: { bg: 'rgba(61,214,140,0.1)', text: '#3DD68C', border: 'rgba(61,214,140,0.2)' },
  expired: { bg: 'rgba(255,77,106,0.1)', text: '#FF4D6A', border: 'rgba(255,77,106,0.15)' },
  dispute_resolved_tenant: { bg: 'rgba(61,214,140,0.1)', text: '#3DD68C', border: 'rgba(61,214,140,0.2)' },
  dispute_resolved_landlord: { bg: 'rgba(61,214,140,0.1)', text: '#3DD68C', border: 'rgba(61,214,140,0.2)' },
};

const statusLabels: Record<OrderStatus, string> = {
  new: 'NEW',
  rejected: 'REJECTED',
  awaiting_deposit: 'AWAITING DEPOSIT',
  awaiting_signatures: 'AWAITING SIGNATURES',
  active: 'ACTIVE',
  disputed: 'DISPUTED',
  settled: 'SETTLED',
  expired: 'EXPIRED',
  dispute_resolved_tenant: 'RESOLVED (TENANT)',
  dispute_resolved_landlord: 'RESOLVED (LANDLORD)',
};

const TERMINAL_STATUSES: OrderStatus[] = ['rejected', 'expired', 'settled', 'dispute_resolved_tenant', 'dispute_resolved_landlord'];

const formatDate = (dateStr: string) => {
  const d = new Date(dateStr);
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
};

const SolIcon = ({ size = 12 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="10" fill="#9945FF" />
    <text x="12" y="16" textAnchor="middle" fill="white" fontSize="12" fontWeight="bold">S</text>
  </svg>
);

export function OrderCard({ order, onUpdated }: OrderCardProps) {
  const { token, user } = useAuthStore();
  const { addToast } = useToastStore();
  const { lockDeposit } = useLockDeposit();
  const { tenantSign } = useTenantSign();
  const { landlordSign } = useLandlordSign();
  const [loading, setLoading] = useState(false);

  const currentUserId = user?.id || '';
  const isTenant = currentUserId === order.tenant_id;
  const colors = statusColors[order.escrow_status];
  const isTerminal = TERMINAL_STATUSES.includes(order.escrow_status);

  const handleAccept = async () => {
    if (!token) return;
    setLoading(true);
    try {
      await acceptOrder(order.id, token);
      onUpdated();
    } catch (err) {
      addToast({ variant: 'error', title: 'Failed to accept', message: err instanceof Error ? err.message : '' });
    } finally {
      setLoading(false);
    }
  };

  const handleReject = async () => {
    if (!token) return;
    setLoading(true);
    try {
      await rejectOrder(order.id, token);
      onUpdated();
    } catch (err) {
      addToast({ variant: 'error', title: 'Failed to reject', message: err instanceof Error ? err.message : '' });
    } finally {
      setLoading(false);
    }
  };

  const handleLockDeposit = async () => {
    setLoading(true);
    try {
      await lockDeposit({
        orderId: order.id,
        landlordPubkey: order.landlord_id,
        authorityPubkey: order.landlord_id,
        depositLamports: order.deposit_amount,
        deadlineTs: Math.floor(new Date(order.sign_deadline).getTime() / 1000),
      });
      addToast({ variant: 'onchain', title: 'Deposit Locked', message: 'Transaction confirmed' });
      onUpdated();
    } catch (err) {
      addToast({ variant: 'error', title: 'Deposit failed', message: err instanceof Error ? err.message : '' });
    } finally {
      setLoading(false);
    }
  };

  const handleSign = async () => {
    setLoading(true);
    try {
      if (isTenant) {
        await tenantSign({ landlordPubkey: order.landlord_id, orderId: order.id });
      } else {
        await landlordSign({ tenantPubkey: order.tenant_id, orderId: order.id });
      }
      addToast({ variant: 'onchain', title: 'Order Signed', message: 'Transaction confirmed' });
      onUpdated();
    } catch (err) {
      addToast({ variant: 'error', title: 'Signing failed', message: err instanceof Error ? err.message : '' });
    } finally {
      setLoading(false);
    }
  };

  const alreadySigned = isTenant ? order.tenant_signed : order.landlord_signed;

  return (
    <div style={{
      margin: '16px auto', maxWidth: 380, padding: 16, background: '#141416',
      border: `1px solid ${colors.border}`, borderRadius: 12,
      opacity: isTerminal ? 0.6 : 1,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 14 }}>{'\uD83D\uDCCB'}</span>
          <span style={{ color: colors.text, fontWeight: 600, fontSize: 13 }}>Order Proposal</span>
        </div>
        <span style={{ background: colors.bg, color: colors.text, padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600 }}>
          {statusLabels[order.escrow_status]}
        </span>
      </div>

      <div style={{ color: '#94a3b8', fontSize: 12, lineHeight: 1.8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Rent:</span>
          <span style={{ color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: 4 }}>
            <SolIcon /> {order.rent_amount} SOL
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Deposit:</span>
          <span style={{ color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: 4 }}>
            <SolIcon /> {order.deposit_amount} SOL
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Period:</span>
          <span style={{ color: '#e2e8f0' }}>{formatDate(order.rent_start_date)} \u2013 {formatDate(order.rent_end_date)}</span>
        </div>
        {order.escrow_address && (
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Escrow:</span>
            <a
              href={`${SOLSCAN_BASE}/${order.escrow_address}?cluster=devnet`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: '#9945FF', textDecoration: 'none', fontSize: 12 }}
            >
              {order.escrow_address.slice(0, 4)}...{order.escrow_address.slice(-4)} \u2197
            </a>
          </div>
        )}
      </div>

      {order.escrow_status === 'awaiting_signatures' && (
        <div style={{ color: '#94a3b8', fontSize: 12, marginTop: 8 }}>
          <span style={{ color: order.tenant_signed ? '#3DD68C' : '#E07840' }}>
            {order.tenant_signed ? '\u2713' : '\u25CB'} Tenant
          </span>
          <span style={{ marginLeft: 12, color: order.landlord_signed ? '#3DD68C' : '#E07840' }}>
            {order.landlord_signed ? '\u2713' : '\u25CB'} Landlord
          </span>
        </div>
      )}

      {!isTerminal && (
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          {order.escrow_status === 'new' && (
            <>
              <button onClick={handleAccept} disabled={loading} style={{
                flex: 1, padding: 8, background: '#3DD68C', color: '#0a0a0f',
                border: 'none', borderRadius: 6, fontWeight: 600, fontSize: 13, cursor: 'pointer',
                opacity: loading ? 0.6 : 1,
              }}>Accept</button>
              <button onClick={handleReject} disabled={loading} style={{
                flex: 1, padding: 8, background: 'transparent', color: '#FF4D6A',
                border: '1px solid #FF4D6A', borderRadius: 6, fontWeight: 600, fontSize: 13, cursor: 'pointer',
                opacity: loading ? 0.6 : 1,
              }}>Reject</button>
            </>
          )}
          {order.escrow_status === 'awaiting_deposit' && isTenant && (
            <button onClick={handleLockDeposit} disabled={loading} style={{
              width: '100%', padding: 8, background: '#E07840', color: '#fff',
              border: 'none', borderRadius: 6, fontWeight: 600, fontSize: 13, cursor: 'pointer',
              opacity: loading ? 0.6 : 1,
            }}>Lock Deposit On-Chain</button>
          )}
          {order.escrow_status === 'awaiting_signatures' && !alreadySigned && (
            <button onClick={handleSign} disabled={loading} style={{
              width: '100%', padding: 8, background: '#E07840', color: '#fff',
              border: 'none', borderRadius: 6, fontWeight: 600, fontSize: 13, cursor: 'pointer',
              opacity: loading ? 0.6 : 1,
            }}>Sign Order On-Chain</button>
          )}
        </div>
      )}
    </div>
  );
}
