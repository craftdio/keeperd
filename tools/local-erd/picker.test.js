import { expect, it } from 'vitest';
import { localCloneChoices } from './picker.js';

it('groups linked worktrees but preserves independent clones and the selected identity', () => {
    const main = { id: 'main', path: '/repo', commonDirectory: '/repo/.git' };
    const worktree = {
        id: 'linked',
        path: '/tmp/task',
        commonDirectory: '/repo/.git',
        linkedWorktree: true,
    };
    const clone = {
        id: 'clone',
        path: '/other',
        commonDirectory: '/other/.git',
    };
    expect(localCloneChoices([worktree, main, clone])).toEqual([main, clone]);
    expect(localCloneChoices([main, worktree, clone], 'linked')).toEqual([
        worktree,
        clone,
    ]);
});
