import type { Diagram } from './domain/diagram';
import type { DBTable } from './domain/db-table';

type Position = Pick<
    DBTable,
    'x' | 'y' | 'width' | 'color' | 'parentAreaId' | 'expanded' | 'order'
>;
export interface RepositoryLayout {
    version?: number;
    id: string;
    tables: Record<string, Position>;
    areas: NonNullable<Diagram['areas']>;
    notes: NonNullable<Diagram['notes']>;
}
export const repositoryKey = (url: string) =>
    url
        .toLowerCase()
        .replace(/\.git\/?$/, '')
        .replace(/\/$/, '');
const key = (table: DBTable) =>
    JSON.stringify([table.schema ?? '', table.name]);
const logicalId = (id: string) =>
    id.includes(':repo-layout:')
        ? decodeURIComponent(id.split(':repo-layout:')[1])
        : id;
const scopedId = (diagram: string, id: string) =>
    `${diagram}:repo-layout:${encodeURIComponent(logicalId(id))}`;

export function captureRepositoryLayout(
    id: string,
    diagram: Diagram,
    previous?: RepositoryLayout
): RepositoryLayout {
    const tables = { ...previous?.tables };
    for (const table of diagram.tables ?? []) {
        const { x, y, width, color, expanded, order } = table;
        tables[key(table)] = {
            x,
            y,
            width,
            color,
            expanded,
            order,
            parentAreaId: table.parentAreaId
                ? logicalId(table.parentAreaId)
                : undefined,
        };
    }
    return {
        version: 2,
        id,
        tables,
        areas: [
            ...(previous?.areas ?? []).filter((area) => {
                const members = Object.entries(previous!.tables).filter(
                    ([, position]) => position.parentAreaId === area.id
                );
                return (
                    members.length > 0 &&
                    !members.some(([member]) =>
                        (diagram.tables ?? []).some(
                            (table) => key(table) === member
                        )
                    ) &&
                    !(diagram.areas ?? []).some(
                        (current) => logicalId(current.id) === area.id
                    )
                );
            }),
            ...(diagram.areas ?? []).map((area) => ({
                ...area,
                id: logicalId(area.id),
            })),
        ],
        notes: (diagram.notes ?? []).map((note) => ({
            ...note,
            id: logicalId(note.id),
        })),
    };
}

export function applyRepositoryLayout(
    diagram: Diagram,
    layout: RepositoryLayout
): Diagram {
    return {
        ...diagram,
        tables: diagram.tables?.map((table) => {
            const position = layout.tables[key(table)];
            return position
                ? {
                      ...table,
                      ...position,
                      parentAreaId:
                          position.parentAreaId &&
                          layout.areas.some(
                              (a) => a.id === position.parentAreaId
                          )
                              ? scopedId(diagram.id, position.parentAreaId)
                              : undefined,
                  }
                : { ...table, parentAreaId: undefined };
        }),
        areas: layout.areas
            .filter((area) => {
                const members = Object.entries(layout.tables).filter(
                    ([, position]) => position.parentAreaId === area.id
                );
                return (
                    members.length === 0 ||
                    members.some(([member]) =>
                        (diagram.tables ?? []).some(
                            (table) => key(table) === member
                        )
                    )
                );
            })
            .map((area) => ({
                ...area,
                id: scopedId(diagram.id, area.id),
            })),
        notes: layout.notes.map((note) => ({
            ...note,
            id: scopedId(diagram.id, note.id),
        })),
    };
}
