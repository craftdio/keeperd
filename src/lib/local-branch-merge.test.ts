import { describe, expect, it } from 'vitest';
import { DatabaseType } from './domain/database-type';
import { mergeBranchDiagram } from './local-branch-merge';
import { diagramSchema, type Diagram } from './domain/diagram';
import { generateDBMLFromDiagram } from './dbml/dbml-export/dbml-export';

const snapshots = ['develop', 'main'].map((branch) => ({
    diagram: {
        id: `debut-${branch}`,
        name: branch,
        databaseType: DatabaseType.POSTGRESQL,
        createdAt: new Date(0),
        updatedAt: new Date(0),
        notes: [],
        areas: [
            {
                id: `${branch}-area`,
                name: 'Example',
                x: 0,
                y: 0,
                width: 1000,
                height: 800,
                color: '#6366f1',
            },
        ],
        tables: ['users', 'posts'].map((name, index) => ({
            id: `${branch}-${name}`,
            name,
            schema: 'public',
            x: index * 400,
            y: 100,
            color: '#6366f1',
            isView: false,
            createdAt: 0,
            indexes: [],
            parentAreaId: `${branch}-area`,
            fields: [
                {
                    id: `${branch}-${name}-id`,
                    name: 'id',
                    type: { id: 'bigint', name: 'bigint' },
                    primaryKey: true,
                    unique: true,
                    nullable: false,
                    createdAt: 0,
                },
                {
                    id: `${branch}-${name}-owner`,
                    name: 'owner_id',
                    type: { id: 'bigint', name: 'bigint' },
                    primaryKey: false,
                    unique: false,
                    nullable: false,
                    createdAt: 0,
                },
            ],
        })),
        relationships: [
            {
                id: `${branch}-fk`,
                name: 'posts_owner_fk',
                sourceTableId: `${branch}-posts`,
                targetTableId: `${branch}-users`,
                sourceFieldId: `${branch}-posts-owner`,
                targetFieldId: `${branch}-users-id`,
                sourceCardinality: 'many' as const,
                targetCardinality: 'one' as const,
                createdAt: 0,
            },
        ],
    } satisfies Diagram,
}));
const parse = (diagram: Diagram) =>
    diagramSchema.parse({
        ...diagram,
        createdAt: new Date(diagram.createdAt),
        updatedAt: new Date(diagram.updatedAt),
    });

describe('local branch ERD', () => {
    it('normalizes legacy CHECK clauses without losing layout or constraints', () => {
        const incoming = parse(snapshots[0].diagram);
        incoming.tables![0].checkConstraints = [
            {
                id: 'positive-id',
                createdAt: 0,
                expression: 'CHECK ((id > 0)) NO INHERIT',
            },
        ];
        const previous = structuredClone(incoming);
        previous.tables![0].x = 789;
        previous.tables![0].color = '#123456';
        for (const old of [undefined, previous]) {
            const merged = mergeBranchDiagram(incoming, old);
            expect(merged.tables![0].checkConstraints![0].expression).toBe(
                '((id > 0))'
            );
            expect(merged.tables![0].x).toBe(old ? 789 : incoming.tables![0].x);
            expect(merged.tables![0].color).toBe(
                old ? '#123456' : incoming.tables![0].color
            );
            const result = generateDBMLFromDiagram(merged);
            expect(result.error).toBeUndefined();
            expect(result.standardDbml).toContain('id > 0');
            expect(mergeBranchDiagram(merged, merged)).toEqual(merged);
        }
        expect(incoming.tables![0].checkConstraints![0].expression).toBe(
            'CHECK ((id > 0)) NO INHERIT'
        );
    });
    it('validates diagrams and branch-isolated IDs without private snapshots', () => {
        const [develop, main] = snapshots.map((s) => parse(s.diagram));
        expect(develop.tables!.length).toBeGreaterThan(0);
        const ids = new Set(develop.tables!.map((t) => t.id));
        expect(main.tables!.some((t) => ids.has(t.id))).toBe(false);
        for (const diagram of [develop, main]) {
            for (const r of diagram.relationships!) {
                expect(
                    diagram
                        .tables!.find((t) => t.id === r.sourceTableId)
                        ?.fields.some((f) => f.id === r.sourceFieldId)
                ).toBe(true);
                expect(
                    diagram
                        .tables!.find((t) => t.id === r.targetTableId)
                        ?.fields.some((f) => f.id === r.targetFieldId)
                ).toBe(true);
            }
        }
    });
    it('preserves layout and notes while applying column additions/deletions', () => {
        const incoming = parse(snapshots[0].diagram);
        const old = structuredClone(incoming);
        old.tables![0].x = 987;
        old.tables![0].color = '#123456';
        old.notes = [
            {
                id: 'note-1',
                content: '배포 전 확인',
                x: 20,
                y: 30,
                width: 200,
                height: 100,
                color: '#ffffff',
            },
        ];
        const last = old.tables![0].fields.pop()!;
        old.tables![0].fields.push({
            ...last,
            id: 'removed-column',
            name: 'removed_column',
        });
        const merged = mergeBranchDiagram(incoming, old);
        expect(merged.tables![0].x).toBe(987);
        expect(merged.tables![0].color).toBe('#123456');
        expect(merged.tables![0].fields.some((f) => f.id === last.id)).toBe(
            true
        );
        expect(
            merged.tables![0].fields.some((f) => f.id === 'removed-column')
        ).toBe(false);
        expect(merged.areas).toEqual(old.areas);
        expect(merged.notes).toEqual(old.notes);
        expect(mergeBranchDiagram(incoming, merged)).toEqual(merged);
    });
    it('remaps existing table and field IDs in relationships', () => {
        const incoming = parse(snapshots[0].diagram);
        const old = structuredClone(incoming);
        const relationship = incoming.relationships![0];
        const table = old.tables!.find(
            (t) => t.id === relationship.sourceTableId
        )!;
        table.id = 'user-edited-table-id';
        table.fields.find((f) => f.id === relationship.sourceFieldId)!.id =
            'user-edited-field-id';
        const merged = mergeBranchDiagram(incoming, old);
        expect(merged.relationships![0].sourceTableId).toBe(
            'user-edited-table-id'
        );
        expect(merged.relationships![0].sourceFieldId).toBe(
            'user-edited-field-id'
        );
    });
});
