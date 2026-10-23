import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { openWorkspace } from '../../tools/local-erd/workspace-store.mjs';
export function sqliteWorkspaceFixture() {
    const root = mkdtempSync(path.join(tmpdir(), 'keeperd-browser-sqlite-'));
    const store = openWorkspace(root, { warn: () => {} });
    return {
        store,
        close() {
            store.close();
            rmSync(root, { recursive: true, force: true });
        },
    };
}
