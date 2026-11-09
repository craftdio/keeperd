import {
    isPartialLayoutPackage,
    layoutMatchCounts,
    parseLayoutPackage,
    selectLayoutTables,
    tableKey,
} from './layout-package.js';
export { parseLayoutPackage } from './layout-package.js';
import {
    readWorkspace,
    writeWorkspace,
    workspaceBackup,
} from './workspace-client.js';
const FORMAT = 'keeperd-repository-layout';
const VERSION = 1;
const BACKUP_PREFIX = 'debut-layout-backup:';

const canonicalRepository = (url) =>
    String(url ?? '')
        .toLowerCase()
        .replace(/\.git\/?$/, '')
        .replace(/\/$/, '');
const finite = (value) => typeof value === 'number' && Number.isFinite(value);
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
            areas: layoutPackage.layout.areas?.length ?? 0,
            notes: layoutPackage.layout.notes?.length ?? 0,
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

function diagramLayoutPackage(state, diagramId, source) {
    const diagram = state.diagrams.find((item) => item.id === diagramId);
    if (!diagram) throw new Error('현재 ERD 작업 데이터를 찾을 수 없습니다.');
    const stored = state.layouts.find(
        (item) => item.id === canonicalRepository(source.repositoryUrl)
    );
    const layoutPackage =
        stored?.version === 2
            ? createRepositoryPackage(source, stored)
            : createPackage(source, {
                  diagram,
                  tables: diagram.tables ?? [],
                  areas: diagram.areas ?? [],
                  notes: diagram.notes ?? [],
              });
    return { diagram, layoutPackage };
}

export async function layoutTableCatalog(diagramId, source) {
    const state = await readWorkspace({ refresh: true });
    const { diagram, layoutPackage } = diagramLayoutPackage(
        state,
        diagramId,
        source
    );
    return {
        tables: layoutPackage.layout.tables.filter((table) =>
            (diagram.tables ?? []).some(
                (current) => tableKey(current) === tableKey(table)
            )
        ),
        currentTableKeys: (diagram.tables ?? []).map(tableKey),
    };
}

export async function exportLayoutPackage(
    diagramId,
    source,
    { tableKeys } = {}
) {
    const state = await readWorkspace({ refresh: true });
    const { layoutPackage } = diagramLayoutPackage(state, diagramId, source);
    return tableKeys === undefined
        ? layoutPackage
        : selectLayoutTables(layoutPackage, tableKeys);
}

export async function previewLayoutPackage(diagramId, targetSource, input) {
    const layoutPackage = parseLayoutPackage(input);
    const compatibility = checkLayoutCompatibility(layoutPackage, targetSource);
    if (!compatibility.compatible)
        throw new Error('현재 ERD와 레포가 다릅니다.');
    const state = await readWorkspace({ refresh: true });
    const diagram = state.diagrams.find((item) => item.id === diagramId);
    if (!diagram) throw new Error('현재 ERD 작업 데이터를 찾을 수 없습니다.');
    return {
        ...compatibility,
        ...layoutMatchCounts(layoutPackage, diagram),
        partial: isPartialLayoutPackage(layoutPackage),
    };
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
    if (isPartialLayoutPackage(layoutPackage)) {
        const counts = layoutMatchCounts(layoutPackage, diagram);
        if (counts.matchedTables)
            await writeWorkspace('applyTableLayout', {
                id: diagramId,
                package: layoutPackage,
            });
        return { ...counts, areas: 0, notes: 0 };
    }
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
                item.kind === `${BACKUP_PREFIX}${diagramId}` ||
                item.kind === 'layout-partial')
    );
}

export async function restoreLayoutBackup(diagramId, targetSource) {
    const state = await readWorkspace({ refresh: true });
    const backup = state.backups.find(
        (item) =>
            item.diagramId === diagramId &&
            (item.kind === 'layout' ||
                item.kind === `${BACKUP_PREFIX}${diagramId}` ||
                item.kind === 'layout-partial')
    );
    if (!backup) throw new Error('되돌릴 작업 데이터 백업이 없습니다.');
    const value = await workspaceBackup(backup.id);
    if (backup.kind === 'layout-partial') {
        const preview = await previewLayoutPackage(
            diagramId,
            targetSource,
            value
        );
        await writeWorkspace('restoreTableLayout', {
            id: diagramId,
            backupId: backup.id,
        });
        return {
            matchedTables: preview.matchedTables,
            skippedTables: preview.skippedTables,
            areas: 0,
            notes: 0,
        };
    }
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
