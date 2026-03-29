import { apiFetch } from '../../lib/api';
import type { Property, CreatePropertyRequest, UpdatePropertyRequest } from './types';

export function listProperties(filters?: Record<string, string>, token?: string | null) {
  const params = new URLSearchParams(filters);
  const query = params.toString() ? `?${params.toString()}` : '';
  return apiFetch<Property[]>(`/properties${query}`, {}, token);
}

export function getProperty(id: string, token?: string | null) {
  return apiFetch<Property>(`/properties/${id}`, {}, token);
}

export function createProperty(data: CreatePropertyRequest, token: string) {
  return apiFetch<Property>('/properties', {
    method: 'POST',
    body: JSON.stringify(data),
  }, token);
}

export function updateProperty(id: string, data: UpdatePropertyRequest, token: string) {
  return apiFetch<Property>(`/properties/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  }, token);
}

export function deleteProperty(id: string, token: string) {
  return apiFetch<void>(`/properties/${id}`, { method: 'DELETE' }, token);
}

export function updatePropertyStatus(id: string, status: string, token: string) {
  return apiFetch<Property>(`/properties/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  }, token);
}

export function getUploadUrl(propertyId: string, fileName: string, token: string) {
  return apiFetch<{ upload_url: string; file_key: string }>(
    `/properties/${propertyId}/media/upload-url`,
    { method: 'POST', body: JSON.stringify({ file_name: fileName }) },
    token,
  );
}

export function registerMedia(propertyId: string, fileKey: string, token: string) {
  return apiFetch<{ id: string }>(
    `/properties/${propertyId}/media`,
    { method: 'POST', body: JSON.stringify({ file_key: fileKey }) },
    token,
  );
}

export function deleteMedia(propertyId: string, mediaId: string, token: string) {
  return apiFetch<void>(
    `/properties/${propertyId}/media/${mediaId}`,
    { method: 'DELETE' },
    token,
  );
}
