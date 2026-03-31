import type { Order, OrderStatus } from '../types';

interface OrdersPanelProps {
  orders: Order[];
  onClose: () => void;
}

const SOLSCAN_BASE = 'https://solscan.io/tx';

const statusLabels: Record<OrderStatus, string> = {
  new: 'NEW',
  rejected: 'REJECTED',
  awaiting_deposit: 'DEPOSIT',
  awaiting_signatures: 'AWAITING SIGS',
  active: 'ACTIVE',
  disputed: 'DISPUTED',
  settled: 'SETTLED',
  expired: 'EXPIRED',
  dispute_resolved_tenant: 'RESOLVED',
  dispute_resolved_landlord: 'RESOLVED',
};

const statusColor = (s: OrderStatus): string => {
  switch (s) {
    case 'active': case 'settled': case 'dispute_resolved_tenant': case 'dispute_resolved_landlord': return '#3DD68C';
    case 'rejected': case 'expired': case 'disputed': return '#FF4D6A';
    default: return '#E07840';
  }
};

const TERMINAL_STATUSES: OrderStatus[] = ['rejected', 'expired', 'settled', 'dispute_resolved_tenant', 'dispute_resolved_landlord'];

const formatDate = (dateStr: string) => {
  const d = new Date(dateStr);
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
};

export function OrdersPanel({ orders, onClose }: OrdersPanelProps) {
  const activeOrders = orders.filter((o) => !TERMINAL_STATUSES.includes(o.escrow_status));

  return (
    <div style={{
      width: 260, background: '#111118', borderLeft: '1px solid rgba(255,255,255,0.07)',
      padding: 16, overflowY: 'auto', flexShrink: 0,
    }}>
      <div style={{
        color: '#E07840', fontWeight: 600, fontSize: 13, marginBottom: 16,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <span>Orders</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 16 }}>
          {'\u00D7'}
        </button>
      </div>

      {orders.length === 0 ? (
        <div style={{ color: '#6A6A7A', fontSize: 13, textAlign: 'center', padding: 20 }}>
          No orders yet
        </div>
      ) : (
        <>
          {orders.map((order, idx) => {
            const color = statusColor(order.escrow_status);
            const terminal = TERMINAL_STATUSES.includes(order.escrow_status);
            return (
              <div key={order.id} style={{
                padding: 12, background: '#141416', borderRadius: 8,
                border: `1px solid ${terminal ? 'rgba(255,255,255,0.05)' : color + '33'}`,
                marginBottom: 10, opacity: terminal ? 0.6 : 1,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ color: '#e2e8f0', fontSize: 12, fontWeight: 600 }}>Order #{orders.length - idx}</span>
                  <span style={{ color, fontSize: 10, fontWeight: 600 }}>{statusLabels[order.escrow_status]}</span>
                </div>
                <div style={{ color: '#94a3b8', fontSize: 11, lineHeight: 1.6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <svg width="10" height="10" viewBox="0 0 24 24">
                      <circle cx="12" cy="12" r="10" fill="#9945FF" />
                      <text x="12" y="16" textAnchor="middle" fill="white" fontSize="12" fontWeight="bold">S</text>
                    </svg>
                    {order.rent_amount} SOL {'\u00B7'} {order.deposit_amount} SOL deposit
                  </div>
                  <div>{formatDate(order.rent_start_date)} \u2013 {formatDate(order.rent_end_date)}</div>
                  {order.escrow_address && (
                    <a
                      href={`${SOLSCAN_BASE}/${order.escrow_address}?cluster=devnet`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: '#9945FF', textDecoration: 'none', fontSize: 10 }}
                    >
                      Solscan {'\u2197'}
                    </a>
                  )}
                  {order.escrow_status === 'awaiting_signatures' && (
                    <div style={{ marginTop: 4 }}>
                      <span style={{ color: order.tenant_signed ? '#3DD68C' : '#E07840', fontSize: 10 }}>
                        {order.tenant_signed ? '\u2713' : '\u25CB'} Tenant
                      </span>
                      <span style={{ marginLeft: 6, color: order.landlord_signed ? '#3DD68C' : '#E07840', fontSize: 10 }}>
                        {order.landlord_signed ? '\u2713' : '\u25CB'} Landlord
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.07)' }}>
            <div style={{ color: '#94a3b8', fontSize: 11 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span>Total orders:</span><span style={{ color: '#e2e8f0' }}>{orders.length}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Active:</span><span style={{ color: '#3DD68C' }}>{activeOrders.length} in progress</span>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
