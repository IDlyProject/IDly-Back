export function maskEmail(email: string | null | undefined): string {
  if (!email) return 'unknown';

  const [localPart, domain] = email.split('@');
  if (!localPart || !domain) return 'masked-email';

  const visibleLocal =
    localPart.length <= 2
      ? `${localPart[0] ?? '*'}*`
      : `${localPart.slice(0, 2)}***`;

  return `${visibleLocal}@${domain}`;
}

export function gmailAccountLogRef(account: {
  id: string;
  email?: string | null;
}): string {
  return `gmailAccountId=${account.id}, email=${maskEmail(account.email)}`;
}
