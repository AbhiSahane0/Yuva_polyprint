import { describe, expect, it } from 'vitest';
import { formatAgo, formatIst, renderMonitorPage } from './monitor-page.js';

describe('monitor page', () => {
  describe('formatIst', () => {
    it('shifts UTC into India Standard Time', () => {
      // 13:12 UTC is 18:42 IST the same day.
      expect(formatIst(new Date('2026-08-27T13:12:00Z'))).toBe('27 Aug 2026, 6:42 pm');
    });

    it('rolls over the date when IST is already the next day', () => {
      expect(formatIst(new Date('2026-08-27T20:30:00Z'))).toBe('28 Aug 2026, 2:00 am');
    });

    it('shows midnight and noon as 12, not 0', () => {
      expect(formatIst(new Date('2026-08-27T18:30:00Z'))).toBe('28 Aug 2026, 12:00 am');
      expect(formatIst(new Date('2026-08-27T06:30:00Z'))).toBe('27 Aug 2026, 12:00 pm');
    });

    it('has no offset to apply when nobody has signed in', () => {
      expect(formatIst(null)).toBe('—');
    });
  });

  describe('formatAgo', () => {
    const now = new Date('2026-08-27T12:00:00Z');

    it('describes the distance in the largest useful unit', () => {
      expect(formatAgo(new Date('2026-08-27T11:59:30Z'), now)).toBe('just now');
      expect(formatAgo(new Date('2026-08-27T11:20:00Z'), now)).toBe('40 min ago');
      expect(formatAgo(new Date('2026-08-27T09:00:00Z'), now)).toBe('3 hr ago');
      expect(formatAgo(new Date('2026-08-26T09:00:00Z'), now)).toBe('yesterday');
      expect(formatAgo(new Date('2026-08-24T09:00:00Z'), now)).toBe('3 days ago');
    });

    it('says so when a user has never signed in', () => {
      expect(formatAgo(null, now)).toBe('never signed in');
    });
  });

  describe('renderMonitorPage', () => {
    const generatedAt = new Date('2026-08-27T13:12:00Z');

    it('lists users, their last sign-in and their open sessions', () => {
      const html = renderMonitorPage({
        generatedAt,
        users: [
          {
            username: 'sudeep',
            displayName: 'Sudeep Hase',
            isAdmin: true,
            isActive: true,
            lastLoginAt: new Date('2026-08-27T04:00:00Z'),
            activeSessions: 2,
          },
          {
            username: 'ravi',
            displayName: 'Ravi Kumar',
            isAdmin: false,
            isActive: false,
            lastLoginAt: null,
            activeSessions: 0,
          },
        ],
        sessions: [
          {
            username: 'sudeep',
            displayName: 'Sudeep Hase',
            signedInAt: new Date('2026-08-27T04:00:00Z'),
            lastSeenAt: new Date('2026-08-27T13:00:00Z'),
            expiresAt: new Date('2026-09-03T04:00:00Z'),
          },
        ],
      });

      expect(html).toContain('Sudeep Hase');
      expect(html).toContain('27 Aug 2026, 9:30 am');
      expect(html).toContain('Deactivated');
      expect(html).toContain('never signed in');
    });

    it('says plainly when nobody is signed in', () => {
      const html = renderMonitorPage({ generatedAt, users: [], sessions: [] });

      expect(html).toContain('Nobody is signed in.');
    });

    it('escapes a display name rather than letting it become markup', () => {
      const html = renderMonitorPage({
        generatedAt,
        users: [
          {
            username: 'x',
            displayName: '<script>alert(1)</script>',
            isAdmin: false,
            isActive: true,
            lastLoginAt: null,
            activeSessions: 0,
          },
        ],
        sessions: [],
      });

      expect(html).not.toContain('<script>alert(1)</script>');
      expect(html).toContain('&lt;script&gt;');
    });
  });
});
