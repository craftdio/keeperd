import type { EntityTable } from 'dexie';

export interface LocalErdBackup {
    key: string;
    diagramId: string;
    value: string;
}

export const localErdBackupPrefixes = [
    'debut-erd-revision:',
    'debut-erd-backup:',
    'debut-repo-layout-migration:',
    'debut-repo-layout-backup:',
];

// Copy first, then release localStorage space. A failed copy leaves the original
// backups intact; an interrupted cleanup is safe to retry without overwriting.
export async function migrateLocalErdBackups(
    backups: EntityTable<LocalErdBackup, 'key'>,
    storage: Storage
) {
    const keys = Array.from({ length: storage.length }, (_, i) =>
        storage.key(i)
    )
        .filter((key): key is string => key !== null)
        .filter((key) => localErdBackupPrefixes.some((p) => key.startsWith(p)));
    for (const key of keys) {
        const value = storage.getItem(key);
        if (value === null) continue;
        const prefix = localErdBackupPrefixes.find((p) => key.startsWith(p))!;
        if (!(await backups.get(key)))
            await backups.put({
                key,
                diagramId: key.slice(prefix.length),
                value,
            });
        storage.removeItem(key);
    }
}
