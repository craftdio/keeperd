import { expect, it } from 'vitest';
import {
    applyRepositoryLayout,
    captureRepositoryLayout,
} from './repository-layout';
import type { Diagram } from './domain/diagram';

const diagram = (id: string, names: string[]) =>
    ({
        id,
        tables: names.map((name) => ({
            id: `${id}-${name}`,
            name,
            schema: 'public',
            x: 10,
            y: 20,
            color: 'red',
            fields: [{ id: `${id}-${name}-field`, name: 'id' }],
            indexes: [],
        })),
        areas: [],
        notes: [],
    }) as unknown as Diagram;
it('hides absent groups without losing their geometry on a round trip', () => {
    const feature = diagram('feature', ['users', 'profiles']);
    feature.areas = [
        {
            id: 'profiles-area',
            name: 'Profiles',
            x: 400,
            y: 500,
            width: 600,
            height: 700,
            color: 'blue',
        },
    ];
    feature.tables![1].parentAreaId = 'profiles-area';
    feature.tables![1].x = 450;
    const layout = captureRepositoryLayout('repo', feature);
    const develop = applyRepositoryLayout(
        diagram('develop', ['users']),
        layout
    );
    expect(develop.areas).toEqual([]);
    const back = applyRepositoryLayout(
        feature,
        captureRepositoryLayout('repo', develop, layout)
    );
    expect(back.areas).toHaveLength(1);
    expect(back.areas![0]).toMatchObject({
        x: 400,
        y: 500,
        width: 600,
        height: 700,
    });
    expect(back.tables![1].x).toBe(450);
    expect(back.tables![1].parentAreaId).toBe(back.areas![0].id);
});
it('shares positions across branches without copying schema or table IDs and preserves absent tables', () => {
    const feature = diagram('feature', ['users', 'profiles']);
    feature.tables![0].x = 900;
    feature.tables![1].color = 'green';
    const layout = captureRepositoryLayout('repo', feature);
    const develop = applyRepositoryLayout(
        diagram('develop', ['users']),
        layout
    );
    expect(develop.tables).toHaveLength(1);
    expect(develop.tables![0].x).toBe(900);
    expect(develop.tables![0].id).toBe('develop-users');
    expect(develop.tables![0].fields[0].id).toBe('develop-users-field');
    develop.tables![0].x = 42;
    const back = applyRepositoryLayout(
        feature,
        captureRepositoryLayout('repo', develop, layout)
    );
    expect(back.tables![0].x).toBe(42);
    expect(back.tables![1].color).toBe('green');
});
it('scopes shared Area and note IDs per diagram, retaining edits and explicit removal', () => {
    const feature = diagram('feature', ['users']);
    feature.areas = [
        {
            id: 'area',
            name: 'Users',
            x: 0,
            y: 0,
            width: 900,
            height: 600,
            color: 'blue',
        },
    ];
    feature.notes = [
        {
            id: 'note',
            content: 'memo',
            x: 0,
            y: 0,
            width: 100,
            height: 100,
            color: 'yellow',
        },
    ];
    feature.tables![0].parentAreaId = 'area';
    const layout = captureRepositoryLayout('repo', feature);
    const develop = applyRepositoryLayout(
        diagram('develop', ['users']),
        layout
    );
    expect(develop.areas![0].id).not.toBe('area');
    expect(develop.tables![0].parentAreaId).toBe(develop.areas![0].id);
    expect(develop.notes![0].content).toBe('memo');
    develop.notes = [];
    const back = applyRepositoryLayout(
        feature,
        captureRepositoryLayout('repo', develop, layout)
    );
    expect(back.notes).toEqual([]);
    expect(back.areas![0].id).not.toBe(develop.areas![0].id);
});
