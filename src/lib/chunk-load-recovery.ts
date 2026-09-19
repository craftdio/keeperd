const CHUNK_LOAD_ERROR =
    /failed to fetch dynamically imported module|error loading dynamically imported module|importing a module script failed/i;

const RECOVERY_WINDOW_MS = 60_000;

export const chunkRecoveryKey = (pathname: string): string =>
    `chartdb:chunk-recovery:${pathname}`;

export const isChunkLoadError = (error: unknown): boolean => {
    const message =
        error instanceof Error
            ? `${error.name}: ${error.message}`
            : typeof error === 'string'
              ? error
              : String(error);

    return CHUNK_LOAD_ERROR.test(message ?? '');
};

export const claimChunkReload = ({
    pathname,
    storage,
    now = Date.now(),
}: {
    pathname: string;
    storage: Pick<Storage, 'getItem' | 'setItem'>;
    now?: number;
}): boolean => {
    try {
        const key = chunkRecoveryKey(pathname);
        const previous = Number(storage.getItem(key));

        if (Number.isFinite(previous) && now - previous < RECOVERY_WINDOW_MS) {
            return false;
        }

        storage.setItem(key, String(now));
        return true;
    } catch {
        return false;
    }
};
