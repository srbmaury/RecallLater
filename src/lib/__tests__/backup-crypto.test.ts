import { isSealed, openBackup, passphraseProblem, sealBackup, WrongPassphraseError } from '../backup-crypto';

// No native module in tests: exercise the JS fallback, which must derive the same key.
jest.mock('../../../modules/recall-native', () => ({ __esModule: true, default: {} }));

type MockWebCrypto = {
  getRandomValues(array: Uint8Array): Uint8Array;
  subtle: {
    importKey(format: string, key: Uint8Array, algorithm: string, extractable: boolean, uses: string[]): Promise<unknown>;
    encrypt(algorithm: object, key: unknown, data: Uint8Array): Promise<ArrayBuffer>;
    decrypt(algorithm: object, key: unknown, data: Uint8Array): Promise<ArrayBuffer>;
  };
};

// expo-crypto's AES is native; stand in Web Crypto's AES-GCM, which uses the same
// combined layout (12-byte IV, ciphertext, 16-byte tag). The real module runs on a device.
jest.mock('expo-crypto', () => {
  const web = (globalThis as unknown as { crypto: MockWebCrypto }).crypto;
  const keyOf = (bytes: Uint8Array) => web.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
  const sealed = (raw: Uint8Array) => ({ raw, combined: async () => btoa(String.fromCharCode(...raw)) });
  return {
    getRandomBytes: (n: number) => web.getRandomValues(new Uint8Array(n)),
    AESEncryptionKey: { import: async (bytes: Uint8Array) => ({ bytes }) },
    AESSealedData: { fromCombined: (bytes: Uint8Array) => sealed(bytes) },
    aesEncryptAsync: async (plain: Uint8Array, key: { bytes: Uint8Array }) => {
      const iv = web.getRandomValues(new Uint8Array(12));
      const body = new Uint8Array(await web.subtle.encrypt({ name: 'AES-GCM', iv }, await keyOf(key.bytes), plain));
      const out = new Uint8Array(12 + body.length);
      out.set(iv);
      out.set(body, 12);
      return sealed(out);
    },
    aesDecryptAsync: async (data: { raw: Uint8Array }, key: { bytes: Uint8Array }) =>
      new Uint8Array(await web.subtle.decrypt({ name: 'AES-GCM', iv: data.raw.subarray(0, 12) }, await keyOf(key.bytes), data.raw.subarray(12))),
  };
});

describe('passphrase-protected backups', () => {
  const json = JSON.stringify({ app: 'recalllater', items: [{ title: 'बिजली बिल', amount: '₹2,840' }] });

  it('round-trips, including non-English text', async () => {
    const sealed = await sealBackup(json, 'correct horse battery');
    expect(isSealed(sealed)).toBe(true);
    expect(sealed).not.toContain('2,840');
    expect(JSON.parse(await openBackup(sealed, 'correct horse battery'))).toEqual(JSON.parse(json));
  }, 30_000);

  it('rejects a wrong passphrase', async () => {
    const sealed = await sealBackup(json, 'correct horse battery');
    await expect(openBackup(sealed, 'wrong horse battery')).rejects.toBeInstanceOf(WrongPassphraseError);
  }, 30_000);

  it('tells plain and sealed backups apart', () => {
    expect(isSealed(json)).toBe(false);
    expect(isSealed('not json')).toBe(false);
    expect(passphraseProblem('short')).toMatch(/8 characters/);
    expect(passphraseProblem('long enough')).toBeNull();
  });
});
