import type { StorageContext } from './storage-context';
import type { Diagram } from '@/lib/domain/diagram';
import {
    readWorkspace,
    writeWorkspace,
} from '../../../tools/local-erd/workspace-client.js';

type Options = Parameters<StorageContext['getDiagram']>[1];
const collections = {
    Table: 'tables',
    Relationship: 'relationships',
    Dependency: 'dependencies',
    Area: 'areas',
    CustomType: 'customTypes',
    Note: 'notes',
} as const;
const revive = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(revive);
    if (value && typeof value === 'object')
        return Object.fromEntries(
            Object.entries(value).map(([key, item]) => [
                key,
                /^(createdAt|updatedAt)$/.test(key) && typeof item === 'string'
                    ? new Date(item)
                    : revive(item),
            ])
        );
    return value;
};
function select(diagram: Diagram, options: Options = {}): Diagram {
    const selected = { ...diagram };
    for (const [type, collection] of Object.entries(collections)) {
        const key =
            `include${type === 'CustomType' ? 'CustomTypes' : type === 'Dependency' ? 'Dependencies' : `${type}s`}` as keyof NonNullable<Options>;
        if (!options[key]) delete selected[collection];
    }
    return revive(selected) as Diagram;
}
export function createServerStorage(): StorageContext {
    const methods: Record<string, (...args: never[]) => Promise<unknown>> = {};
    const put = async (action: string, params: unknown) => {
        await writeWorkspace(action, params);
    };
    Object.assign(methods, {
        getConfig: async () => (await readWorkspace()).config,
        updateConfig: (config: unknown) => put('updateConfig', config),
        getDiagramFilter: async (id: string) =>
            (await readWorkspace()).filters[id],
        updateDiagramFilter: (diagramId: string, filter: unknown) =>
            put('updateDiagramFilter', { diagramId, filter }),
        deleteDiagramFilter: (diagramId: string) =>
            put('deleteDiagramFilter', { diagramId }),
        replaceDiagram: ({ diagram }: { diagram: Diagram }) =>
            put('replaceDiagram', {
                id: diagram.id,
                diagram,
                kind: 'diagram-replace',
            }),
        addDiagram: (params: unknown) => put('addDiagram', params),
        listDiagrams: async (options: Options) =>
            (await readWorkspace()).diagrams.map((diagram) =>
                select(diagram, options)
            ),
        getDiagram: async (id: string, options: Options) => {
            const diagram = (await readWorkspace()).diagrams.find(
                (diagram) => diagram.id === id
            );
            return diagram ? select(diagram, options) : undefined;
        },
        updateDiagram: (params: unknown) => put('updateDiagram', params),
        deleteDiagram: (id: string) => put('deleteDiagram', { id }),
    });
    for (const [type, collection] of Object.entries(collections)) {
        const plural = type === 'Dependency' ? 'Dependencies' : `${type}s`;
        for (const operation of ['add', 'put', 'update', 'delete'])
            methods[`${operation}${type}`] = ((params: unknown) =>
                put(`${operation}${type}`, params)) as (
                ...args: never[]
            ) => Promise<void>;
        methods[`deleteDiagram${plural}`] = ((diagramId: string) =>
            put(`deleteDiagram${plural}`, { diagramId })) as (
            ...args: never[]
        ) => Promise<void>;
        methods[`list${plural}`] = (async (id: string) =>
            revive(
                (await readWorkspace()).diagrams.find(
                    (diagram) => diagram.id === id
                )?.[collection] ?? []
            )) as (...args: never[]) => Promise<unknown>;
        methods[`get${type}`] = (async ({
            diagramId,
            id,
        }: {
            diagramId: string;
            id: string;
        }) =>
            revive(
                (await readWorkspace()).diagrams
                    .find((diagram) => diagram.id === diagramId)
                    ?.[collection]?.find((row) => row.id === id)
            )) as (...args: never[]) => Promise<unknown>;
    }
    return methods as unknown as StorageContext;
}
