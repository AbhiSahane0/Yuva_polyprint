import { describe, expect, it } from 'vitest';
import { describeAgent, formatAgo, formatIst, renderMonitorPage } from './monitor-page.js';

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
        history: [],
        historyTotal: 0,
        historyLimit: 100,
      });

      expect(html).toContain('Sudeep Hase');
      expect(html).toContain('27 Aug 2026, 9:30 am');
      expect(html).toContain('Deactivated');
      expect(html).toContain('never signed in');
    });

    it('says plainly when nobody is signed in', () => {
      const html = renderMonitorPage({
        generatedAt,
        users: [],
        sessions: [],
        history: [],
        historyTotal: 0,
        historyLimit: 100,
      });

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
        history: [],
        historyTotal: 0,
        historyLimit: 100,
      });

      expect(html).not.toContain('<script>alert(1)</script>');
      expect(html).toContain('&lt;script&gt;');
    });
  });

  describe('describeAgent', () => {
    it('names the browser and the platform together', () => {
      expect(
        describeAgent(
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36',
        ),
      ).toBe('Chrome on Windows');
    });

    it('is not fooled by browsers that claim to be Chrome or Safari', () => {
      const edge =
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36 Edg/128.0';
      const safari =
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

      expect(describeAgent(edge)).toBe('Edge on Windows');
      expect(describeAgent(safari)).toBe('Safari on iOS');
    });

    it('says nothing rather than something wrong', () => {
      expect(describeAgent(null)).toBe('—');
      expect(describeAgent('some-internal-tool/1.0')).toBe('—');
    });
  });

  describe('sign-in history', () => {
    const generatedAt = new Date('2026-08-27T13:12:00Z');
    const base = { generatedAt, users: [], sessions: [] };

    it('lists each sign-in with where it came from', () => {
      const html = renderMonitorPage({
        ...base,
        history: [
          {
            username: 'sudeep',
            displayName: 'Sudeep Hase',
            at: new Date('2026-08-27T04:00:00Z'),
            ipAddress: '203.0.113.9',
            userAgent: 'Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/128.0 Safari/537.36',
            accountExists: true,
          },
        ],
        historyTotal: 1,
        historyLimit: 100,
      });

      expect(html).toContain('27 Aug 2026, 9:30 am');
      expect(html).toContain('203.0.113.9');
      expect(html).toContain('Chrome on Mac');
      expect(html).toContain('1 sign-in on record');
    });

    it('says when it is showing only a slice, and how to ask for more', () => {
      const html = renderMonitorPage({
        ...base,
        history: [
          {
            username: 'sudeep',
            displayName: 'Sudeep Hase',
            at: new Date('2026-08-27T04:00:00Z'),
            ipAddress: null,
            userAgent: null,
            accountExists: true,
          },
        ],
        historyTotal: 480,
        historyLimit: 1,
      });

      expect(html).toContain('Showing the 1 most recent of 480 sign-ins');
      expect(html).toContain('?limit=480');
    });

    it('marks a sign-in whose account has since been deleted', () => {
      const html = renderMonitorPage({
        ...base,
        history: [
          {
            username: 'gone',
            displayName: 'Former Staff',
            at: new Date('2026-08-27T04:00:00Z'),
            ipAddress: null,
            userAgent: null,
            accountExists: false,
          },
        ],
        historyTotal: 1,
        historyLimit: 100,
      });

      expect(html).toContain('Former Staff');
      expect(html).toContain('(account removed)');
    });

    it('says plainly when nothing has been recorded yet', () => {
      const html = renderMonitorPage({ ...base, history: [], historyTotal: 0, historyLimit: 100 });

      expect(html).toContain('No sign-ins recorded yet.');
    });
  });
});
