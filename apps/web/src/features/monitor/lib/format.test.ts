import { describe, expect, it } from 'vitest';
import { describeAgent, formatAgo, formatIst, formatIstDay } from './format';

describe('sign-in log formatting', () => {
  describe('formatIst', () => {
    it('shifts UTC into India Standard Time', () => {
      // 13:12 UTC is 18:42 IST the same day.
      expect(formatIst('2026-08-27T13:12:00Z')).toBe('27 Aug 2026, 6:42 pm');
    });

    it('rolls over the date when IST is already the next day', () => {
      expect(formatIst('2026-08-27T20:30:00Z')).toBe('28 Aug 2026, 2:00 am');
    });

    it('shows midnight and noon as 12, not 0', () => {
      expect(formatIst('2026-08-27T18:30:00Z')).toBe('28 Aug 2026, 12:00 am');
      expect(formatIst('2026-08-27T06:30:00Z')).toBe('27 Aug 2026, 12:00 pm');
    });

    it('has nothing to show when nobody has signed in', () => {
      expect(formatIst(null)).toBe('—');
    });
  });

  describe('formatIstDay', () => {
    it('groups by the Indian day, not the UTC one', () => {
      expect(formatIstDay('2026-08-27T20:30:00Z')).toBe('28 Aug 2026');
      expect(formatIstDay('2026-08-27T13:12:00Z')).toBe('27 Aug 2026');
    });
  });

  describe('formatAgo', () => {
    const now = new Date('2026-08-27T12:00:00Z');

    it('describes the distance in the largest useful unit', () => {
      expect(formatAgo('2026-08-27T11:59:30Z', now)).toBe('just now');
      expect(formatAgo('2026-08-27T11:20:00Z', now)).toBe('40 min ago');
      expect(formatAgo('2026-08-27T09:00:00Z', now)).toBe('3 hr ago');
      expect(formatAgo('2026-08-26T09:00:00Z', now)).toBe('yesterday');
      expect(formatAgo('2026-08-24T09:00:00Z', now)).toBe('3 days ago');
    });

    it('says so when a user has never signed in', () => {
      expect(formatAgo(null, now)).toBe('never signed in');
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
});
