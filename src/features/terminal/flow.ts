import type { BillState } from '@/contracts/bill';

export type IntakeMode = 'arm' | 'edit-target';

const ACCEPTED = new Set(['application/pdf', 'image/png', 'image/jpeg', 'image/jpg']);
const MAX_BYTES = 20 * 1024 * 1024;

export function intakeModeFor(
  action: string,
  state: BillState,
  hasTarget: boolean,
): IntakeMode | null {
  if (action === 'REVIEW' || action === 'EDIT') return 'arm';
  if (action === 'ARM' && !hasTarget) return 'arm';
  if (action === 'EDIT_STRATEGY') {
    return state === 'WATCHING' || state === 'PAUSED' ? 'edit-target' : 'arm';
  }
  return null;
}

/** `t` edits the target. A draft still has to be reviewed first. */
export function shortcutIntake(state: BillState): IntakeMode | null {
  if (state === 'WATCHING' || state === 'PAUSED') return 'edit-target';
  if (state === 'READY') return 'edit-target';
  return null;
}

export function splitUploadFiles(files: readonly { name: string; type: string; size: number }[]): {
  accepted: { name: string; type: string; size: number }[];
  rejected: { name: string; message: string }[];
} {
  const accepted: { name: string; type: string; size: number }[] = [];
  const rejected: { name: string; message: string }[] = [];
  for (const file of files) {
    const mime = file.type || mimeFromName(file.name);
    if (!ACCEPTED.has(mime)) {
      rejected.push({ name: file.name, message: `${file.name} must be a PDF, PNG, or JPG` });
      continue;
    }
    if (file.size === 0 || file.size > MAX_BYTES) {
      rejected.push({ name: file.name, message: `${file.name} must be under 20 MB` });
      continue;
    }
    accepted.push(file);
  }
  return { accepted, rejected };
}

function mimeFromName(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  return '';
}
