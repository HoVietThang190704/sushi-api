import {
  REALTIME_EXCHANGE,
  RealtimeResource,
  RealtimeAction,
  RealtimeDomainEvent,
  createRealtimeEvent,
} from './index';
import * as contractsFromAlias from '@contracts';

describe('Realtime Events Contracts', () => {
  describe('Constants', () => {
    it('should have REALTIME_EXCHANGE set to "sushi.events"', () => {
      expect(REALTIME_EXCHANGE).toBe('sushi.events');
    });
  });

  describe('createRealtimeEvent', () => {
    it('should generate a valid event with auto-generated UUID and ISO timestamp', () => {
      const payload = { productId: 'p-1', name: 'Sake Sushi', price: 50000 };
      const event: RealtimeDomainEvent<typeof payload> = createRealtimeEvent({
        type: 'catalog.product.created',
        resource: 'catalog',
        action: 'CREATED',
        branchId: 'branch-101',
        payload,
      });

      expect(event).toBeDefined();
      expect(event.type).toBe('catalog.product.created');
      expect(event.resource).toBe('catalog');
      expect(event.action).toBe('CREATED');
      expect(event.branchId).toBe('branch-101');
      expect(event.payload).toEqual(payload);

      // Verify UUID v4 format
      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      expect(event.id).toMatch(uuidRegex);

      // Verify ISO timestamp
      expect(new Date(event.timestamp).toISOString()).toBe(event.timestamp);
      const now = Date.now();
      const eventTime = new Date(event.timestamp).getTime();
      expect(Math.abs(now - eventTime)).toBeLessThan(5000);
    });

    it('should preserve custom id and timestamp when explicitly provided', () => {
      const customId = 'custom-event-id-123';
      const customTimestamp = '2026-10-24T00:00:00.000Z';
      const payload = { ingredientId: 'ing-1', stock: 15 };

      const event = createRealtimeEvent({
        id: customId,
        timestamp: customTimestamp,
        type: 'inventory.stock.updated',
        resource: 'inventory',
        action: 'UPDATED',
        branchId: null,
        payload,
      });

      expect(event.id).toBe(customId);
      expect(event.timestamp).toBe(customTimestamp);
      expect(event.branchId).toBeNull();
      expect(event.resource).toBe('inventory');
      expect(event.action).toBe('UPDATED');
      expect(event.payload).toEqual(payload);
    });

    it('should handle optional branchId when omitted', () => {
      const event = createRealtimeEvent({
        type: 'identity.user.deleted',
        resource: 'identity',
        action: 'DELETED',
        payload: { userId: 'u-99' },
      });

      expect(event.branchId).toBeNull();
      expect(event.resource).toBe('identity');
      expect(event.action).toBe('DELETED');
    });

    it('should correctly support all RealtimeResource types', () => {
      const resources: RealtimeResource[] = ['inventory', 'catalog', 'order', 'identity'];
      resources.forEach((resource) => {
        const event = createRealtimeEvent({
          type: `${resource}.test`,
          resource,
          action: 'UPDATED',
          payload: {},
        });
        expect(event.resource).toBe(resource);
      });
    });

    it('should correctly support all RealtimeAction types', () => {
      const actions: RealtimeAction[] = ['CREATED', 'UPDATED', 'DELETED'];
      actions.forEach((action) => {
        const event = createRealtimeEvent({
          type: `order.${action.toLowerCase()}`,
          resource: 'order',
          action,
          payload: {},
        });
        expect(event.action).toBe(action);
      });
    });

    it('should be exportable and importable via @contracts alias', () => {
      expect(contractsFromAlias.REALTIME_EXCHANGE).toBe('sushi.events');
      expect(typeof contractsFromAlias.createRealtimeEvent).toBe('function');
    });
  });
});
