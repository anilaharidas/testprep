import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';

export const nowIso = () => new Date().toISOString();
export const isoIn = (ms) => new Date(Date.now() + ms).toISOString();
export const isPast = (iso) => iso != null && new Date(iso).getTime() <= Date.now();

export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('hex');

export const numericCode = (length) => {
  let code = '';
  for (let i = 0; i < length; i += 1) code += crypto.randomInt(0, 10).toString();
  return code;
};

// Known country codes in the client's picker, longest first, so we can strip the
// dialing code and recover the national number the user actually typed.
const COUNTRY_CODES = ['971', '65', '91', '61', '44', '1'];

export const nationalDigits = (normalizedPhone) => {
  const digits = String(normalizedPhone || '').replace(/\D/g, '');
  for (const cc of COUNTRY_CODES) {
    if (digits.startsWith(cc)) return digits.slice(cc.length);
  }
  return digits;
};

/**
 * Deterministic OTP from the phone number: OTP = (N * mulA + addB) mod 10^length,
 * where N is the national number the user entered. Zero-padded to `length`.
 */
export const formulaCode = (normalizedPhone, { mulA, addB }, length) => {
  const n = Number(nationalDigits(normalizedPhone)) || 0;
  const mod = 10 ** length;
  const value = ((n * mulA + addB) % mod + mod) % mod;
  return String(value).padStart(length, '0');
};

export const hash = (value) => bcrypt.hashSync(value, 10);
export const verifyHash = (value, digest) => {
  try {
    return bcrypt.compareSync(value, digest);
  } catch {
    return false;
  }
};

// Normalize a WhatsApp number to "+<digits>". Expects a country code.
export const normalizePhone = (raw) => {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  const digits = trimmed.replace(/[^\d]/g, '');
  if (digits.length < 8 || digits.length > 15) return null;
  return `+${digits}`;
};

export class ApiError extends Error {
  constructor(status, code, message, extra = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}
