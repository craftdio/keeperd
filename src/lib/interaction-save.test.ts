import { expect, it, vi } from 'vitest';
import { settledNodeChanges } from './settled-node-changes';
import { coalescedSave } from './coalesced-save';
import { preserveInteraction } from './preserve-interaction';

it('persists only final resize dimensions, including a dimensionless end event', () => {
    const settle = settledNodeChanges();
    for (let width = 100; width <= 200; width++) {
        expect(
            settle([
                {
                    id: 'area',
                    type: 'dimensions',
                    resizing: true,
                    dimensions: { width, height: 300 },
                },
            ])
        ).toEqual([]);
    }
    expect(
        settle([{ id: 'area', type: 'dimensions', resizing: false }])
    ).toEqual([
        {
            id: 'area',
            type: 'dimensions',
            resizing: false,
            dimensions: { width: 200, height: 300 },
        },
    ]);
    expect(
        settle([
            {
                id: 'area',
                type: 'dimensions',
                dimensions: { width: 400, height: 300 },
            },
        ])
    ).toEqual([]);
});
it('coalesces concurrent table and area saves, while awaiting durable completion', async () => {
    const save = vi.fn(async () => {});
    const schedule = coalescedSave(save);
    await Promise.all(Array.from({ length: 100 }, () => schedule('diagram')));
    expect(save).toHaveBeenCalledTimes(1);
    await schedule('diagram');
    expect(save).toHaveBeenCalledTimes(2);
});
it('defers top-left resize movement and commits it with the final dimensions', () => {
    const settle = settledNodeChanges();
    expect(
        settle([
            { id: 'area', type: 'position', position: { x: 50, y: 60 } },
            {
                id: 'area',
                type: 'dimensions',
                resizing: true,
                dimensions: { width: 300, height: 400 },
            },
        ])
    ).toEqual([]);
    expect(
        settle([{ id: 'area', type: 'dimensions', resizing: false }])
    ).toEqual([
        {
            id: 'area',
            type: 'position',
            position: { x: 50, y: 60 },
            dragging: false,
        },
        {
            id: 'area',
            type: 'dimensions',
            resizing: false,
            dimensions: { width: 300, height: 400 },
        },
    ]);
});
it('rejects every waiting save on failure and allows retry', async () => {
    const save = vi
        .fn()
        .mockRejectedValueOnce(new Error('disk'))
        .mockResolvedValue(undefined);
    const schedule = coalescedSave(save);
    const results = await Promise.allSettled([
        schedule('diagram'),
        schedule('diagram'),
    ]);
    expect(results.every((result) => result.status === 'rejected')).toBe(true);
    await schedule('diagram');
    expect(save).toHaveBeenCalledTimes(2);
});
it('keeps the opposite corner stable across stale model refreshes during resize', () => {
    const old = {
        id: 'area',
        position: { x: 100, y: 100 },
        width: 500,
        height: 500,
        data: {},
    };
    const live = {
        ...old,
        position: { x: 50, y: 70 },
        width: 550,
        height: 530,
        resizing: true,
        selected: true,
    };
    const [result] = preserveInteraction([old], [live], new Set(['area']));
    expect(result.position.x + result.width!).toBe(600);
    expect(result.position.y + result.height!).toBe(600);
    expect(result).toMatchObject({ selected: true });
    expect(preserveInteraction([old], [live], new Set())[0].position).toEqual(
        old.position
    );
});
