import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../..'
);

const versionPattern =
    /^\d+\.\d+\.\d+(?:-[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?(?:\+[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?$/;

export function parseKeeperdVersion(version) {
    if (!versionPattern.test(version ?? ''))
        throw new Error(
            'KeepERD version must be a SemVer value without a leading v, for example 0.1.0.'
        );
    return version;
}

export function readKeeperdVersion(projectRoot = root) {
    const source = path.join(projectRoot, 'KEEPERD_VERSION');
    if (!existsSync(source))
        throw new Error(`KeepERD version file is missing: ${source}`);
    return parseKeeperdVersion(readFileSync(source, 'utf8').trim());
}

export function assertKeeperdVersion(expectedVersion, projectRoot = root) {
    const version = readKeeperdVersion(projectRoot);
    if (expectedVersion === undefined) return version;

    const expected = parseKeeperdVersion(expectedVersion);
    if (expected !== version)
        throw new Error(
            `KeepERD release version ${expected} does not match KEEPERD_VERSION ${version}.`
        );
    return version;
}
