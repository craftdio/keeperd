import {
    readFile,
    writeFile,
    rename,
    unlink,
    rmdir,
    mkdtemp,
    lstat,
    realpath,
} from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export class LibraryError extends Error {
    constructor(code, message) {
        super(message);
        this.code = code;
    }
}
function fileFor(data, id) {
    if (typeof id !== 'string' || !/^debut-[a-zA-Z0-9_-]+$/.test(id))
        throw new LibraryError(
            'INVALID_DIAGRAM_ID',
            '저장된 ERD ID를 확인하세요.'
        );
    return path.join(data, `${id.slice(6)}.chartdb.json`);
}
async function manifest(data) {
    if ((await realpath(data)) !== path.resolve(data))
        throw new LibraryError(
            'INVALID_DATA_PATH',
            '스키마 저장 폴더의 경로를 확인하세요.'
        );
    return JSON.parse(
        await readFile(path.join(data, 'snapshots.json'), 'utf8')
    );
}
export async function listSaved(data, primaryUrl) {
    const payload = await manifest(data);
    const items = await Promise.all(
        payload.snapshots.map(async (s) => {
            const file = fileFor(data, s.diagram.id);
            let bytes = 0;
            try {
                const info = await lstat(file);
                if (info.isFile()) bytes = info.size;
            } catch (error) {
                if (error.code !== 'ENOENT') throw error;
            }
            return {
                id: s.diagram.id,
                name: s.diagram.name,
                branch: s.branch,
                repositoryUrl: s.repositoryUrl ?? primaryUrl,
                source: s.source,
                tables: s.tables,
                relationships: s.relationships,
                migrations: s.migrations,
                schemaSource: s.schemaSource,
                revision: s.revision,
                bytes,
            };
        })
    );
    return { items };
}
export async function deleteSaved(data, input) {
    if (
        !Array.isArray(input) ||
        !input.length ||
        input.length > 100 ||
        input.some((id) => typeof id !== 'string')
    )
        throw new LibraryError(
            'INVALID_SELECTION',
            '삭제할 ERD를 1~100개 선택하세요.'
        );
    const ids = [...new Set(input)];
    const payload = await manifest(data);
    const available = new Set(payload.snapshots.map((s) => s.diagram.id));
    const files = [];
    let bytes = 0;
    for (const id of ids) {
        const file = fileFor(data, id);
        if (!available.has(id))
            throw new LibraryError(
                'SELECTION_CHANGED',
                '목록이 변경됐습니다. 새로고침 후 다시 선택하세요.'
            );
        try {
            const info = await lstat(file);
            if (!info.isFile() || info.isSymbolicLink())
                throw new LibraryError(
                    'INVALID_SNAPSHOT_FILE',
                    '스키마 파일의 종류를 확인하세요.'
                );
            files.push(file);
            bytes += info.size;
        } catch (error) {
            if (error.code !== 'ENOENT') throw error;
        }
    }
    const staged = await mkdtemp(path.join(data, '.delete-'));
    const moved = [];
    const temporary = path.join(data, `.snapshots-${randomUUID()}.tmp`);
    try {
        for (const file of files) {
            await rename(file, path.join(staged, path.basename(file)));
            moved.push(file);
        }
        await writeFile(
            temporary,
            JSON.stringify({
                ...payload,
                snapshots: payload.snapshots.filter(
                    (s) => !ids.includes(s.diagram.id)
                ),
            })
        );
        await rename(temporary, path.join(data, 'snapshots.json'));
    } catch (error) {
        for (const file of moved.reverse())
            await rename(path.join(staged, path.basename(file)), file);
        await unlink(temporary).catch(() => {});
        await rmdir(staged);
        throw error;
    }
    let cleanupPending = false;
    for (const file of moved) {
        try {
            await unlink(path.join(staged, path.basename(file)));
        } catch {
            cleanupPending = true;
        }
    }
    try {
        await rmdir(staged);
    } catch {
        cleanupPending = true;
    }
    return {
        deleted: ids,
        releasedBytes: cleanupPending ? 0 : bytes,
        cleanupPending,
    };
}
