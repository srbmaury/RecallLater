import { lockEnabled, shouldRelock } from '../app-lock';

jest.mock('expo-local-authentication', () => ({}));

describe('app lock', () => {
  it('is off unless turned on', () => {
    expect(lockEnabled('on')).toBe(true);
    expect(lockEnabled('off')).toBe(false);
    expect(lockEnabled(null)).toBe(false);
  });

  it('allows a short trip out of the app', () => {
    expect(shouldRelock(null, 100_000)).toBe(false);
    expect(shouldRelock(100_000, 110_000)).toBe(false);
    expect(shouldRelock(100_000, 130_000)).toBe(true);
  });
});
