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
