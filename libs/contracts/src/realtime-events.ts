import { randomUUID } from 'crypto';

export const REALTIME_EXCHANGE = 'sushi.events';
export const ORDER_TRACK_SCOPE = 'order_track';

export type RealtimeResource = 'inventory' | 'catalog' | 'order' | 'identity';

export type RealtimeAction = 'CREATED' | 'UPDATED' | 'DELETED';

export interface RealtimeDomainEvent<T = Record<string, unknown>> {
  id: string;
  type: string;
  resource: RealtimeResource;
  action: RealtimeAction;
  branchId?: string | null;
  timestamp: string;
  payload: T;
}

export interface CreateRealtimeEventParams<T = Record<string, unknown>> {
  id?: string;
  type: string;
  resource: RealtimeResource;
  action: RealtimeAction;
  branchId?: string | null;
  timestamp?: string;
  payload: T;
}

export function createRealtimeEvent<T = Record<string, unknown>>(
  params: CreateRealtimeEventParams<T>,
): RealtimeDomainEvent<T> {
  return {
    id: params.id ?? randomUUID(),
    type: params.type,
    resource: params.resource,
    action: params.action,
    branchId: params.branchId !== undefined ? params.branchId : null,
    timestamp: params.timestamp ?? new Date().toISOString(),
    payload: params.payload,
  };
}
