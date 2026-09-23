import React, { useEffect, useLayoutEffect, useRef } from 'react';
import { useReactFlow } from '@xyflow/react';
import {
    ResizableHandle,
    ResizablePanel,
    ResizablePanelGroup,
} from '@/components/resizable/resizable';
import { SidePanel } from './side-panel/side-panel';
import { Canvas } from './canvas/canvas';
import { useLayout } from '@/hooks/use-layout';
import type { Diagram } from '@/lib/domain/diagram';
import { cn } from '@/lib/utils';
import { SidebarProvider } from '@/components/sidebar/sidebar';
import { EditorSidebar } from './editor-sidebar/editor-sidebar';
import { TopNavbar } from './top-navbar/top-navbar';

const EMPTY_TABLES: NonNullable<Diagram['tables']> = [];
// Reserve the navigation rail (64px), half of the centered toolbar (167px),
// the resize handle (1px), and a 16px gap before the toolbar.
const SIDE_PANEL_VIEWPORT_CLEARANCE = 'calc(50vw - 248px)';

export interface EditorDesktopLayoutProps {
    initialDiagram?: Diagram;
}
export const EditorDesktopLayout: React.FC<EditorDesktopLayoutProps> = ({
    initialDiagram,
}) => {
    const { isSidePanelShowed } = useLayout();
    const { getViewport, setViewport } = useReactFlow();
    const canvasLeftRef = useRef<number | null>(null);
    const previousVisibilityRef = useRef(isSidePanelShowed);
    const pendingToggleRef = useRef(false);
    const frameRef = useRef<number | null>(null);

    // ResizablePanel can restore its width in a child layout effect, after this
    // effect has run. Measure the final canvas origin in the next frame.
    useLayoutEffect(() => {
        const canvas = document.getElementById('canvas');
        if (!canvas) return;

        if (
            (previousVisibilityRef.current !== isSidePanelShowed ||
                pendingToggleRef.current) &&
            canvasLeftRef.current !== null
        ) {
            const previousLeft = canvasLeftRef.current;
            pendingToggleRef.current = true;
            frameRef.current = requestAnimationFrame(() => {
                const canvasLeft = canvas.getBoundingClientRect().left;
                const offset = previousLeft - canvasLeft;
                if (offset !== 0) {
                    const viewport = getViewport();
                    void setViewport({ ...viewport, x: viewport.x + offset });
                }
                canvasLeftRef.current = canvasLeft;
                pendingToggleRef.current = false;
                frameRef.current = null;
            });
        } else if (!pendingToggleRef.current) {
            canvasLeftRef.current = canvas.getBoundingClientRect().left;
        }

        previousVisibilityRef.current = isSidePanelShowed;
        return () => {
            if (frameRef.current !== null) {
                cancelAnimationFrame(frameRef.current);
                frameRef.current = null;
            }
        };
    }, [isSidePanelShowed, getViewport, setViewport]);

    // Panel resizing also changes the canvas origin. Observe the committed
    // size so the next toggle uses its actual, most recent left edge.
    useEffect(() => {
        const canvas = document.getElementById('canvas');
        if (!canvas || typeof ResizeObserver === 'undefined') return;

        const observer = new ResizeObserver(() => {
            if (!pendingToggleRef.current) {
                canvasLeftRef.current = canvas.getBoundingClientRect().left;
            }
        });
        observer.observe(canvas);
        return () => observer.disconnect();
    }, []);

    return (
        <>
            <TopNavbar />
            <SidebarProvider
                defaultOpen={false}
                open={false}
                className="h-full min-h-0"
            >
                <div id="editor-sidebar-navigation" className="contents">
                    <EditorSidebar />
                </div>
                <ResizablePanelGroup direction="horizontal">
                    <ResizablePanel
                        id="editor-sidebar-panel"
                        defaultSize={25}
                        minSize={25}
                        maxSize={isSidePanelShowed ? 99 : 0}
                        className={cn({
                            hidden: !isSidePanelShowed,
                        })}
                        style={
                            isSidePanelShowed
                                ? {
                                      minWidth: `min(350px, ${SIDE_PANEL_VIEWPORT_CLEARANCE})`,
                                      maxWidth: SIDE_PANEL_VIEWPORT_CLEARANCE,
                                  }
                                : undefined
                        }
                        aria-hidden={!isSidePanelShowed}
                    >
                        <SidePanel />
                    </ResizablePanel>
                    <ResizableHandle
                        disabled={!isSidePanelShowed}
                        className={!isSidePanelShowed ? 'hidden' : ''}
                    />
                    <ResizablePanel defaultSize={75}>
                        <Canvas
                            initialTables={
                                initialDiagram?.tables ?? EMPTY_TABLES
                            }
                        />
                    </ResizablePanel>
                </ResizablePanelGroup>
            </SidebarProvider>
        </>
    );
};

export default EditorDesktopLayout;
