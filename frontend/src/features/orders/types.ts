export type OrderStatus =
  | 'new'
  | 'rejected'
  | 'awaiting_deposit'
  | 'awaiting_signatures'
  | 'active'
  | 'disputed'
  | 'settled'
  | 'expired'
  | 'dispute_resolved_tenant'
  | 'dispute_resolved_landlord';

export interface Order {
  id: string;
  conversation_id: string;
  property_id: string;
  tenant_id: string;
  landlord_id: string;
  landlord_pk: string;
  tenant_pk: string;
  created_by: string;
  deposit_amount: number;
  rent_amount: number;
  token_mint: string;
  escrow_status: OrderStatus;
  escrow_address: string;
  tenant_signed: boolean;
  landlord_signed: boolean;
  sign_deadline: string;
  rent_start_date: string;
  rent_end_date: string;
  dispute_reason: string;
  created_at: string;
  updated_at: string;
  tenant_signed_onchain: boolean;
  landlord_signed_onchain: boolean;
}

export interface CreateOrderRequest {
  conversation_id: string;
  property_id: string;
  landlord_id: string;
  deposit_amount: number;
  rent_amount: number;
  token_mint: string;
  escrow_address: string;
  rent_start_date: string;
  rent_end_date: string;
  sign_deadline_minutes: number;
}

export interface OrderUpdateEvent {
  type: string;
  order_id: string;
  status: OrderStatus;
  order: Order;
}
