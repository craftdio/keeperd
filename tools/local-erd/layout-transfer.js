const FORMAT = 'keeperd-repository-layout';
const VERSION = 1;
const BACKUP_PREFIX = 'debut-layout-backup:';
const MAX_TABLES = 10000;
const MAX_AREAS = 1000;
const MAX_NOTES = 1000;

const canonicalRepository = (url) =>
    String(url ?? '')
        .toLowerCase()
        .replace(/\.git$/, '');
const tableKey = (table) => `${table.schema ?? ''}\u0000${table.name}`;
const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const nullableFinite = (value) => value === null || finite(value);
const request = (value) =>
    new Promise((resolve, reject) => {
        value.onsuccess = () => resolve(value.result);
        value.onerror = () => reject(value.error);
    });
const complete = (tx) =>
    new Promise((resolve, reject) => {
        tx.oncomplete = resolve;
        tx.onabort = () =>
            reject(tx.error ?? new Error('브라우저 DB 작업이 취소됐습니다.'));
        tx.onerror = () => {};
    });

async function open() {
    if (!globalThis.indexedDB)
        throw new Error('이 브라우저에서 IndexedDB에 접근할 수 없습니다.');
    return new Promise((resolve, reject) => {
        const result = indexedDB.open('ChartDB');
        let absent = false;
        result.onupgradeneeded = (event) => {
            if (event.oldVersion === 0) {
                absent = true;
                result.transaction.abort();
            }
        };
        result.onsuccess = () => resolve(result.result);
        result.onerror = () =>
            absent
                ? reject(new Error('먼저 ERD를 열어 작업 데이터를 생성하세요.'))
                : reject(result.error);
        result.onblocked = () =>
            reject(new Error('다른 ChartDB 탭을 닫고 다시 시도하세요.'));
    });
}

function sourceOf(snapshot, primaryUrl = '') {
    const revision = snapshot?.revision ?? '';
    return {
        repositoryUrl: snapshot?.repositoryUrl ?? primaryUrl,
        branch: snapshot?.branch ?? '',
        commit: snapshot?.source?.commit ?? revision.split(':')[0],
        revision,
        basis:
            snapshot?.source?.kind === 'local'
                ? snapshot.source.mode === 'worktree'
                    ? 'local-worktree'
                    : 'local-commit'
                : 'github-remote',
    };
}

export function snapshotLayoutSource(snapshot, primaryUrl = '') {
    const source = sourceOf(snapshot, primaryUrl);
    if (
        !canonicalRepository(source.repositoryUrl) ||
        !source.branch ||
        !source.commit
    )
        throw new Error(
            '현재 ERD의 레포·브랜치·커밋 정보를 확인할 수 없습니다. 먼저 Sync하세요.'
        );
    return source;
}

function validateSource(source) {
    if (
        !source ||
        typeof source.repositoryUrl !== 'string' ||
        typeof source.branch !== 'string' ||
        typeof source.commit !== 'string' ||
        !source.repositoryUrl ||
        !source.branch ||
        !source.commit
    )
        throw new Error('작업 데이터 JSON의 출처 정보가 올바르지 않습니다.');
}

function validateRepository(repository) {
    if (
        !repository ||
        typeof repository.url !== 'string' ||
        !canonicalRepository(repository.url)
    )
        throw new Error('작업 데이터 JSON의 레포 정보가 올바르지 않습니다.');
}

function validateLayout(layout) {
    if (
        !layout ||
        !Array.isArray(layout.tables) ||
        !Array.isArray(layout.areas) ||
        !Array.isArray(layout.notes) ||
        layout.tables.length > MAX_TABLES ||
        layout.areas.length > MAX_AREAS ||
        layout.notes.length > MAX_NOTES
    )
        throw new Error('작업 데이터 JSON의 항목 수가 올바르지 않습니다.');
    const tableKeys = new Set();
    for (const table of layout.tables) {
        if (
            !table ||
            (table.schema !== null &&
                table.schema !== undefined &&
                typeof table.schema !== 'string') ||
            typeof table.name !== 'string' ||
            !table.name ||
            !finite(table.x) ||
            !finite(table.y) ||
            typeof table.color !== 'string' ||
            !nullableFinite(table.width) ||
            (table.expanded !== null && typeof table.expanded !== 'boolean') ||
            !nullableFinite(table.order) ||
            (table.parentAreaKey !== null &&
                typeof table.parentAreaKey !== 'string')
        )
            throw new Error(
                '작업 데이터 JSON의 테이블 배치가 올바르지 않습니다.'
            );
        const key = tableKey(table);
        if (tableKeys.has(key))
            throw new Error('작업 데이터 JSON에 중복 테이블이 있습니다.');
        tableKeys.add(key);
    }
    const areaKeys = new Set();
    for (const area of layout.areas) {
        if (
            !area ||
            typeof area.key !== 'string' ||
            !area.key ||
            typeof area.name !== 'string' ||
            !finite(area.x) ||
            !finite(area.y) ||
            !finite(area.width) ||
            !finite(area.height) ||
            typeof area.color !== 'string' ||
            !nullableFinite(area.order) ||
            areaKeys.has(area.key)
        )
            throw new Error(
                '작업 데이터 JSON의 Area 정보가 올바르지 않습니다.'
            );
        areaKeys.add(area.key);
    }
    for (const note of layout.notes)
        if (
            !note ||
            typeof note.content !== 'string' ||
            note.content.length > 100000 ||
            !finite(note.x) ||
            !finite(note.y) ||
            !finite(note.width) ||
            !finite(note.height) ||
            typeof note.color !== 'string' ||
            !nullableFinite(note.order)
        )
            throw new Error(
                '작업 데이터 JSON의 메모 정보가 올바르지 않습니다.'
            );
    for (const table of layout.tables)
        if (table.parentAreaKey !== null && !areaKeys.has(table.parentAreaKey))
            throw new Error(
                '작업 데이터 JSON의 테이블 Area 연결이 올바르지 않습니다.'
            );
}

export function parseLayoutPackage(value) {
    const input = typeof value === 'string' ? JSON.parse(value) : value;
    if (input?.format !== FORMAT || input?.version !== VERSION)
        throw new Error('지원하지 않는 작업 데이터 JSON 형식입니다.');
    validateRepository(input.repository);
    validateLayout(input.layout);
    return input;
}

export function checkLayoutCompatibility(input, targetSource) {
    const layoutPackage = parseLayoutPackage(input);
    validateSource(targetSource);
    const sameRepository =
        canonicalRepository(layoutPackage.repository.url) ===
        canonicalRepository(targetSource.repositoryUrl);
    return {
        compatible: sameRepository,
        sameRepository,
        counts: {
            tables: layoutPackage.layout.tables.length,
            areas: layoutPackage.layout.areas.length,
            notes: layoutPackage.layout.notes.length,
        },
        repository: layoutPackage.repository,
    };
}

async function readDiagramRows(db, diagramId) {
    const required = ['diagrams', 'db_tables', 'areas', 'notes'];
    if (required.some((name) => !db.objectStoreNames.contains(name)))
        throw new Error('ChartDB 작업 데이터 저장소를 찾을 수 없습니다.');
    const tx = db.transaction(required, 'readonly');
    const done = complete(tx);
    const [diagram, tables, areas, notes] = await Promise.all([
        request(tx.objectStore('diagrams').get(diagramId)),
        request(tx.objectStore('db_tables').getAll()),
        request(tx.objectStore('areas').getAll()),
        request(tx.objectStore('notes').getAll()),
    ]);
    await done;
    if (!diagram) throw new Error('현재 ERD 작업 데이터를 찾을 수 없습니다.');
    return {
        diagram,
        tables: tables.filter((row) => row.diagramId === diagramId),
        areas: areas.filter((row) => row.diagramId === diagramId),
        notes: notes.filter((row) => row.diagramId === diagramId),
    };
}

function createPackage(source, rows) {
    validateSource(source);
    const areaKeys = new Map(
        rows.areas.map((area, index) => [area.id, `area-${index + 1}`])
    );
    const layoutPackage = {
        format: FORMAT,
        version: VERSION,
        exportedAt: new Date().toISOString(),
        repository: { url: source.repositoryUrl },
        layout: {
            tables: rows.tables.map((table) => ({
                schema: table.schema ?? null,
                name: table.name,
                x: table.x,
                y: table.y,
                color: table.color,
                width: table.width ?? null,
                expanded: table.expanded ?? null,
                order: table.order ?? null,
                parentAreaKey: areaKeys.get(table.parentAreaId) ?? null,
            })),
            areas: rows.areas.map((area) => ({
                key: areaKeys.get(area.id),
                name: area.name,
                x: area.x,
                y: area.y,
                width: area.width,
                height: area.height,
                color: area.color,
                order: area.order ?? null,
            })),
            notes: rows.notes.map((note) => ({
                content: note.content,
                x: note.x,
                y: note.y,
                width: note.width,
                height: note.height,
                color: note.color,
                order: note.order ?? null,
            })),
        },
    };
    return parseLayoutPackage(layoutPackage);
}

function createRepositoryPackage(source, stored) {
    validateSource(source);
    const areas = Array.isArray(stored.areas) ? stored.areas : [];
    const areaKeys = new Map(
        areas.map((area, index) => [area.id, `area-${index + 1}`])
    );
    const tables = Object.entries(stored.tables ?? {}).flatMap(
        ([key, position]) => {
            try {
                const [schema, name] = JSON.parse(key);
                if (typeof name !== 'string' || !name) return [];
                return [
                    {
                        schema: schema || null,
                        name,
                        x: position.x,
                        y: position.y,
                        color: position.color,
                        width: position.width ?? null,
                        expanded: position.expanded ?? null,
                        order: position.order ?? null,
                        parentAreaKey:
                            areaKeys.get(position.parentAreaId) ?? null,
                    },
                ];
            } catch {
                return [];
            }
        }
    );
    return parseLayoutPackage({
        format: FORMAT,
        version: VERSION,
        exportedAt: new Date().toISOString(),
        repository: { url: source.repositoryUrl },
        layout: {
            tables,
            areas: areas.map((area) => ({
                key: areaKeys.get(area.id),
                name: area.name,
                x: area.x,
                y: area.y,
                width: area.width,
                height: area.height,
                color: area.color,
                order: area.order ?? null,
            })),
            notes: (stored.notes ?? []).map((note) => ({
                content: note.content,
                x: note.x,
                y: note.y,
                width: note.width,
                height: note.height,
                color: note.color,
                order: note.order ?? null,
            })),
        },
    });
}

function repositoryLayout(source, layout) {
    return {
        version: 2,
        id: canonicalRepository(source.repositoryUrl),
        tables: Object.fromEntries(
            layout.tables.map((table) => [
                JSON.stringify([table.schema ?? '', table.name]),
                {
                    x: table.x,
                    y: table.y,
                    color: table.color,
                    width: table.width,
                    expanded: table.expanded,
                    order: table.order,
                    parentAreaId: table.parentAreaKey ?? undefined,
                },
            ])
        ),
        areas: layout.areas.map(({ key, ...area }) => ({ ...area, id: key })),
        notes: layout.notes.map((note, index) => ({
            ...note,
            id: `note-${index + 1}`,
        })),
    };
}

export async function exportLayoutPackage(diagramId, source) {
    const db = await open();
    try {
        if (db.objectStoreNames.contains('repository_layouts')) {
            const tx = db.transaction('repository_layouts', 'readonly');
            const stored = await request(
                tx
                    .objectStore('repository_layouts')
                    .get(canonicalRepository(source.repositoryUrl))
            );
            if (stored?.version === 2)
                return createRepositoryPackage(source, stored);
        }
        return createPackage(source, await readDiagramRows(db, diagramId));
    } finally {
        db.close();
    }
}

const id = (prefix) =>
    `${prefix}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;

export async function applyLayoutPackage(
    diagramId,
    targetSource,
    input,
    { createBackup = true } = {}
) {
    const layoutPackage = parseLayoutPackage(input);
    const compatibility = checkLayoutCompatibility(layoutPackage, targetSource);
    if (!compatibility.compatible)
        throw new Error('현재 ERD와 레포가 다릅니다.');
    const db = await open();
    try {
        const current = await readDiagramRows(db, diagramId);
        if (createBackup) {
            try {
                localStorage.setItem(
                    `${BACKUP_PREFIX}${diagramId}`,
                    JSON.stringify(createPackage(targetSource, current))
                );
            } catch {
                throw new Error(
                    '브라우저 저장소에 기존 작업 데이터 백업을 저장하지 못했습니다.'
                );
            }
        }
        const importedTables = new Map(
            layoutPackage.layout.tables.map((table) => [tableKey(table), table])
        );
        const areaIds = new Map(
            layoutPackage.layout.areas.map((area) => [
                area.key,
                id('layout-area'),
            ])
        );
        let matched = 0;
        const tables = current.tables.map((table) => {
            const imported = importedTables.get(tableKey(table));
            if (!imported) return { ...table, parentAreaId: null };
            matched++;
            return {
                ...table,
                x: imported.x,
                y: imported.y,
                color: imported.color,
                width: imported.width,
                expanded: imported.expanded,
                order: imported.order,
                parentAreaId: imported.parentAreaKey
                    ? (areaIds.get(imported.parentAreaKey) ?? null)
                    : null,
            };
        });
        const areas = layoutPackage.layout.areas.map((area) => ({
            id: areaIds.get(area.key),
            diagramId,
            name: area.name,
            x: area.x,
            y: area.y,
            width: area.width,
            height: area.height,
            color: area.color,
            ...(finite(area.order) ? { order: area.order } : {}),
        }));
        const notes = layoutPackage.layout.notes.map((note) => {
            const { order, ...attributes } = note;
            return {
                id: id('layout-note'),
                diagramId,
                ...attributes,
                ...(finite(order) ? { order } : {}),
            };
        });
        if (!db.objectStoreNames.contains('repository_layouts'))
            throw new Error('레포 공통 작업 데이터 저장소를 찾을 수 없습니다.');
        const tx = db.transaction(
            ['diagrams', 'db_tables', 'areas', 'notes', 'repository_layouts'],
            'readwrite'
        );
        const done = complete(tx);
        const operations = [
            request(
                tx.objectStore('diagrams').put({
                    ...current.diagram,
                    updatedAt: new Date(),
                })
            ),
            ...tables.map((table) =>
                request(tx.objectStore('db_tables').put(table))
            ),
            ...current.areas.map((area) =>
                request(tx.objectStore('areas').delete(area.id))
            ),
            ...areas.map((area) => request(tx.objectStore('areas').put(area))),
            ...current.notes.map((note) =>
                request(tx.objectStore('notes').delete(note.id))
            ),
            ...notes.map((note) => request(tx.objectStore('notes').put(note))),
            request(
                tx
                    .objectStore('repository_layouts')
                    .put(repositoryLayout(targetSource, layoutPackage.layout))
            ),
        ];
        await Promise.all([...operations, done]);
        return {
            matchedTables: matched,
            skippedTables: layoutPackage.layout.tables.length - matched,
            areas: areas.length,
            notes: notes.length,
        };
    } finally {
        db.close();
    }
}

export function hasLayoutBackup(diagramId) {
    try {
        return Boolean(localStorage.getItem(`${BACKUP_PREFIX}${diagramId}`));
    } catch {
        return false;
    }
}

export async function restoreLayoutBackup(diagramId, targetSource) {
    const key = `${BACKUP_PREFIX}${diagramId}`;
    let backup;
    try {
        backup = localStorage.getItem(key);
    } catch {
        throw new Error(
            '브라우저 저장소에서 작업 데이터 백업을 읽지 못했습니다.'
        );
    }
    if (!backup) throw new Error('되돌릴 작업 데이터 백업이 없습니다.');
    const result = await applyLayoutPackage(diagramId, targetSource, backup, {
        createBackup: false,
    });
    try {
        localStorage.removeItem(key);
    } catch {
        throw new Error(
            '작업 데이터는 복원했지만 브라우저의 백업을 정리하지 못했습니다.'
        );
    }
    return result;
}
