import { buildDigest, digestTimeOf } from '../digest';

const day = new Date(2026, 8, 28, 8, 30);
const on = (d: number, h = 12) => new Date(2026, 8, d, h).getTime();

describe('morning digest', () => {
  it('lists what is due that day', () => {
    expect(buildDigest([{ title: 'Electricity Bill', dueAt: on(28) }, { title: 'Rent', dueAt: on(28, 23) }], day)).toEqual({
      title: '2 things today',
      body: 'Electricity Bill · Rent',
    });
  });

  it('puts overdue items first and says so', () => {
    expect(buildDigest([{ title: 'Rent', dueAt: on(28) }, { title: 'Water bill', dueAt: on(25) }], day)).toEqual({
      title: '1 due today, 1 overdue',
      body: 'Water bill · Rent',
    });
  });

  it('caps the names shown', () => {
    const items = ['A', 'B', 'C', 'D', 'E'].map((title) => ({ title, dueAt: on(28) }));
    expect(buildDigest(items, day)?.body).toBe('A · B · C · +2 more');
  });

  it('stays quiet when nothing is due', () => {
    expect(buildDigest([{ title: 'Later', dueAt: on(30) }, { title: 'Someday', dueAt: null }], day)).toBeNull();
  });

  it('reads the stored setting', () => {
    expect(digestTimeOf('08:30')).toBe('08:30');
    expect(digestTimeOf('off')).toBeNull();
    expect(digestTimeOf(null)).toBeNull();
  });
});
