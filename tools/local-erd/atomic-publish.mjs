import { existsSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const removeIfPresent = (file, remove) => {
    try {
        if (existsSync(file)) remove(file);
    } catch {
        /* Cleanup must not hide the original publish failure. */
    }
};

export function publishFiles(
    entries,
    {
        rename = renameSync,
        remove = unlinkSync,
        write = writeFileSync,
        token = randomUUID(),
    } = {}
) {
    const files = entries.map(({ target, content }, index) => ({
        target,
        content,
        staged: `${target}.${token}.${index}.stage`,
        backup: `${target}.${token}.${index}.backup`,
        backedUp: false,
        published: false,
    }));

    try {
        for (const file of files)
            write(file.staged, file.content, { flag: 'wx' });
        for (const file of files) {
            if (!existsSync(file.target)) continue;
            rename(file.target, file.backup);
            file.backedUp = true;
        }
        for (const file of files) {
            rename(file.staged, file.target);
            file.published = true;
        }
    } catch (error) {
        for (const file of [...files].reverse()) {
            if (file.published) removeIfPresent(file.target, remove);
            if (file.backedUp && existsSync(file.backup))
                rename(file.backup, file.target);
            removeIfPresent(file.staged, remove);
        }
        throw error;
    }

    for (const file of files)
        if (file.backedUp) removeIfPresent(file.backup, remove);
}
