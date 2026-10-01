import type { AccountVerification } from '@/contracts/airwallex';

export interface VerificationView {
  label: string;
  tone: 'up' | 'warn' | 'down' | 'muted';
  /** Arming needs a confirmation, or the account blocks arming. */
  confirm: 'none' | 'confirm' | 'danger' | 'blocked';
}

export function verificationView(
  verification: AccountVerification | undefined,
): VerificationView {
  if (!verification) {
    return { label: 'Not verified', tone: 'muted', confirm: 'none' };
  }
  const name = verification.resolvedAccountName;
  if (verification.code === 'INVALID') {
    return { label: "Account doesn't exist", tone: 'down', confirm: 'blocked' };
  }
  if (verification.code !== 'VERIFIED') {
    return { label: 'Not verified', tone: 'muted', confirm: 'none' };
  }
  switch (verification.nameMatch) {
    case 'FULL_MATCH':
      return { label: 'Verified · name matches', tone: 'up', confirm: 'none' };
    case 'PARTIAL_MATCH':
    case 'FULL_MATCH_INCORRECT_TYPE':
    case 'PARTIAL_MATCH_INCORRECT_TYPE':
      return {
        label: name ? `Name partially matches: ${name}` : 'Name partially matches',
        tone: 'warn',
        confirm: 'confirm',
      };
    case 'NOT_MATCHED':
      return {
        label: name ? `Name doesn't match: ${name}` : "Name doesn't match",
        tone: 'down',
        confirm: 'danger',
      };
    default:
      return { label: 'Not verified', tone: 'muted', confirm: 'none' };
  }
}
