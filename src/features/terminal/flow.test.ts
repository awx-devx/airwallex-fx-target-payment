import { intakeModeFor, shortcutIntake, splitUploadFiles } from '@/features/terminal/flow';
import { describe, expect, it } from 'vitest';

describe('intakeModeFor', () => {
  it('reopens review for a draft and the target step for a ready bill', () => {
    expect(intakeModeFor('REVIEW', 'DRAFT', false)).toBe('arm');
    expect(intakeModeFor('EDIT', 'DRAFT', false)).toBe('arm');
    expect(intakeModeFor('EDIT_STRATEGY', 'READY', false)).toBe('arm');
    expect(intakeModeFor('ARM', 'READY', false)).toBe('arm');
    expect(intakeModeFor('ARM', 'READY', true)).toBeNull();
  });

  it('edits the target of a watching bill without arming again', () => {
    expect(intakeModeFor('EDIT_STRATEGY', 'WATCHING', true)).toBe('edit-target');
    expect(intakeModeFor('EDIT_STRATEGY', 'PAUSED', true)).toBe('edit-target');
    expect(shortcutIntake('WATCHING')).toBe('edit-target');
    expect(shortcutIntake('DRAFT')).toBeNull();
  });
});

describe('splitUploadFiles', () => {
  it('keeps pdfs and rejects the rest', () => {
    const split = splitUploadFiles([
      { name: 'a.pdf', type: 'application/pdf', size: 100 },
      { name: 'b.txt', type: 'text/plain', size: 10 },
      { name: 'c.png', type: 'image/png', size: 21 * 1024 * 1024 },
    ]);
    expect(split.accepted.map((file) => file.name)).toEqual(['a.pdf']);
    expect(split.rejected.map((file) => file.name)).toEqual(['b.txt', 'c.png']);
  });
});
