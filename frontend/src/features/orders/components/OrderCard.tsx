import { useState, useEffect } from 'react';
import { acceptOrder, rejectOrder } from '../api';
import { useAuthStore } from '../../auth/store';
import { useToastStore } from '../../toast/store';
import { useLockDeposit } from '../../escrow/hooks/useLockDeposit';
import { useTenantSign } from '../../escrow/hooks/useTenantSign';
import { useLandlordSign } from '../../escrow/hooks/useLandlordSign';
import { useEscrowAccount } from '../../escrow/hooks/useEscrowAccount';
import type { Order, OrderStatus } from '../types';
import type { Property } from '../../properties/types';
import { SolIcon } from '../../../components/SolIcon';
import { toDisplayAmount } from '../../../lib/tokenAmount';

interface OrderCardProps {
  order: Order;
  onUpdated: () => void;
  property?: Property | null;
}

const SOLSCAN_BASE = 'https://solscan.io/';

const PERIOD_SECONDS: Record<string, number> = {
  hour: 3600,
  day: 86400,
  week: 604800,
  month: 2592000,
};

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

export function OrderCard({ order, onUpdated, property }: OrderCardProps) {
  const { token, user } = useAuthStore();
  const { addToast } = useToastStore();
  const { lockDeposit } = useLockDeposit();
  const { tenantSign } = useTenantSign();
  const { landlordSign } = useLandlordSign();
  const [loading, setLoading] = useState(false);
  const [visible, setVisible] = useState(true);
  const [fading, setFading] = useState(false);

  const currentUserId = user?.id || '';
  const isTenant = currentUserId === order.tenant_id;
  const colors = statusColors[order.escrow_status];
  const isTerminal = TERMINAL_STATUSES.includes(order.escrow_status);

  // Read escrow account from chain when awaiting_signatures or escrow address exists
  const shouldReadChain =
    order.escrow_status === 'awaiting_signatures' ||
    (order.escrow_status === 'active' && !!order.escrow_address);

  const { escrowData, refetchEscrow } = useEscrowAccount(
    shouldReadChain ? order.landlord_pk : null,
    shouldReadChain ? order.tenant_pk : null,
    shouldReadChain ? order.id : null,
  );

  // Refetch on-chain data when order updates arrive (e.g. after deposit locked)
  useEffect(() => {
    if (shouldReadChain) {
      refetchEscrow();
    }
  }, [order.escrow_status, order.escrow_address, shouldReadChain, refetchEscrow]);

  // Off-chain accept/reject state (used for status: 'new')
  const acceptedByMe = isTenant ? order.tenant_signed : order.landlord_signed;

  // On-chain signature state (used for status: 'awaiting_signatures')
  const tenantSignedOnchain = escrowData?.tenantSigned ?? order.tenant_signed_onchain;
  const landlordSignedOnchain = escrowData?.landlordSigned ?? order.landlord_signed_onchain;
  const signedOnchain = isTenant ? tenantSignedOnchain : landlordSignedOnchain;

  useEffect(() => {
    if (!isTerminal) return;
    const fadeTimer = setTimeout(() => setFading(true), 3500);
    const hideTimer = setTimeout(() => setVisible(false), 4500);
    return () => { clearTimeout(fadeTimer); clearTimeout(hideTimer); };
  }, [isTerminal]);

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
      const periodSeconds = PERIOD_SECONDS[property?.period_type ?? ''] ?? PERIOD_SECONDS.month;
      await lockDeposit({
        orderId: order.id,
        landlordPubkey: order.landlord_pk,
        authorityPubkey: import.meta.env.VITE_AUTHORITY_PUBKEY as string,
        depositLamports: order.deposit_amount,
        deadlineTs: Math.floor(new Date(order.sign_deadline).getTime() / 1000),
        period: periodSeconds,
        startDate: Math.floor(new Date(order.rent_start_date).getTime() / 1000),
        endDate: Math.floor(new Date(order.rent_end_date).getTime() / 1000),
        priceRent: order.rent_amount,
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
        await tenantSign({ landlordPubkey: order.landlord_pk, orderId: order.id });
      } else {
        await landlordSign({ tenantPubkey: order.tenant_pk, orderId: order.id });
      }
      addToast({ variant: 'onchain', title: 'Order Signed', message: 'Transaction confirmed' });
      await refetchEscrow();
      onUpdated();
    } catch (err) {
      addToast({ variant: 'error', title: 'Signing failed', message: err instanceof Error ? err.message : '' });
    } finally {
      setLoading(false);
    }
  };

  if (!visible) return null;

  return (
    <div style={{
      margin: '16px auto', maxWidth: 380, padding: 16, background: '#141416',
      border: `1px solid ${colors.border}`, borderRadius: 12,
      opacity: fading ? 0 : (isTerminal ? 0.6 : 1),
      transition: fading ? 'opacity 1s ease' : undefined,
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
            <SolIcon /> {toDisplayAmount(order.rent_amount, order.token_mint)} {order.token_mint}
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Deposit:</span>
          <span style={{ color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: 4 }}>
            <SolIcon /> {toDisplayAmount(order.deposit_amount, order.token_mint)} {order.token_mint}
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Start Date:</span>
          <span style={{ color: '#e2e8f0' }}>{formatDate(order.rent_start_date)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>End Date:</span>
          <span style={{ color: '#e2e8f0' }}>{formatDate(order.rent_end_date)}</span>
        </div>
        {property?.period_type && (
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Periodicity:</span>
            <span style={{ color: '#e2e8f0', textTransform: 'capitalize' }}>{property.period_type}</span>
          </div>
        )}
        {order.escrow_address && (
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Escrow:</span>
            <a
              href={`${SOLSCAN_BASE}/account/${order.escrow_address}?cluster=devnet`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: '#9945FF', textDecoration: 'none', fontSize: 12 }}
            >
              {order.escrow_address.slice(0, 4)}...{order.escrow_address.slice(-4)} ↗
            </a>
          </div>
        )}
      </div>

      {order.escrow_status === 'awaiting_signatures' && (
        <div style={{ color: '#94a3b8', fontSize: 12, marginTop: 8 }}>
          <span style={{ color: tenantSignedOnchain ? '#3DD68C' : '#E07840' }}>
            {tenantSignedOnchain ? '✓' : '○'} Tenant
          </span>
          <span style={{ marginLeft: 12, color: landlordSignedOnchain ? '#3DD68C' : '#E07840' }}>
            {landlordSignedOnchain ? '✓' : '○'} Landlord
          </span>
        </div>
      )}

      {!isTerminal && (
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          {order.escrow_status === 'new' && (
            <>
              <button onClick={handleAccept} disabled={loading || acceptedByMe} style={{
                flex: 1, padding: 8, background: acceptedByMe ? 'rgba(61,214,140,0.15)' : '#3DD68C',
                color: acceptedByMe ? '#3DD68C' : '#0a0a0f',
                border: acceptedByMe ? '1px solid rgba(61,214,140,0.3)' : 'none',
                borderRadius: 6, fontWeight: 600, fontSize: 13,
                cursor: acceptedByMe ? 'default' : 'pointer',
                opacity: loading ? 0.6 : 1,
              }}>{acceptedByMe ? '✓ Accepted' : 'Accept'}</button>
              <button onClick={handleReject} disabled={loading || acceptedByMe} style={{
                flex: 1, padding: 8, background: 'transparent', color: '#FF4D6A',
                border: '1px solid #FF4D6A', borderRadius: 6, fontWeight: 600, fontSize: 13,
                cursor: acceptedByMe ? 'default' : 'pointer',
                opacity: (loading || acceptedByMe) ? 0.4 : 1,
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
          {order.escrow_status === 'awaiting_signatures' && !signedOnchain && (
            <button onClick={handleSign} disabled={loading} style={{
              width: '100%', padding: 8, background: '#9945FF', color: '#fff',
              border: 'none', borderRadius: 6, fontWeight: 600, fontSize: 13, cursor: 'pointer',
              opacity: loading ? 0.6 : 1,
            }}>Sign On-Chain</button>
          )}
          {order.escrow_status === 'awaiting_signatures' && signedOnchain && (
            <div style={{
              width: '100%', padding: 8, background: 'rgba(153,69,255,0.1)',
              border: '1px solid rgba(153,69,255,0.3)', borderRadius: 6,
              color: '#9945FF', fontWeight: 600, fontSize: 13, textAlign: 'center',
            }}>✓ Signed — awaiting other party</div>
          )}
        </div>
      )}
    </div>
  );
}
