export const workspaceCollections = Object.freeze([
    'tables',
    'relationships',
    'dependencies',
    'areas',
    'customTypes',
    'notes',
]);

export function normalizeWorkspaceSelection(value) {
    const invalid = () => {
        throw new Error('작업 데이터 읽기 범위를 확인하세요.');
    };
    if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
    const { kind } = value;
    if (
        ![
            'config',
            'filter',
            'diagrams',
            'diagram',
            'collection',
            'entity',
        ].includes(kind)
    )
        invalid();
    const result = { kind };
    const id = (key) => {
        if (
            typeof value[key] !== 'string' ||
            !value[key].length ||
            value[key].length > 256
        )
            invalid();
        return value[key];
    };
    if (['filter', 'diagram', 'collection', 'entity'].includes(kind))
        result.diagramId = id('diagramId');
    if (['collection', 'entity'].includes(kind)) {
        if (!workspaceCollections.includes(value.collection)) invalid();
        result.collection = value.collection;
    }
    if (kind === 'entity') result.id = id('id');
    if (kind === 'diagram' || kind === 'diagrams') {
        const includes = value.includes ?? [];
        if (
            !Array.isArray(includes) ||
            includes.length > workspaceCollections.length ||
            includes.some((name) => !workspaceCollections.includes(name))
        )
            invalid();
        result.includes = workspaceCollections.filter((name) =>
            includes.includes(name)
        );
    }
    return result;
}

export function selectDiagramValue(diagram, includes = []) {
    if (!diagram) return undefined;
    const result = { ...diagram };
    for (const name of workspaceCollections)
        if (!includes.includes(name)) delete result[name];
    return result;
}

// Also used when talking to an older server that returns a full snapshot.
export function selectWorkspaceValue(state, selection) {
    const { kind, diagramId, collection, id, includes } = selection;
    if (kind === 'config') return state.config;
    if (kind === 'filter') return state.filters[diagramId];
    if (kind === 'diagrams')
        return state.diagrams.map((diagram) =>
            selectDiagramValue(diagram, includes)
        );
    const diagram = state.diagrams.find((item) => item.id === diagramId);
    if (kind === 'diagram') return selectDiagramValue(diagram, includes);
    const rows = diagram?.[collection] ?? [];
    return kind === 'collection' ? rows : rows.find((row) => row.id === id);
}
