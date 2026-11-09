// Shared by the browser exporter and the SQLite mutation boundary.
const FORMAT = 'keeperd-repository-layout';
export const PARTIAL_FORMAT = 'keeperd-table-layout';
const VERSION = 1;
const MAX_TABLES = 10000;
const MAX_AREAS = 1000;
const MAX_NOTES = 1000;
const canonicalRepository = (url) =>
    String(url ?? '')
        .toLowerCase()
        .replace(/\.git\/?$/, '')
        .replace(/\/$/, '');
const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const nullableFinite = (value) => value === null || finite(value);
export const tableKey = (table) =>
    JSON.stringify([table.schema ?? '', table.name]);
export const layoutPosition = (table) => ({
    x: table.x,
    y: table.y,
    color: table.color,
    width: table.width ?? null,
    expanded: table.expanded ?? null,
    order: table.order ?? null,
});
export const tablePlacement = (table) => ({
    schema: table.schema ?? null,
    name: table.name,
    ...layoutPosition(table),
});
export const isPartialLayoutPackage = (input) =>
    input?.format === PARTIAL_FORMAT;

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
    if (
        ![FORMAT, PARTIAL_FORMAT].includes(input?.format) ||
        input?.version !== VERSION
    )
        throw new Error('지원하지 않는 작업 데이터 JSON 형식입니다.');
    validateRepository(input.repository);
    if (isPartialLayoutPackage(input)) {
        const tables = input.layout?.tables;
        const fields = new Set(Object.keys(tablePlacement({})));
        if (
            !Array.isArray(tables) ||
            !tables.length ||
            Object.keys(input.layout).some((key) => key !== 'tables') ||
            tables.some(
                (table) =>
                    !table || Object.keys(table).some((key) => !fields.has(key))
            )
        )
            throw new Error(
                '부분 작업 데이터 JSON에는 테이블 이름·스키마명과 배치만 포함해야 합니다.'
            );
        validateLayout({
            tables: tables.map((table) => ({ ...table, parentAreaKey: null })),
            areas: [],
            notes: [],
        });
    } else validateLayout(input.layout);
    return input;
}

export function selectLayoutTables(input, keys) {
    const layoutPackage = parseLayoutPackage(input);
    if (
        !Array.isArray(keys) ||
        !keys.length ||
        new Set(keys).size !== keys.length
    )
        throw new Error('내보낼 테이블을 한 개 이상 선택하세요.');
    const selected = new Set(keys);
    const tables = layoutPackage.layout.tables.filter((table) =>
        selected.has(tableKey(table))
    );
    if (tables.length !== keys.length)
        throw new Error(
            '선택한 테이블을 찾을 수 없습니다. 목록을 다시 불러오세요.'
        );
    return parseLayoutPackage({
        format: PARTIAL_FORMAT,
        version: VERSION,
        exportedAt: new Date().toISOString(),
        repository: layoutPackage.repository,
        layout: { tables: tables.map(tablePlacement) },
    });
}

export function layoutMatchCounts(input, diagram) {
    const keys = new Set((diagram.tables ?? []).map(tableKey));
    const matchedTables = input.layout.tables.filter((table) =>
        keys.has(tableKey(table))
    ).length;
    return {
        matchedTables,
        skippedTables: input.layout.tables.length - matchedTables,
    };
}
