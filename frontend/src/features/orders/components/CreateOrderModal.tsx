import { useState } from 'react';
import { createOrder } from '../api';
import { useAuthStore } from '../../auth/store';
import { useToastStore } from '../../toast/store';
import type { Conversation } from '../../chat/types';
import type { Property } from '../../properties/types';

interface CreateOrderModalProps {
  conversation: Conversation;
  property: Property | null;
  onClose: () => void;
  onCreated: () => void;
}

const SolIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="10" fill="#9945FF" />
    <text x="12" y="16" textAnchor="middle" fill="white" fontSize="12" fontWeight="bold">S</text>
  </svg>
);

export function CreateOrderModal({ conversation, property, onClose, onCreated }: CreateOrderModalProps) {
  const { token } = useAuthStore();
  const { addToast } = useToastStore();
  const [depositAmount, setDepositAmount] = useState('');
  const [rentAmount, setRentAmount] = useState(property ? String(property.price) : '');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [tokenMint, setTokenMint] = useState('SOL');
  const [deadlineDays, setDeadlineDays] = useState('7');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!token || !rentAmount || !depositAmount || !startDate || !endDate) return;

    setSubmitting(true);
    try {
      await createOrder({
        conversation_id: conversation.id,
        property_id: conversation.property_id,
        landlord_id: conversation.landlord_id,
        deposit_amount: Number(depositAmount),
        rent_amount: Number(rentAmount),
        token_mint: tokenMint,
        escrow_address: '',
        rent_start_date: new Date(startDate).toISOString(),
        rent_end_date: new Date(endDate).toISOString(),
        sign_deadline_days: Number(deadlineDays),
      }, token);

      addToast({ variant: 'success', title: 'Order Created', message: 'Waiting for response' });
      onCreated();
      onClose();
    } catch (err) {
      addToast({ variant: 'error', title: 'Failed to create order', message: err instanceof Error ? err.message : 'Unknown error' });
    } finally {
      setSubmitting(false);
    }
  };

  const inputStyle = {
    width: '100%', padding: '10px 14px', background: '#0a0a0f',
    border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#e2e8f0', fontSize: 14,
  };

  return (
    <div
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center',
        justifyContent: 'center', zIndex: 2000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#141416', borderRadius: 16, padding: 24,
          width: '90%', maxWidth: 420, border: '1px solid rgba(255,255,255,0.07)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ color: '#e2e8f0', fontSize: 18, fontWeight: 700, marginBottom: 20, fontFamily: "'Syne', sans-serif" }}>
          Create Order
        </h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ color: '#94a3b8', fontSize: 12, marginBottom: 4, display: 'block' }}>Rent Amount</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="number" value={rentAmount} onChange={(e) => setRentAmount(e.target.value)}
                placeholder="0" style={{ ...inputStyle, flex: 1, width: 'auto' }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#9945FF', fontWeight: 600, fontSize: 13 }}>
                <SolIcon /> SOL
              </div>
            </div>
          </div>

          <div>
            <label style={{ color: '#94a3b8', fontSize: 12, marginBottom: 4, display: 'block' }}>Deposit Amount</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="number" value={depositAmount} onChange={(e) => setDepositAmount(e.target.value)}
                placeholder="0" style={{ ...inputStyle, flex: 1, width: 'auto' }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#9945FF', fontWeight: 600, fontSize: 13 }}>
                <SolIcon /> SOL
              </div>
            </div>
          </div>

          <div>
            <label style={{ color: '#94a3b8', fontSize: 12, marginBottom: 4, display: 'block' }}>Start Date</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={inputStyle} />
          </div>

          <div>
            <label style={{ color: '#94a3b8', fontSize: 12, marginBottom: 4, display: 'block' }}>End Date</label>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={inputStyle} />
          </div>

          <button onClick={() => setShowAdvanced(!showAdvanced)}
            style={{ background: 'none', border: 'none', color: '#E07840', fontSize: 12, cursor: 'pointer', textAlign: 'left', padding: 0 }}>
            {showAdvanced ? '\u25BE Hide Advanced' : '\u25B8 Advanced Options'}
          </button>

          {showAdvanced && (
            <>
              <div>
                <label style={{ color: '#94a3b8', fontSize: 12, marginBottom: 4, display: 'block' }}>Token</label>
                <select value={tokenMint} onChange={(e) => setTokenMint(e.target.value)} style={inputStyle}>
                  <option value="SOL">SOL</option>
                </select>
              </div>
              <div>
                <label style={{ color: '#94a3b8', fontSize: 12, marginBottom: 4, display: 'block' }}>Sign Deadline (days)</label>
                <input type="number" value={deadlineDays} onChange={(e) => setDeadlineDays(e.target.value)} style={inputStyle} />
              </div>
            </>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
          <button onClick={onClose} style={{
            flex: 1, padding: 10, background: 'transparent', color: '#94a3b8',
            border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 14, cursor: 'pointer',
          }}>Cancel</button>
          <button onClick={handleSubmit}
            disabled={submitting || !rentAmount || !depositAmount || !startDate || !endDate}
            style={{
              flex: 1, padding: 10, background: '#E07840', color: '#fff',
              border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer',
              opacity: submitting ? 0.6 : 1,
            }}>
            {submitting ? 'Creating...' : 'Create Order'}
          </button>
        </div>
      </div>
    </div>
  );
}
