import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    countInteractionRender,
    measureCanvasInteraction,
    measureCanvasViewport,
} from './interaction-benchmark';

afterEach(() => {
    vi.restoreAllMocks();
    window.history.replaceState({}, '', '/');
    delete document.documentElement.dataset.canvasInteractionType;
    delete document.documentElement.dataset.canvasInteractionTableRenders;
    delete document.documentElement.dataset.canvasInteractionEdgeRenders;
    delete document.documentElement.dataset.canvasViewportDurationMs;
    delete document.documentElement.dataset.canvasViewportDomElements;
    delete document.documentElement.dataset.canvasViewportFieldRows;
    delete document.documentElement.dataset.canvasViewportHandles;
});

describe('interaction benchmark', () => {
    it('does not record counters without the opt-in query parameter', () => {
        countInteractionRender('table');
        measureCanvasInteraction('select');
        measureCanvasViewport();
        expect(document.documentElement.dataset.canvasInteractionType).toBe(
            undefined
        );
        expect(document.documentElement.dataset.canvasViewportDurationMs).toBe(
            undefined
        );
    });

    it('resets counters for each selected interaction when enabled', () => {
        vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1);
        window.history.replaceState({}, '', '/?canvasBenchmark=1');
        countInteractionRender('table');
        countInteractionRender('edge');
        expect(
            document.documentElement.dataset.canvasInteractionTableRenders
        ).toBe('1');
        measureCanvasInteraction('drag');
        expect(document.documentElement.dataset.canvasInteractionType).toBe(
            'drag'
        );
        expect(
            document.documentElement.dataset.canvasInteractionTableRenders
        ).toBe('0');
        expect(
            document.documentElement.dataset.canvasInteractionEdgeRenders
        ).toBe('0');
    });

    it('records viewport DOM and handle counts after the second frame', () => {
        window.history.replaceState({}, '', '/?canvasBenchmark=1');
        const callbacks: FrameRequestCallback[] = [];
        vi.spyOn(window, 'requestAnimationFrame').mockImplementation(
            (callback) => {
                callbacks.push(callback);
                return callbacks.length;
            }
        );
        const canvas = document.createElement('div');
        canvas.id = 'canvas';
        canvas.innerHTML =
            '<div data-field-id="field"><div class="react-flow__handle"></div></div>';
        document.body.append(canvas);

        measureCanvasViewport();
        expect(document.documentElement.dataset.canvasViewportDurationMs).toBe(
            undefined
        );
        callbacks[0](0);
        callbacks[1](0);
        expect(document.documentElement.dataset.canvasViewportDomElements).toBe(
            '2'
        );
        expect(document.documentElement.dataset.canvasViewportFieldRows).toBe(
            '1'
        );
        expect(document.documentElement.dataset.canvasViewportHandles).toBe(
            '1'
        );
        expect(
            Number(document.documentElement.dataset.canvasViewportDurationMs)
        ).toBeGreaterThanOrEqual(0);
        canvas.remove();
    });
});
