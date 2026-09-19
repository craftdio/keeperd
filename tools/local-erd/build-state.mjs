import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const buildMarker = (root) =>
    path.join(root, 'dist', '.keeperd-build.json');

export const sourceRevision = (root) => {
    try {
        return (
            execFileSync('git', ['rev-parse', 'HEAD'], {
                cwd: root,
                encoding: 'utf8',
                stdio: ['ignore', 'pipe', 'ignore'],
            }).trim() || null
        );
    } catch {
        return null;
    }
};

export const writeBuildMarker = (root, revision = sourceRevision(root)) => {
    mkdirSync(path.dirname(buildMarker(root)), { recursive: true });
    writeFileSync(
        buildMarker(root),
        JSON.stringify({ sourceRevision: revision }) + '\n'
    );
};

export const hasCurrentBuild = (root) => {
    if (!existsSync(path.join(root, 'dist', 'index.html'))) return false;
    try {
        const marker = JSON.parse(readFileSync(buildMarker(root), 'utf8'));
        return marker.sourceRevision === sourceRevision(root);
    } catch {
        return false;
    }
};
