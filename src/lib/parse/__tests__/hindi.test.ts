import { analyze } from '..';
import { fromDevanagari } from '../hindi';

// Wednesday, 23 Sep 2026, 10:00 local.
const NOW = new Date(2026, 8, 23, 10, 0);

describe('Hindi and mixed Hindi–English', () => {
  it('reads a Hindi electricity bill', () => {
    const result = analyze({
      text: 'बिजली बिल\nउपभोक्ता संख्या: 1234567890\nबिल तिथि: 10 सितंबर 2026\nकुल देय राशि: रु. 2,840\nदेय तिथि: 28 सितंबर 2026',
      now: NOW,
    });
    expect(result).toMatchObject({ type: 'bill', fields: { amount: 2840, dueDate: '2026-09-28' } });
  });

  it('reads Devanagari digits', () => {
    const result = analyze({ text: 'पानी का बिल\nराशि: ₹ ६४०\nअंतिम तिथि: ०५/१०/२०२६', now: NOW });
    expect(result).toMatchObject({ type: 'bill', fields: { amount: 640, dueDate: '2026-10-05' } });
  });

  it('reads a mixed Hindi–English recharge reminder', () => {
    const result = analyze({ text: 'Jio Prepaid\nआपका plan 5 अक्टूबर 2026 को expire होगा।\nRecharge ₹299', now: NOW });
    expect(result.fields.dueDate ?? result.fields.expiresOn ?? result.fields.startsAt).toMatch(/^2026-10-05/);
    expect(result.fields.amount).toBe(299);
  });

  it('keeps names and titles in Hindi', () => {
    expect(fromDevanagari('बिजली बिल')).toBe('बिजली बिल');
    expect(fromDevanagari('भुगतान की अंतिम तिथि: १५ फ़रवरी')).toBe('Due Date: 15 February');
    // मई is only May next to a date.
    expect(fromDevanagari('12 मई 2027')).toBe('12 May 2027');
    expect(fromDevanagari('मई में मिलते हैं')).toBe('मई में मिलते हैं');
  });

  it('leaves English text untouched', () => {
    const text = 'Electricity Bill\nDue Date 28 Sep 2026';
    expect(fromDevanagari(text)).toBe(text);
  });
});

describe('Hindi deadline phrasing', () => {
  it('reorders date-before-verb phrases', () => {
    expect(fromDevanagari('5 अक्टूबर 2026 को expire होगा')).toBe('expires on 5 October 2026');
    expect(fromDevanagari('ऑफ़र ३० सितंबर तक वैध')).toBe('ऑफ़र valid till 30 September');
    expect(fromDevanagari('कृपया 10/10/2026 तक भुगतान करें')).toBe('कृपया pay by 10/10/2026 करें');
  });
});

describe('Devanagari OCR slips', () => {
  it('repairs a misread rupee sign and Bengali look-alike digits', () => {
    // As ML Kit's Devanagari model read the mixed Airtel fixture.
    const result = analyze({ text: 'Airtel Postpaid बिल\nACCount No: 778৪990011\nराशि श्४९९\nदेय तिथि ५ अक्टूबर २०२६', now: NOW });
    expect(result).toMatchObject({ type: 'bill', fields: { amount: 499, dueDate: '2026-10-05' } });
    expect(fromDevanagari('No: 778৪990011')).toBe('No: 7784990011');
  });
});

describe('Hindi bill as read on a device', () => {
  it('handles a visarga for a colon, a stray nasal mark and a Hindi title', () => {
    // Verbatim ML Kit output for e2e/fixtures/e2e-hindi-bill.png.
    const text =
      'बिजली बिल\nउपभोक्ता संख्या: 1234567890\nबिल तिथि: 10 सितंबर 2026\nकुल देय राशिः रु.2,840\nदेय तिथिः 28 सिंतंबर 2026\nकृपया समय पर भुगतान करें।';
    expect(analyze({ text, now: NOW })).toMatchObject({
      type: 'bill',
      title: 'बिजली बिल',
      fields: { amount: 2840, dueDate: '2026-09-28', purchasedOn: '2026-09-10' },
    });
  });
});
