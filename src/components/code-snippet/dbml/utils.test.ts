import { describe, expect, it, vi } from 'vitest';
import type * as monaco from 'monaco-editor';
import { highlightErrorLine } from './utils';

describe('DBML error highlighting', () => {
    it('uses the already-mounted editor instance without importing Monaco eagerly', () => {
        const set = vi.fn();
        const Range = vi.fn(function (
            this: Record<string, number>,
            startLineNumber: number,
            startColumn: number,
            endLineNumber: number,
            endColumn: number
        ) {
            Object.assign(this, {
                startLineNumber,
                startColumn,
                endLineNumber,
                endColumn,
            });
        });
        const monacoInstance = {
            Range,
            editor: { OverviewRulerLane: { Right: 2 } },
        } as unknown as typeof monaco;
        highlightErrorLine({
            error: { line: 3, message: 'Invalid DBML' } as never,
            model: { getLineMaxColumn: () => 12 } as never,
            editorDecorationsCollection: { set } as never,
            monacoInstance,
        });
        expect(Range).toHaveBeenCalledWith(3, 1, 3, 12);
        expect(set).toHaveBeenCalledWith([
            expect.objectContaining({
                options: expect.objectContaining({
                    hoverMessage: { value: 'Invalid DBML' },
                    overviewRuler: expect.objectContaining({ position: 2 }),
                }),
            }),
        ]);
    });

    it('does not decorate before the editor instance is available', () => {
        const set = vi.fn();
        highlightErrorLine({
            error: { line: 1, message: 'Invalid DBML' } as never,
            model: { getLineMaxColumn: () => 4 } as never,
            editorDecorationsCollection: { set } as never,
        });
        expect(set).not.toHaveBeenCalled();
    });
});
