import Dexie, { type EntityTable } from 'dexie';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { afterEach, expect, it, vi } from 'vitest';
import {
    migrateLocalErdBackups,
    type LocalErdBackup,
} from './local-erd-backups';

afterEach(() => vi.restoreAllMocks());

it('keeps the legacy backup when copying fails and preserves newer backups on retry', async () => {
    Dexie.dependencies.indexedDB = new IDBFactory();
    Dexie.dependencies.IDBKeyRange = IDBKeyRange;
    const db = new Dexie('backups-test') as Dexie & {
        backups: EntityTable<LocalErdBackup, 'key'>;
    };
    db.version(1).stores({ backups: 'key, diagramId' });
    localStorage.clear();
    const key = 'debut-erd-backup:develop';
    localStorage.setItem(key, 'original');
    const write = vi
        .spyOn(db.backups, 'put')
        .mockRejectedValueOnce(new Error('Disk full'));
    await expect(
        migrateLocalErdBackups(db.backups, localStorage)
    ).rejects.toThrow('Disk full');
    expect(localStorage.getItem(key)).toBe('original');
    expect(await db.backups.get(key)).toBeUndefined();
    write.mockRestore();
    await db.backups.put({ key, diagramId: 'develop', value: 'newer backup' });
    await migrateLocalErdBackups(db.backups, localStorage);
    expect((await db.backups.get(key))?.value).toBe('newer backup');
    expect(localStorage.getItem(key)).toBeNull();
    db.close();
});
