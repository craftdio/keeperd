import { accessSync, constants } from 'node:fs';

export function nodeCommand(execPath = process.execPath) {
    try {
        accessSync(execPath, constants.X_OK);
        return execPath;
    } catch {
        // A long-running server can outlive a Homebrew Node upgrade. In that
        // case process.execPath still names the removed Cellar binary, while
        // the stable `node` link on PATH points at the newly installed version.
        return 'node';
    }
}
