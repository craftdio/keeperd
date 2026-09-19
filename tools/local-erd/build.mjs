import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { sourceRevision, writeBuildMarker } from './build-state.mjs';
const cwd = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const revision = sourceRevision(cwd);
for (const [script, args] of [
    ['typescript/bin/tsc', ['-b']],
    // Keep hashed files from previous builds. An already-open browser tab
    // can still request one of those lazy chunks after a rebuild finishes.
    ['vite/bin/vite.js', ['build', '--emptyOutDir', 'false']],
]) {
    execFileSync(
        process.execPath,
        [path.join(cwd, 'node_modules', script), ...args],
        {
            cwd,
            stdio: 'inherit',
            env: { ...process.env, VITE_LOCAL_ERD: 'true' },
        }
    );
}
writeBuildMarker(cwd, revision);
