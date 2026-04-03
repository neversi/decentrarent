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

export function listOrdersByConversation(conversationId: string, token: string): Promise<Order[]> {
  return apiFetch<Order[]>(`/orders?conversation_id=${encodeURIComponent(conversationId)}`, {}, token);
}

export function getOrder(orderId: string, token: string): Promise<Order> {
  return apiFetch<Order>(`/orders/${orderId}`, {}, token);
}

export function listOrdersByProperty(propertyId: string, token: string): Promise<Order[]> {
  return apiFetch<Order[]>(`/orders?property_id=${encodeURIComponent(propertyId)}`, {}, token);
}
