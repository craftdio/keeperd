const isEnabled = () =>
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).has('canvasBenchmark');

export const countInteractionRender = (kind: 'table' | 'edge') => {
    if (!isEnabled()) return;
    const dataset = document.documentElement.dataset;
    const key =
        kind === 'table'
            ? 'canvasInteractionTableRenders'
            : 'canvasInteractionEdgeRenders';
    dataset[key] = String(Number(dataset[key] ?? 0) + 1);
};

export const measureCanvasInteraction = (kind: 'select' | 'drag') => {
    if (!isEnabled()) return;
    const dataset = document.documentElement.dataset;
    const startedAt = performance.now();
    const longTaskMs = Number(dataset.canvasBenchmarkLongTaskMs ?? 0);
    dataset.canvasInteractionType = kind;
    dataset.canvasInteractionTableRenders = '0';
    dataset.canvasInteractionEdgeRenders = '0';
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            dataset.canvasInteractionDurationMs = (
                performance.now() - startedAt
            ).toFixed(1);
            dataset.canvasInteractionLongTaskMs = (
                Number(dataset.canvasBenchmarkLongTaskMs ?? 0) - longTaskMs
            ).toFixed(1);
        });
    });
};

/** Time from a completed viewport gesture to the second painted frame. */
export const measureCanvasViewport = () => {
    if (!isEnabled()) return;
    const startedAt = performance.now();
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            const dataset = document.documentElement.dataset;
            dataset.canvasViewportDurationMs = (
                performance.now() - startedAt
            ).toFixed(1);
            const canvas = document.querySelector('#canvas');
            dataset.canvasViewportDomElements = String(
                canvas?.querySelectorAll('*').length ?? 0
            );
            dataset.canvasViewportFieldRows = String(
                canvas?.querySelectorAll('[data-field-id]').length ?? 0
            );
            dataset.canvasViewportHandles = String(
                canvas?.querySelectorAll('.react-flow__handle').length ?? 0
            );
        });
    });
};
