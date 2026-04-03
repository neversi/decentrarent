import type { Order } from '../../orders/types';

export interface MagicAction {
  id: string;
  label: string;
  icon: string;
  orderId: string;
  order: Order;
  actionType: 'pay_rent' | 'release_deposit' | 'open_dispute' | 'expire_escrow';
  variant: 'primary' | 'danger' | 'warning';
}

const TERMINAL_STATUSES = ['rejected', 'expired', 'settled', 'dispute_resolved_tenant', 'dispute_resolved_landlord'];

export function getMagicActions(orders: Order[], currentUserId: string): MagicAction[] {
  const actions: MagicAction[] = [];

  for (const order of orders) {
    if (TERMINAL_STATUSES.includes(order.escrow_status)) continue;

    const isTenant = currentUserId === order.tenant_id;
    const isLandlord = currentUserId === order.landlord_id;

    if (order.escrow_status === 'active') {
      if (isLandlord) {
        actions.push({
          id: `release_deposit_${order.id}`,
          label: 'Return Deposit',
          icon: '\uD83D\uDCB0',
          orderId: order.id,
          order,
          actionType: 'release_deposit',
          variant: 'primary',
        });
      }

      if (isTenant) {
        actions.push({
          id: `pay_rent_${order.id}`,
          label: 'Pay Rent',
          icon: '\uD83C\uDFE0',
          orderId: order.id,
          order,
          actionType: 'pay_rent',
          variant: 'primary',
        });
      }

      if (isTenant || isLandlord) {
        actions.push({
          id: `open_dispute_${order.id}`,
          label: 'Open Dispute',
          icon: '\u26A0\uFE0F',
          orderId: order.id,
          order,
          actionType: 'open_dispute',
          variant: 'danger',
        });
      }
    }

    if (order.escrow_status === 'awaiting_signatures') {
      const deadlinePassed = new Date(order.sign_deadline).getTime() < Date.now();
      if (deadlinePassed && (isTenant || isLandlord)) {
        actions.push({
          id: `expire_escrow_${order.id}`,
          label: 'Expire Escrow',
          icon: '\u23F0',
          orderId: order.id,
          order,
          actionType: 'expire_escrow',
          variant: 'warning',
        });
      }
    }
  }

  return actions;
}
