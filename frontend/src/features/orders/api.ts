import { apiFetch } from '../../lib/api';
import type { Order, CreateOrderRequest } from './types';

export function createOrder(data: CreateOrderRequest, token: string): Promise<Order> {
  return apiFetch<Order>('/orders', {
    method: 'POST',
    body: JSON.stringify(data),
  }, token);
}

export function acceptOrder(orderId: string, token: string): Promise<Order> {
  return apiFetch<Order>(`/orders/${orderId}/accept`, {
    method: 'POST',
  }, token);
}

export function rejectOrder(orderId: string, token: string): Promise<Order> {
  return apiFetch<Order>(`/orders/${orderId}/reject`, {
    method: 'POST',
  }, token);
}

interface OrdersListResponse {
  orders: Order[]
  sol_price_usdt: number
  price_updated_at: string
}

export function listOrdersByConversation(conversationId: string, token: string): Promise<Order[]> {
  return apiFetch<OrdersListResponse>(`/orders?conversation_id=${encodeURIComponent(conversationId)}`, {}, token)
    .then(res => res.orders ?? []);
}

export function getOrder(orderId: string, token: string): Promise<Order> {
  return apiFetch<Order>(`/orders/${orderId}`, {}, token);
}

export function listOrdersByProperty(propertyId: string, token: string): Promise<Order[]> {
  return apiFetch<OrdersListResponse>(`/orders?property_id=${encodeURIComponent(propertyId)}`, {}, token)
    .then(res => res.orders ?? []);
}

export function listDisputedOrders(token: string): Promise<Order[]> {
  return apiFetch<Order[]>('/admin/orders/disputed', {}, token);
}

export function resolveDispute(orderId: string, winner: 'tenant' | 'landlord', reason: string, token: string): Promise<void> {
  return apiFetch<void>(`/admin/orders/${orderId}/resolve`, {
    method: 'POST',
    body: JSON.stringify({ winner, reason }),
  }, token);
}
