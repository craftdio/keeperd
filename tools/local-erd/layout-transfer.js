import {
    readWorkspace,
    writeWorkspace,
    workspaceBackup,
} from './workspace-client.js';
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

export async function exportLayoutPackage(diagramId, source) {
    const state = await readWorkspace({ refresh: true });
    const diagram = state.diagrams.find((item) => item.id === diagramId);
    if (!diagram) throw new Error('현재 ERD 작업 데이터를 찾을 수 없습니다.');
    const stored = state.layouts.find(
        (item) => item.id === canonicalRepository(source.repositoryUrl)
    );
    return stored?.version === 2
        ? createRepositoryPackage(source, stored)
        : createPackage(source, {
              diagram,
              tables: diagram.tables ?? [],
              areas: diagram.areas ?? [],
              notes: diagram.notes ?? [],
          });
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
    const state = await readWorkspace({ refresh: true });
    const diagram = state.diagrams.find((item) => item.id === diagramId);
    if (!diagram) throw new Error('현재 ERD 작업 데이터를 찾을 수 없습니다.');
    const current = {
        diagram,
        tables: diagram.tables ?? [],
        areas: diagram.areas ?? [],
        notes: diagram.notes ?? [],
    };
    const importedTables = new Map(
        layoutPackage.layout.tables.map((table) => [tableKey(table), table])
    );
    const areaIds = new Map(
        layoutPackage.layout.areas.map((area) => [area.key, id('layout-area')])
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
    await writeWorkspace('replaceDiagram', {
        id: diagramId,
        diagram: { ...diagram, tables, areas, notes, updatedAt: new Date() },
        kind: createBackup ? 'layout' : 'layout-restore',
    });
    return {
        matchedTables: matched,
        skippedTables: layoutPackage.layout.tables.length - matched,
        areas: areas.length,
        notes: notes.length,
    };
}

export async function hasLayoutBackup(diagramId) {
    const state = await readWorkspace();
    return state.backups.some(
        (item) =>
            item.diagramId === diagramId &&
            (item.kind === 'layout' ||
                item.kind === `${BACKUP_PREFIX}${diagramId}`)
    );
}

export async function restoreLayoutBackup(diagramId, targetSource) {
    const state = await readWorkspace({ refresh: true });
    const backup = state.backups.find(
        (item) =>
            item.diagramId === diagramId &&
            (item.kind === 'layout' ||
                item.kind === `${BACKUP_PREFIX}${diagramId}`)
    );
    if (!backup) throw new Error('되돌릴 작업 데이터 백업이 없습니다.');
    const value = await workspaceBackup(backup.id);
    if (value.format === FORMAT)
        return applyLayoutPackage(diagramId, targetSource, value, {
            createBackup: false,
        });
    return applyLayoutPackage(
        diagramId,
        targetSource,
        createPackage(targetSource, {
            diagram: value,
            tables: value.tables ?? [],
            areas: value.areas ?? [],
            notes: value.notes ?? [],
        }),
        { createBackup: false }
    );
}
