import { useChartDB } from '@/hooks/use-chartdb';
import { useConfig } from '@/hooks/use-config';
import { useDialog } from '@/hooks/use-dialog';
import { useFullScreenLoader } from '@/hooks/use-full-screen-spinner';
import { useRedoUndoStack } from '@/hooks/use-redo-undo-stack';
import { useStorage } from '@/hooks/use-storage';
import type { Diagram } from '@/lib/domain/diagram';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

export const useDiagramLoader = () => {
    const [initialDiagram, setInitialDiagram] = useState<Diagram | undefined>();
    const { diagramId } = useParams<{ diagramId: string }>();
    const { config } = useConfig();
    const { loadDiagram, currentDiagram } = useChartDB();
    const { resetRedoStack, resetUndoStack } = useRedoUndoStack();
    const { showLoader, hideLoader } = useFullScreenLoader();
    const { openCreateDiagramDialog, openOpenDiagramDialog } = useDialog();
    const navigate = useNavigate();
    const { listDiagrams } = useStorage();

    const currentDiagramLoadingRef = useRef<string | undefined>(undefined);

    useEffect(() => {
        if (!config) {
            return;
        }

        if (currentDiagram?.id === diagramId) {
            return;
        }

        const loadDefaultDiagram = async () => {
            if (diagramId) {
                setInitialDiagram(undefined);
                showLoader();
                resetRedoStack();
                resetUndoStack();
                const diagram = await loadDiagram(diagramId);
                if (!diagram) {
                    openOpenDiagramDialog({ canClose: false });
                    hideLoader();
                    return;
                }

                setInitialDiagram(diagram);
                hideLoader();

                return;
            } else if (!diagramId && config.defaultDiagramId) {
                const diagram = await loadDiagram(config.defaultDiagramId);
                if (diagram) {
                    navigate(`/diagrams/${config.defaultDiagramId}`);

                    return;
                }
            }
            const diagrams = await listDiagrams();

            if (diagrams.length > 0) {
                openOpenDiagramDialog({ canClose: false });
            } else {
                openCreateDiagramDialog();
            }
        };

        if (
            currentDiagramLoadingRef.current === (diagramId ?? '') &&
            currentDiagramLoadingRef.current !== undefined
        ) {
            return;
        }
        currentDiagramLoadingRef.current = diagramId ?? '';

        loadDefaultDiagram();
    }, [
        diagramId,
        openCreateDiagramDialog,
        config,
        navigate,
        listDiagrams,
        loadDiagram,
        resetRedoStack,
        resetUndoStack,
        hideLoader,
        showLoader,
        currentDiagram?.id,
        openOpenDiagramDialog,
    ]);

    useEffect(() => {
        const refreshAppliedLayout = async (event: Event) => {
            const detail = (
                event as CustomEvent<{
                    diagramId?: string;
                    complete?: () => void;
                    fail?: (message: string) => void;
                }>
            ).detail;
            if (!detail?.diagramId || detail.diagramId !== diagramId) return;
            try {
                resetRedoStack();
                resetUndoStack();
                const diagram = await loadDiagram(detail.diagramId);
                if (!diagram)
                    throw new Error(
                        '적용한 ERD 작업 데이터를 찾을 수 없습니다.'
                    );
                setInitialDiagram(diagram);
                detail.complete?.();
            } catch (error) {
                detail.fail?.(
                    error instanceof Error
                        ? error.message
                        : '적용한 작업 데이터를 화면에 표시하지 못했습니다.'
                );
            }
        };
        window.addEventListener('keeperd-layout-applied', refreshAppliedLayout);
        return () =>
            window.removeEventListener(
                'keeperd-layout-applied',
                refreshAppliedLayout
            );
    }, [diagramId, loadDiagram, resetRedoStack, resetUndoStack]);

    return { initialDiagram };
};
