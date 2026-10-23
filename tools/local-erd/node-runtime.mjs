export const requiredNodeVersion = '26.12.1';

export function assertNodeRuntime(version = process.versions.node) {
    if (version !== requiredNodeVersion)
        throw new Error(
            `KeepERD requires Node.js ${requiredNodeVersion}; found ${version}. Run nvm install && nvm use in the source checkout, or use the matching runtime before starting KeepERD.`
        );
}
