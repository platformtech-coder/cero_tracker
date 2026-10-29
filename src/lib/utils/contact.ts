// ─── Contact sanitization and validation helpers ───────────────────
// Kept in a dedicated utility module so they are not treated as Next.js Server Actions.

export function isValidEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const clean = email.trim().toLowerCase();
  if (['-', '--', '.', 'none', 'n/a', 'na', 'nil', 'null', '0'].includes(clean)) return false;
  return clean.includes('@') && clean.includes('.');
}

export function isValidPhone(phone: string | null | undefined): boolean {
  if (!phone) return false;
  const digits = phone.replace(/[^0-9]/g, '');
  return digits.length >= 7;
}

export function sanitizeEmail(email: string | null | undefined): string | null {
  if (!isValidEmail(email)) return null;
  return email!.trim().toLowerCase();
}

export function sanitizePhone(phone: string | null | undefined): string | null {
  if (!isValidPhone(phone)) return null;
  return phone!.trim();
}

/**
 * Normalise a raw phone number string to the Ghana international format
 * (233XXXXXXXXX).  Returns an empty string if the input is blank or
 * cannot be parsed.
 *
 * Rules:
 *   - Already starts with "233"  → return as-is
 *   - Starts with "0"            → replace leading 0 with "233"
 *   - 9 digits (no country code) → prepend "233"
 *   - Otherwise                  → return the stripped digits unchanged
 */
export function normalisePhoneGH(raw?: string | null): string {
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('233')) return digits;
  if (digits.startsWith('0')) return '233' + digits.slice(1);
  if (digits.length === 9) return '233' + digits;
  return digits;
}

