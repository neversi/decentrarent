import { useState, useEffect, useRef } from 'react';
import { useToastStore } from '../../toast/store';
import { useReleaseDeposit } from '../../escrow/hooks/useReleaseDeposit';
import { useOpenDispute } from '../../escrow/hooks/useOpenDispute';
import { usePayRent } from '../../escrow/hooks/usePayRent';
import { useExpireEscrow } from '../../escrow/hooks/useExpireEscrow';
import { getMagicActions, type MagicAction } from '../utils/getMagicActions';
import type { Order } from '../../orders/types';
import './MagicDog.css';

interface MagicDogButtonProps {
  orders: Order[];
  currentUserId: string;
  onActionComplete: () => void;
}

export function MagicDogButton({ orders, currentUserId, onActionComplete }: MagicDogButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState<string | null>(null);
  const [disputeAction, setDisputeAction] = useState<MagicAction | null>(null);
  const [disputeReason, setDisputeReason] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);

  const { addToast } = useToastStore();
  const { releaseDeposit } = useReleaseDeposit();
  const { openDispute } = useOpenDispute();
  const { payRent } = usePayRent();
  const { expireEscrow } = useExpireEscrow();

  const actions = getMagicActions(orders, currentUserId);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setDisputeAction(null);
        setDisputeReason('');
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
        setDisputeAction(null);
        setDisputeReason('');
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  const handleAction = async (action: MagicAction) => {
    if (action.actionType === 'open_dispute') {
      setDisputeAction(action);
      return;
    }

    setLoading(action.id);
    try {
      const { order } = action;

      switch (action.actionType) {
        case 'release_deposit':
          await releaseDeposit({
            landlordPubkey: order.landlord_id,
            tenantPubkey: order.tenant_id,
            orderId: order.id,
          });
          addToast({ variant: 'onchain', title: 'Deposit Released', message: 'Deposit returned to tenant' });
          break;

        case 'pay_rent':
          await payRent({
            landlordPubkey: order.landlord_pk,
            orderId: order.id,
            amountLamports: order.rent_amount,
          });
          addToast({ variant: 'onchain', title: 'Rent Paid', message: 'Transaction confirmed' });
          break;

        case 'expire_escrow':
          await expireEscrow({
            landlordPubkey: order.landlord_id,
            tenantPubkey: order.tenant_id,
            orderId: order.id,
          });
          addToast({ variant: 'onchain', title: 'Escrow Expired', message: 'Deposit refunded to tenant' });
          break;
      }

      onActionComplete();
      setIsOpen(false);
    } catch (err) {
      addToast({
        variant: 'error',
        title: 'Action failed',
        message: err instanceof Error ? err.message : 'Transaction failed',
      });
    } finally {
      setLoading(null);
    }
  };

  const handleDisputeSubmit = async () => {
    if (!disputeAction || !disputeReason.trim()) return;

    setLoading(disputeAction.id);
    try {
      const { order } = disputeAction;
      await openDispute({
        landlordPubkey: order.landlord_id,
        tenantPubkey: order.tenant_id,
        orderId: order.id,
        reason: disputeReason.trim(),
      });
      addToast({ variant: 'onchain', title: 'Dispute Opened', message: 'Deposit frozen pending resolution' });
      onActionComplete();
      setIsOpen(false);
      setDisputeAction(null);
      setDisputeReason('');
    } catch (err) {
      addToast({
        variant: 'error',
        title: 'Dispute failed',
        message: err instanceof Error ? err.message : 'Transaction failed',
      });
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="magic-dog-wrapper" ref={wrapperRef}>
      {isOpen && actions.length > 0 && (
        <div className="magic-dog-menu">
          <div className="magic-dog-menu-title">Quick Actions</div>
          {actions.map((action) => (
            <div key={action.id}>
              <button
                className={`magic-dog-action magic-dog-action--${action.variant}`}
                onClick={() => handleAction(action)}
                disabled={loading !== null}
              >
                <span className="magic-dog-action-icon">{action.icon}</span>
                <span className="magic-dog-action-label">{action.label}</span>
              </button>
              {disputeAction?.id === action.id && (
                <div className="magic-dog-dispute-input">
                  <input
                    type="text"
                    placeholder="Reason for dispute..."
                    value={disputeReason}
                    onChange={(e) => setDisputeReason(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleDisputeSubmit()}
                    autoFocus
                  />
                  <button
                    onClick={handleDisputeSubmit}
                    disabled={!disputeReason.trim() || loading !== null}
                  >
                    Send
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <button
        className="magic-dog-btn"
        onClick={() => {
          if (actions.length === 0) return;
          setIsOpen(!isOpen);
          if (isOpen) {
            setDisputeAction(null);
            setDisputeReason('');
          }
        }}
        title={actions.length > 0 ? 'Magic Dog - Quick Actions' : 'Woof!'}
      >
        <div className="dog-face">
          <div className="dog-ear-left" />
          <div className="dog-ear-right" />
          <div className="dog-head">
            <div className="dog-eye dog-eye-left" />
            <div className="dog-eye dog-eye-right" />
            <div className="dog-nose" />
            <div className="dog-mouth" />
          </div>
          <div className="dog-tail" />
        </div>
        {actions.length > 0 && <span className="dog-badge">{actions.length}</span>}
      </button>
    </div>
  );
}
