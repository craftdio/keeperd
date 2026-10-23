import * as sqlite from 'node:sqlite';
const Database = sqlite.Database ?? sqlite.DatabaseSync;
import { mkdirSync, chmodSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { mergeBranchDiagram } from '../../src/lib/local-branch-merge.ts';
import {
    applyRepositoryLayout,
    captureRepositoryLayout,
    repositoryKey,
} from '../../src/lib/repository-layout.ts';

export const backupPolicy = Object.freeze({
    perDiagram: 3,
    count: 128,
    bytes: 32 * 1024 * 1024,
});
export const entityCollections = Object.freeze({
    Table: 'tables',
    Relationship: 'relationships',
    Dependency: 'dependencies',
    Area: 'areas',
    CustomType: 'customTypes',
    Note: 'notes',
});
export class WorkspaceError extends Error {
    constructor(code, message, status = 400) {
        super(message);
        this.code = code;
        this.status = status;
    }
}
const fail = (message) => {
    throw new WorkspaceError('INVALID_WORKSPACE_INPUT', message);
};
const digest = (value) =>
    createHash('sha256').update(JSON.stringify(value)).digest('hex');
const parse = (row) => (row ? JSON.parse(row.body) : undefined);
function validateDiagram(diagram) {
    if (
        !diagram ||
        typeof diagram.id !== 'string' ||
        !diagram.id ||
        diagram.id.length > 512 ||
        typeof diagram.name !== 'string' ||
        typeof diagram.databaseType !== 'string' ||
        !Number.isFinite(Date.parse(diagram.createdAt)) ||
        !Number.isFinite(Date.parse(diagram.updatedAt))
    )
        fail('ERD 형식을 확인하세요.');
    for (const collection of Object.values(entityCollections)) {
        if (
            diagram[collection] !== undefined &&
            (!Array.isArray(diagram[collection]) ||
                diagram[collection].some(
                    (row) => !row || typeof row.id !== 'string' || !row.id
                ))
        )
            fail('ERD 항목 형식을 확인하세요.');
    }
}

export function openWorkspace(
    state,
    { policy = backupPolicy, warn = console.warn } = {}
) {
    mkdirSync(state, { recursive: true, mode: 0o700 });
    const filename = path.join(state, 'keeperd.sqlite');
    const db = new Database(filename);
    chmodSync(filename, 0o600);
    db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;
        CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, body TEXT NOT NULL);
        INSERT OR IGNORE INTO meta VALUES ('revision', '0');
        CREATE TABLE IF NOT EXISTS diagrams (id TEXT PRIMARY KEY, body TEXT NOT NULL, source_revision TEXT, repository TEXT, edited INTEGER NOT NULL DEFAULT 0);
        CREATE TABLE IF NOT EXISTS layouts (id TEXT PRIMARY KEY, body TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS filters (id TEXT PRIMARY KEY, body TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS imports (id TEXT PRIMARY KEY, target TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS backups (id INTEGER PRIMARY KEY AUTOINCREMENT, diagram_id TEXT NOT NULL, kind TEXT NOT NULL, body TEXT NOT NULL, bytes INTEGER NOT NULL);
        CREATE INDEX IF NOT EXISTS backups_diagram ON backups(diagram_id, id);`);
    let backupWarning;
    const sourceDiagrams = new Map();
    const revision = () =>
        Number(
            db.prepare("SELECT body FROM meta WHERE key='revision'").get().body
        );
    const bump = () =>
        db
            .prepare(
                "UPDATE meta SET body=CAST(body AS INTEGER)+1 WHERE key='revision'"
            )
            .run();
    const transaction = (work) => {
        db.exec('BEGIN IMMEDIATE');
        try {
            const result = work();
            db.exec('COMMIT');
            return result;
        } catch (error) {
            db.exec('ROLLBACK');
            throw error;
        }
    };
    const row = (id) => db.prepare('SELECT * FROM diagrams WHERE id=?').get(id);
    const layout = (id) =>
        parse(db.prepare('SELECT body FROM layouts WHERE id=?').get(id));
    const layoutTime = (repository) => {
        const saved = db
            .prepare('SELECT body FROM meta WHERE key=?')
            .get(`layout-updated:${repository}`);
        if (saved) return Number(saved.body);
        // Compatibility with workspaces created before migration clocks existed.
        return Math.max(
            0,
            ...db
                .prepare(
                    'SELECT body FROM diagrams WHERE repository=? AND edited=1'
                )
                .all(repository)
                .map((item) => Date.parse(parse(item).updatedAt))
        );
    };
    const writeLayout = (repository, value, time) => {
        db.prepare('INSERT OR REPLACE INTO layouts VALUES (?,?)').run(
            repository,
            JSON.stringify(value)
        );
        if (time !== undefined)
            db.prepare('INSERT OR REPLACE INTO meta VALUES (?,?)').run(
                `layout-updated:${repository}`,
                String(time)
            );
    };
    const saveLayout = (
        repository,
        diagram,
        { initial = false, migrating = false } = {}
    ) => {
        if (!repository) return;
        const time = Date.parse(diagram.updatedAt);
        if (migrating && layout(repository) && time <= layoutTime(repository))
            return;
        writeLayout(
            repository,
            captureRepositoryLayout(repository, diagram, layout(repository)),
            initial ? undefined : time
        );
    };
    const current = (id) => {
        const stored = row(id);
        if (!stored) return undefined;
        const diagram = parse(stored);
        const shared = stored.repository && layout(stored.repository);
        if (!shared) return diagram;
        const applied = applyRepositoryLayout(diagram, shared);
        const logical = (id) =>
            id.includes(':repo-layout:')
                ? decodeURIComponent(id.split(':repo-layout:')[1])
                : id;
        const areaIds = new Map(
            (diagram.areas ?? []).map((area) => [logical(area.id), area.id])
        );
        const noteIds = new Map(
            (diagram.notes ?? []).map((note) => [logical(note.id), note.id])
        );
        return {
            ...applied,
            tables: applied.tables?.map((table) => ({
                ...table,
                parentAreaId: table.parentAreaId
                    ? (areaIds.get(logical(table.parentAreaId)) ??
                      table.parentAreaId)
                    : undefined,
            })),
            areas: applied.areas?.map((area) => ({
                ...area,
                id: areaIds.get(logical(area.id)) ?? area.id,
            })),
            notes: applied.notes?.map((note) => ({
                ...note,
                id: noteIds.get(logical(note.id)) ?? note.id,
            })),
        };
    };
    const put = (diagram, stored = {}) => {
        validateDiagram(diagram);
        db.prepare('INSERT OR REPLACE INTO diagrams VALUES (?,?,?,?,?)').run(
            diagram.id,
            JSON.stringify(diagram),
            stored.source_revision ?? null,
            stored.repository ?? null,
            stored.edited ?? 1
        );
    };
    const prune = () => {
        db.prepare(
            `DELETE FROM backups WHERE id NOT IN (SELECT id FROM backups ORDER BY id DESC LIMIT ?)`
        ).run(policy.count);
        for (const { diagram_id: id } of db
            .prepare('SELECT DISTINCT diagram_id FROM backups')
            .all())
            db.prepare(
                'DELETE FROM backups WHERE diagram_id=? AND id NOT IN (SELECT id FROM backups WHERE diagram_id=? ORDER BY id DESC LIMIT ?)'
            ).run(id, id, policy.perDiagram);
        while (
            Number(
                db
                    .prepare('SELECT COALESCE(SUM(bytes),0) bytes FROM backups')
                    .get().bytes
            ) > policy.bytes
        )
            db.exec(
                'DELETE FROM backups WHERE id=(SELECT MIN(id) FROM backups)'
            );
    };
    const backup = (id, kind, value) => {
        try {
            const body =
                typeof value === 'string' ? value : JSON.stringify(value);
            const bytes = Buffer.byteLength(body);
            if (bytes > policy.bytes)
                throw new Error('백업 한도보다 큰 데이터');
            // A failed optional backup cannot roll back the primary edit/import.
            db.exec('SAVEPOINT optional_backup');
            try {
                db.prepare(
                    'INSERT INTO backups(diagram_id,kind,body,bytes) VALUES (?,?,?,?)'
                ).run(id, kind, body, bytes);
                prune();
                db.exec('RELEASE optional_backup');
            } catch (error) {
                db.exec('ROLLBACK TO optional_backup; RELEASE optional_backup');
                throw error;
            }
            return true;
        } catch (error) {
            backupWarning =
                '자동 백업을 기록하지 못했습니다. 기존 ERD는 계속 사용할 수 있습니다.';
            warn(`${backupWarning} (${error.code ?? error.message})`);
            return false;
        }
    };
    const remove = (id) => {
        const stored = row(id);
        db.prepare('DELETE FROM diagrams WHERE id=?').run(id);
        db.prepare('DELETE FROM filters WHERE id=?').run(id);
        db.prepare('DELETE FROM backups WHERE diagram_id=?').run(id);
        if (
            stored?.repository &&
            !db
                .prepare('SELECT 1 FROM diagrams WHERE repository=? LIMIT 1')
                .get(stored.repository)
        ) {
            db.prepare('DELETE FROM layouts WHERE id=?').run(stored.repository);
            db.prepare('DELETE FROM meta WHERE key=?').run(
                `layout-updated:${stored.repository}`
            );
        }
    };
    const view = () => ({
        revision: revision(),
        diagrams: db
            .prepare('SELECT id FROM diagrams ORDER BY rowid')
            .all()
            .map(({ id }) => current(id)),
        layouts: db.prepare('SELECT body FROM layouts').all().map(parse),
        filters: Object.fromEntries(
            db
                .prepare('SELECT * FROM filters')
                .all()
                .map((item) => [item.id, parse(item)])
        ),
        config: parse(
            db.prepare("SELECT body FROM meta WHERE key='config'").get()
        ) ?? {
            defaultDiagramId:
                db.prepare('SELECT id FROM diagrams LIMIT 1').get()?.id ?? '',
        },
        backups: db
            .prepare(
                'SELECT id,diagram_id AS diagramId,kind,bytes FROM backups ORDER BY id DESC'
            )
            .all(),
        backupPolicy: policy,
        ...(backupWarning ? { warning: backupWarning } : {}),
    });
    function checkRevision(expected) {
        if (!Number.isSafeInteger(expected) || expected !== revision())
            throw new WorkspaceError(
                'WORKSPACE_CONFLICT',
                '다른 탭·브라우저 또는 Sync에서 ERD가 변경됐습니다. 현재 작업을 JSON으로 보관한 뒤 새로고침하세요.',
                409
            );
    }
    function syncSnapshots(payload) {
        transaction(() => {
            let changed = false;
            for (const snapshot of payload.snapshots ?? []) {
                const incoming = snapshot.diagram;
                validateDiagram(incoming);
                sourceDiagrams.set(incoming.id, {
                    diagram: incoming,
                    revision: String(snapshot.revision),
                });
                const stored = row(incoming.id);
                if (stored?.source_revision === String(snapshot.revision))
                    continue;
                const previous = current(incoming.id);
                if (previous) backup(incoming.id, 'sync', previous);
                const repository = snapshot.repositoryUrl
                    ? repositoryKey(snapshot.repositoryUrl)
                    : stored?.repository;
                let diagram = mergeBranchDiagram(incoming, previous);
                const shared = repository && layout(repository);
                if (shared) diagram = applyRepositoryLayout(diagram, shared);
                // Schema refresh time is not a user edit time for migration ordering.
                if (stored?.edited) diagram.updatedAt = previous.updatedAt;
                put(diagram, {
                    ...stored,
                    source_revision: String(snapshot.revision),
                    repository,
                    edited: stored?.edited ?? 0,
                });
                // Initial defaults must not overwrite a repository layout from another branch.
                if (!shared) saveLayout(repository, diagram, { initial: true });
                changed = true;
            }
            if (changed) bump();
        });
    }
    function migrate(input) {
        if (
            !input ||
            !Array.isArray(input.diagrams) ||
            !Array.isArray(input.backups ?? []) ||
            !Array.isArray(input.layouts ?? []) ||
            !Array.isArray(input.filters ?? [])
        )
            fail('이전할 브라우저 데이터를 확인하세요.');
        input.diagrams.forEach(validateDiagram);
        const accepted = new Set();
        transaction(() => {
            let changed = false;
            // Capture before shared layouts change, so recovery retains the actual old positions.
            const previousDiagrams = new Map(
                input.diagrams.map((diagram) => [
                    diagram.id,
                    current(diagram.id),
                ])
            );
            // Carry v2 layouts too: they can contain positions of tables absent
            // from every saved branch. Older v1 layouts are repaired by the reader.
            for (const incoming of input.layouts ?? []) {
                if (
                    !incoming ||
                    typeof incoming.id !== 'string' ||
                    incoming.version !== 2 ||
                    !incoming.tables ||
                    typeof incoming.tables !== 'object' ||
                    Array.isArray(incoming.tables) ||
                    !Array.isArray(incoming.areas) ||
                    !Array.isArray(incoming.notes) ||
                    Object.values(incoming.tables).some(
                        (position) =>
                            !position ||
                            !Number.isFinite(position.x) ||
                            !Number.isFinite(position.y)
                    ) ||
                    [...incoming.areas, ...incoming.notes].some(
                        (item) => !item || typeof item.id !== 'string'
                    )
                )
                    fail('공통 레이아웃 이전 형식을 확인하세요.');
                const repository = repositoryKey(incoming.id);
                const importId = digest(['layout', incoming]);
                if (
                    db.prepare('SELECT 1 FROM imports WHERE id=?').get(importId)
                )
                    continue;
                const time = Math.max(
                    0,
                    ...input.diagrams
                        .filter(
                            (diagram) =>
                                row(diagram.id)?.repository === repository
                        )
                        .map((diagram) => Date.parse(diagram.updatedAt))
                );
                const previous = layout(repository);
                const wins = !previous || time > layoutTime(repository);
                // No historical per-layout timestamp exists. Preserve missing
                // table positions even if the already saved layout wins ties.
                writeLayout(
                    repository,
                    wins
                        ? {
                              ...incoming,
                              id: repository,
                              tables: {
                                  ...previous?.tables,
                                  ...incoming.tables,
                              },
                          }
                        : {
                              ...previous,
                              tables: {
                                  ...incoming.tables,
                                  ...previous.tables,
                              },
                          },
                    wins ? time : undefined
                );
                db.prepare('INSERT INTO imports VALUES (?,?)').run(
                    importId,
                    repository
                );
                changed = true;
            }
            const ordered = [...input.diagrams].sort(
                (a, b) =>
                    Date.parse(a.updatedAt) - Date.parse(b.updatedAt) ||
                    a.id.localeCompare(b.id)
            );
            for (const original of ordered) {
                const importId = digest(['diagram', original]);
                if (
                    db.prepare('SELECT 1 FROM imports WHERE id=?').get(importId)
                )
                    continue;
                const stored = row(original.id);
                const previous = previousDiagrams.get(original.id);
                const wins =
                    !stored?.edited ||
                    Date.parse(original.updatedAt) >
                        Date.parse(parse(stored).updatedAt);
                if (previous && digest(previous) !== digest(original))
                    backup(
                        original.id,
                        'migration',
                        wins ? previous : original
                    );
                if (wins) {
                    const browserRevision =
                        input.sourceRevisions?.[original.id];
                    const staleSchema =
                        stored?.source_revision &&
                        typeof browserRevision === 'string' &&
                        browserRevision.startsWith('v2:') &&
                        browserRevision !== `v2:${stored.source_revision}`;
                    const source = sourceDiagrams.get(original.id);
                    const schema =
                        source && source.revision === stored?.source_revision
                            ? source.diagram
                            : parse(stored);
                    // Keep proven-newer Git structure; retain the complete old
                    // browser edit for recovery rather than silently dropping it.
                    if (staleSchema) backup(original.id, 'migration', original);
                    const diagram = staleSchema
                        ? {
                              ...mergeBranchDiagram(schema, original),
                              name: original.name,
                              updatedAt: original.updatedAt,
                          }
                        : structuredClone(original);
                    saveLayout(stored?.repository, original, {
                        migrating: true,
                    });
                    put(diagram, { ...stored, edited: 1 });
                    accepted.add(original.id);
                    db.prepare('DELETE FROM filters WHERE id=?').run(
                        original.id
                    );
                }
                db.prepare('INSERT INTO imports VALUES (?,?)').run(
                    importId,
                    original.id
                );
                changed = true;
            }
            if (
                input.config &&
                !db.prepare("SELECT 1 FROM meta WHERE key='config'").get()
            ) {
                db.prepare("INSERT INTO meta VALUES ('config',?)").run(
                    JSON.stringify(input.config)
                );
                changed = true;
            }
            for (const item of input.filters ?? []) {
                if (typeof item.diagramId !== 'string')
                    fail('필터 이전 형식을 확인하세요.');
                if (!accepted.has(item.diagramId)) continue;
                db.prepare('INSERT OR REPLACE INTO filters VALUES (?,?)').run(
                    item.diagramId,
                    JSON.stringify(item)
                );
                changed = true;
            }
            for (const item of input.backups ?? []) {
                if (
                    typeof item.diagramId !== 'string' ||
                    typeof item.value !== 'string' ||
                    typeof item.key !== 'string'
                )
                    fail('백업 이전 형식을 확인하세요.');
                const importId = digest(['backup', item]);
                if (
                    !db
                        .prepare('SELECT 1 FROM imports WHERE id=?')
                        .get(importId) &&
                    backup(item.diagramId, item.key, item.value)
                ) {
                    db.prepare('INSERT INTO imports VALUES (?,?)').run(
                        importId,
                        item.diagramId
                    );
                    changed = true;
                }
            }
            if (changed) bump();
        });
        return view();
    }
    function mutate(input) {
        return transaction(() => {
            checkRevision(input.revision);
            const actions = input.actions ?? [input];
            if (
                !Array.isArray(actions) ||
                !actions.length ||
                actions.length > 1000
            )
                fail('저장 작업 수를 확인하세요.');
            for (const { action, params = {} } of actions) {
                if (action === 'updateConfig') {
                    const previous = view().config;
                    db.prepare(
                        "INSERT OR REPLACE INTO meta VALUES ('config',?)"
                    ).run(JSON.stringify({ ...previous, ...params }));
                } else if (action === 'addDiagram') {
                    validateDiagram(params.diagram);
                    if (row(params.diagram.id))
                        throw new WorkspaceError(
                            'DIAGRAM_EXISTS',
                            '이미 저장된 ERD입니다.',
                            409
                        );
                    put(params.diagram);
                } else if (
                    action === 'updateDiagram' ||
                    action === 'replaceDiagram'
                ) {
                    const diagram = current(params.id),
                        stored = row(params.id);
                    if (!diagram)
                        throw new WorkspaceError(
                            'DIAGRAM_NOT_FOUND',
                            '저장된 ERD를 찾을 수 없습니다.',
                            404
                        );
                    if (action === 'replaceDiagram')
                        backup(params.id, params.kind ?? 'layout', diagram);
                    const next =
                        action === 'replaceDiagram'
                            ? params.diagram
                            : {
                                  ...diagram,
                                  ...params.attributes,
                                  id: params.attributes?.id ?? params.id,
                              };
                    if (next?.id !== params.id) {
                        validateDiagram(next);
                        if (row(next.id))
                            throw new WorkspaceError(
                                'DIAGRAM_EXISTS',
                                '이미 저장된 ERD ID입니다.',
                                409
                            );
                        db.prepare('DELETE FROM diagrams WHERE id=?').run(
                            params.id
                        );
                        db.prepare('UPDATE filters SET id=? WHERE id=?').run(
                            next.id,
                            params.id
                        );
                        db.prepare(
                            'UPDATE backups SET diagram_id=? WHERE diagram_id=?'
                        ).run(next.id, params.id);
                        const config = view().config;
                        if (config.defaultDiagramId === params.id)
                            db.prepare(
                                "INSERT OR REPLACE INTO meta VALUES ('config',?)"
                            ).run(
                                JSON.stringify({
                                    ...config,
                                    defaultDiagramId: next.id,
                                })
                            );
                    }
                    next.updatedAt = new Date(
                        Math.max(Date.now(), Date.parse(diagram.updatedAt) + 1)
                    ).toISOString();
                    put(next, { ...stored, edited: 1 });
                    saveLayout(stored.repository, next);
                } else if (action === 'deleteDiagram') {
                    remove(params.id);
                } else if (
                    ['updateDiagramFilter', 'deleteDiagramFilter'].includes(
                        action
                    )
                ) {
                    if (!row(params.diagramId))
                        throw new WorkspaceError(
                            'DIAGRAM_NOT_FOUND',
                            '저장된 ERD를 찾을 수 없습니다.',
                            404
                        );
                    if (action === 'deleteDiagramFilter')
                        db.prepare('DELETE FROM filters WHERE id=?').run(
                            params.diagramId
                        );
                    else
                        db.prepare(
                            'INSERT OR REPLACE INTO filters VALUES (?,?)'
                        ).run(params.diagramId, JSON.stringify(params.filter));
                } else {
                    const match =
                        /^(add|put|update|delete)(Diagram)?(Table|Relationship|Dependency|Area|CustomType|Note)(s)?$/.exec(
                            action ?? ''
                        );
                    if (
                        !match ||
                        (match[2] && (match[1] !== 'delete' || !match[4]))
                    )
                        fail('지원하지 않는 저장 작업입니다.');
                    const [, operation, all, type] = match;
                    const collection = entityCollections[type];
                    const item = params[type[0].toLowerCase() + type.slice(1)];
                    const id =
                        params.diagramId ??
                        view().diagrams.find((diagram) =>
                            diagram[collection]?.some(
                                (entity) => entity.id === params.id
                            )
                        )?.id;
                    const diagram = current(id),
                        stored = row(id ?? '');
                    if (!diagram)
                        throw new WorkspaceError(
                            'DIAGRAM_NOT_FOUND',
                            '저장할 ERD를 찾을 수 없습니다.',
                            404
                        );
                    let values = diagram[collection] ?? [];
                    const index = values.findIndex(
                        (entity) => entity.id === (item?.id ?? params.id)
                    );
                    if (all) values = [];
                    else if (operation === 'add' || operation === 'put') {
                        if (!item || typeof item.id !== 'string')
                            fail('저장할 항목 ID를 확인하세요.');
                        if (operation === 'add' && index >= 0)
                            fail('이미 존재하는 항목입니다.');
                        values = [
                            ...values.filter((entity) => entity.id !== item.id),
                            item,
                        ];
                    } else if (operation === 'update') {
                        if (index < 0)
                            throw new WorkspaceError(
                                'ENTITY_NOT_FOUND',
                                '저장할 항목을 찾을 수 없습니다.',
                                404
                            );
                        values[index] = {
                            ...values[index],
                            ...params.attributes,
                            id: params.id,
                        };
                    } else
                        values = values.filter(
                            (entity) => entity.id !== params.id
                        );
                    const next = {
                        ...diagram,
                        [collection]: values,
                        updatedAt: new Date().toISOString(),
                    };
                    put(next, { ...stored, edited: 1 });
                    saveLayout(stored.repository, next);
                }
            }
            bump();
            return view();
        });
    }
    try {
        prune();
    } catch {
        backupWarning =
            '자동 백업 정리를 완료하지 못했습니다. 기존 ERD는 계속 사용할 수 있습니다.';
    }
    return {
        db,
        filename,
        view,
        syncSnapshots,
        migrate,
        mutate,
        removeMany(ids) {
            transaction(() => {
                for (const id of ids) remove(id);
                bump();
            });
        },
        readBackup(id) {
            return parse(
                db.prepare('SELECT body FROM backups WHERE id=?').get(id)
            );
        },
        close() {
            db.close();
        },
    };
}

export function readSnapshots(state) {
    return JSON.parse(
        readFileSync(path.join(state, 'data/snapshots.json'), 'utf8')
    );
}
