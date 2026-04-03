import { useState, useMemo } from 'react';
import { createOrder } from '../api';
import { useAuthStore } from '../../auth/store';
import { useToastStore } from '../../toast/store';
import { TOKEN_INFO } from '../../properties/utils';
import type { Conversation } from '../../chat/types';
import type { Property } from '../../properties/types';
import { SolIcon } from '../../../components/SolIcon';
import { toDisplayAmount, toBaseUnits } from '../../../lib/tokenAmount';

interface CreateOrderModalProps {
  conversation: Conversation;
  property: Property | null;
  onClose: () => void;
  onCreated: () => void;
}

type TokenMint = 'SOL' | 'USDC' | 'USDT';

const TOKENS: { value: TokenMint; label: string; icon: string }[] = [
  { value: 'SOL', label: 'SOL', icon: TOKEN_INFO['SOL'].icon },
  { value: 'USDC', label: 'USDC', icon: TOKEN_INFO['USDC'].icon },
  { value: 'USDT', label: 'USDT', icon: TOKEN_INFO['USDT'].icon },
];

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function CreateOrderModal({ conversation, property, onClose, onCreated }: CreateOrderModalProps) {
  const { token } = useAuthStore();
  const { addToast } = useToastStore();
  const [depositAmount, setDepositAmount] = useState('');
  const [rentAmount, setRentAmount] = useState(property ? String(property.price) : '');
  const [tokenMint, setTokenMint] = useState<TokenMint>(
    (property?.token_mint as TokenMint) || 'SOL'
  );
  const [deadlineDays, setDeadlineDays] = useState('7');
  const [submitting, setSubmitting] = useState(false);

  // Calendar state
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [selecting, setSelecting] = useState<'start' | 'end'>('start');

  const handleDayClick = (date: Date) => {
    if (selecting === 'start') {
      setStartDate(date);
      setEndDate(null);
      setSelecting('end');
    } else {
      if (startDate && date >= startDate) {
        setEndDate(date);
        setSelecting('start');
      } else {
        // Clicked before start — reset
        setStartDate(date);
        setEndDate(null);
        setSelecting('end');
      }
    }
  };

  const handleSubmit = async () => {
    if (!token || !depositAmount || !startDate || !endDate || !property) return;

    setSubmitting(true);
    try {
      await createOrder({
        conversation_id: conversation.id,
        property_id: conversation.property_id,
        landlord_id: conversation.landlord_id,
        deposit_amount: toBaseUnits(Number(depositAmount), tokenMint),
        rent_amount: property.price,
        token_mint: tokenMint,
        escrow_address: '',
        rent_start_date: startDate.toISOString(),
        rent_end_date: endDate.toISOString(),
        sign_deadline_days: Number(deadlineDays),
      }, token);

      addToast({ variant: 'success', title: 'Agreement Created', message: 'Waiting for response' });
      onCreated();
      onClose();
    } catch (err) {
      addToast({ variant: 'error', title: 'Failed', message: err instanceof Error ? err.message : 'Unknown error' });
    } finally {
      setSubmitting(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 14px', background: '#0a0a0f',
    border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#e2e8f0', fontSize: 14,
    boxSizing: 'border-box', outline: 'none', fontFamily: "'DM Sans',sans-serif",
  };

  const formatSelected = (d: Date | null) => {
    if (!d) return '\u2014';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const canSubmit = rentAmount && depositAmount && startDate && endDate && !submitting;

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
          width: '90%', maxWidth: 420, maxHeight: '90vh', overflowY: 'auto',
          border: '1px solid rgba(255,255,255,0.07)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ color: '#e2e8f0', fontSize: 18, fontWeight: 700, marginBottom: 20, fontFamily: "'Syne', sans-serif" }}>
          New Lease Agreement
        </h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Payment Token */}
          <div>
            <label style={{ color: '#94a3b8', fontSize: 12, marginBottom: 6, display: 'block', fontWeight: 500 }}>Payment Token</label>
            <div style={{ display: 'flex', gap: 6 }}>
              {TOKENS.map(t => {
                const active = tokenMint === t.value;
                return (
                  <button key={t.value} onClick={() => setTokenMint(t.value)} style={{
                    flex: 1, padding: '8px 0', borderRadius: 8,
                    background: active ? 'rgba(153,69,255,0.12)' : 'rgba(255,255,255,0.04)',
                    border: `1.5px solid ${active ? 'rgba(153,69,255,0.4)' : 'rgba(255,255,255,0.08)'}`,
                    color: active ? '#9945FF' : '#6A6A7A',
                    fontWeight: 600, fontSize: 12, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                    transition: 'all 0.2s',
                    fontFamily: "'DM Sans',sans-serif",
                    boxShadow: active ? '0 0 10px rgba(153,69,255,0.15)' : 'none',
                  }}>
                    <img src={t.icon} alt="" style={{ width: 14, height: 14, borderRadius: '50%' }} />
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Rent + Deposit side by side */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={{ color: '#94a3b8', fontSize: 12, marginBottom: 4, display: 'block', fontWeight: 500 }}>
                Monthly Rent ({tokenMint})
              </label>
              <input type="number" value={rentAmount} onChange={(e) => setRentAmount(e.target.value)}
                placeholder="0" style={inputStyle} />
            </div>
            <div>
              <label style={{ color: '#94a3b8', fontSize: 12, marginBottom: 4, display: 'block', fontWeight: 500 }}>
                Deposit ({tokenMint})
              </label>
              <input type="number" value={depositAmount} onChange={(e) => setDepositAmount(e.target.value)}
                placeholder="0" style={inputStyle} />
            </div>
          </div>

          {/* Lease Period Calendar */}
          <div>
            <label style={{ color: '#94a3b8', fontSize: 12, marginBottom: 6, display: 'block', fontWeight: 500 }}>Lease Period</label>

            {/* Selected range display */}
            <div style={{
              display: 'flex', gap: 8, marginBottom: 10, alignItems: 'center',
            }}>
              <div style={{
                flex: 1, padding: '8px 12px', borderRadius: 8,
                background: selecting === 'start' ? 'rgba(61,214,140,0.08)' : '#0a0a0f',
                border: `1px solid ${selecting === 'start' ? 'rgba(61,214,140,0.3)' : 'rgba(255,255,255,0.1)'}`,
                cursor: 'pointer', textAlign: 'center',
              }} onClick={() => setSelecting('start')}>
                <p style={{ fontSize: 9, color: '#7A7A8A', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Start</p>
                <p style={{ fontSize: 13, color: startDate ? '#3DD68C' : '#5A5A6A', fontWeight: 600 }}>{formatSelected(startDate)}</p>
              </div>
              <span style={{ color: '#5A5A6A' }}>{'\u2192'}</span>
              <div style={{
                flex: 1, padding: '8px 12px', borderRadius: 8,
                background: selecting === 'end' ? 'rgba(224,120,64,0.08)' : '#0a0a0f',
                border: `1px solid ${selecting === 'end' ? 'rgba(224,120,64,0.3)' : 'rgba(255,255,255,0.1)'}`,
                cursor: 'pointer', textAlign: 'center',
              }} onClick={() => setSelecting('end')}>
                <p style={{ fontSize: 9, color: '#7A7A8A', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>End</p>
                <p style={{ fontSize: 13, color: endDate ? '#E07840' : '#5A5A6A', fontWeight: 600 }}>{formatSelected(endDate)}</p>
              </div>
            </div>

            <SelectableCalendar
              month={calendarMonth}
              onChangeMonth={setCalendarMonth}
              startDate={startDate}
              endDate={endDate}
              onDayClick={handleDayClick}
            />
          </div>

          {/* Sign Deadline */}
          <div>
            <label style={{ color: '#94a3b8', fontSize: 12, marginBottom: 4, display: 'block', fontWeight: 500 }}>Sign Deadline (days)</label>
            <input type="number" value={deadlineDays} onChange={(e) => setDeadlineDays(e.target.value)} style={inputStyle} />
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
          <button onClick={onClose} style={{
            flex: 1, padding: 10, background: 'transparent', color: '#94a3b8',
            border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 14, cursor: 'pointer',
            fontFamily: "'DM Sans',sans-serif",
          }}>Cancel</button>
          <button onClick={handleSubmit}
            disabled={!canSubmit}
            style={{
              flex: 1, padding: 10, background: '#E07840', color: '#fff',
              border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer',
              opacity: canSubmit ? 1 : 0.5, fontFamily: "'DM Sans',sans-serif",
            }}>
            {submitting ? 'Creating...' : 'Create Agreement'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Selectable Calendar ── */

interface SelectableCalendarProps {
  month: Date;
  onChangeMonth: (d: Date) => void;
  startDate: Date | null;
  endDate: Date | null;
  onDayClick: (d: Date) => void;
}

function SelectableCalendar({ month, onChangeMonth, startDate, endDate, onDayClick }: SelectableCalendarProps) {
  const year = month.getFullYear();
  const mo = month.getMonth();

  const firstDay = new Date(year, mo, 1);
  const startOffset = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(year, mo + 1, 0).getDate();

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const prevMonth = () => onChangeMonth(new Date(year, mo - 1, 1));
  const nextMonth = () => onChangeMonth(new Date(year, mo + 1, 1));
  const monthLabel = firstDay.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const isSameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

  const cells: { day: number; date: Date; past: boolean }[] = [];
  for (let i = 0; i < startOffset; i++) cells.push({ day: 0, date: new Date(0), past: true });
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, mo, d);
    cells.push({ day: d, date, past: date < today });
  }

  return (
    <div style={{
      background: '#0a0a0f', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)', padding: 12,
    }}>
      {/* Nav */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <button onClick={prevMonth} style={calNavBtn}>{'\u2190'}</button>
        <p style={{ fontWeight: 600, fontSize: 13, color: '#e2e8f0' }}>{monthLabel}</p>
        <button onClick={nextMonth} style={calNavBtn}>{'\u2192'}</button>
      </div>

      {/* Weekdays */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 4 }}>
        {WEEKDAYS.map(wd => (
          <div key={wd} style={{ textAlign: 'center', fontSize: 10, color: '#5A5A6A', fontWeight: 600 }}>{wd}</div>
        ))}
      </div>

      {/* Days */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
        {cells.map((c, i) => {
          if (c.day === 0) return <div key={`e-${i}`} />;

          const isStart = startDate && isSameDay(c.date, startDate);
          const isEnd = endDate && isSameDay(c.date, endDate);
          const inRange = startDate && endDate && c.date > startDate && c.date < endDate;
          const isToday = isSameDay(c.date, today);

          let bg = 'transparent';
          let color = c.past ? '#3A3A4A' : '#e2e8f0';
          let border = '1px solid transparent';
          let fontWeight = 500;

          if (isStart) {
            bg = 'rgba(61, 214, 140, 0.25)';
            color = '#3DD68C';
            border = '1px solid rgba(61,214,140,0.5)';
            fontWeight = 700;
          } else if (isEnd) {
            bg = 'rgba(224, 120, 64, 0.25)';
            color = '#E07840';
            border = '1px solid rgba(224,120,64,0.5)';
            fontWeight = 700;
          } else if (inRange) {
            bg = 'rgba(224, 120, 64, 0.08)';
            color = '#e2e8f0';
          } else if (isToday) {
            border = '1px solid rgba(255,255,255,0.2)';
          }

          return (
            <button
              key={c.day}
              onClick={() => !c.past && onDayClick(c.date)}
              disabled={c.past}
              style={{
                height: 32, borderRadius: 6, border, background: bg,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, fontWeight, color,
                cursor: c.past ? 'default' : 'pointer',
                transition: 'all 0.15s',
                padding: 0,
              }}
            >
              {c.day}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const calNavBtn: React.CSSProperties = {
  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 6, padding: '4px 10px', color: '#e2e8f0', fontSize: 12,
  cursor: 'pointer', fontFamily: "'DM Sans',sans-serif",
};
