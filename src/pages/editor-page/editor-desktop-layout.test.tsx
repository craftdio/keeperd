import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { LayoutProvider } from '@/context/layout-context/layout-provider';
import { useLayout } from '@/hooks/use-layout';
import { EditorDesktopLayout } from './editor-desktop-layout';
import { TopNavbarMobile } from './top-navbar/top-navbar-mobile';
import { TooltipProvider } from '@/components/tooltip/tooltip';

const mobileToggle = vi.hoisted(() => vi.fn());
const canvasPosition = vi.hoisted(() => ({ openLeft: 600 }));
const canvasResize = vi.hoisted(() => ({ notify: () => {} }));
const viewportState = vi.hoisted(() => ({
    current: { x: -120, y: 45, zoom: 0.8 },
}));
const setViewport = vi.hoisted(() =>
    vi.fn((viewport: { x: number; y: number; zoom: number }) => {
        viewportState.current = viewport;
        return Promise.resolve(true);
    })
);
const animationFrames = new Map<number, FrameRequestCallback>();
let nextFrameId = 0;
const flushAnimationFrames = () => {
    for (const [id, callback] of [...animationFrames]) {
        animationFrames.delete(id);
        callback(performance.now());
    }
};

vi.mock('@xyflow/react', () => ({
    useReactFlow: () => ({
        getViewport: () => viewportState.current,
        setViewport,
    }),
}));

vi.mock('@/hooks/use-breakpoint', () => ({
    useBreakpoint: () => ({ isMd: true }),
}));
vi.mock('@/hooks/use-theme', () => ({
    useTheme: () => ({ effectiveTheme: 'dark' }),
}));
vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string) =>
            ({
                'menu.view.hide_sidebar': 'Hide Sidebar',
                'menu.view.show_sidebar': 'Show Sidebar',
            })[key] ?? key,
    }),
}));
vi.mock('@/components/sidebar/sidebar', () => ({
    SidebarProvider: ({ children }: { children: React.ReactNode }) => (
        <div>{children}</div>
    ),
}));
vi.mock('@/components/sidebar/use-sidebar', () => ({
    useSidebar: () => ({ toggleSidebar: mobileToggle }),
}));
vi.mock('@/components/resizable/resizable', () => ({
    ResizablePanelGroup: ({ children }: { children: React.ReactNode }) => (
        <div>{children}</div>
    ),
    ResizablePanel: ({
        children,
        className,
        id,
        style,
        'aria-hidden': ariaHidden,
    }: {
        children: React.ReactNode;
        className?: string;
        id?: string;
        style?: React.CSSProperties;
        'aria-hidden'?: boolean;
    }) => (
        <div
            id={id}
            className={className}
            style={style}
            aria-hidden={ariaHidden}
        >
            {children}
            {id === 'editor-sidebar-panel' && (
                <button
                    onClick={() => {
                        canvasPosition.openLeft = 450;
                        canvasResize.notify();
                    }}
                >
                    Resize panel
                </button>
            )}
        </div>
    ),
    ResizableHandle: ({ className }: { className?: string }) => (
        <div data-testid="resize-handle" className={className} />
    ),
}));
vi.mock('./editor-sidebar/editor-sidebar', () => ({
    EditorSidebar: () => {
        const { isSidePanelShowed, toggleSidePanel } = useLayout();
        return (
            <nav data-testid="sidebar-navigation">
                <button
                    aria-label={
                        isSidePanelShowed ? 'Hide Sidebar' : 'Show Sidebar'
                    }
                    aria-controls="editor-sidebar-panel"
                    aria-expanded={isSidePanelShowed}
                    onClick={toggleSidePanel}
                >
                    Sections
                </button>
            </nav>
        );
    },
}));
vi.mock('./side-panel/side-panel', async () => {
    const { useLayout } = await import('@/hooks/use-layout');
    return {
        SidePanel: () => {
            const { selectedSidebarSection } = useLayout();
            return (
                <aside>
                    <span>Section: {selectedSidebarSection}</span>
                    <input aria-label="Filter tables" />
                </aside>
            );
        },
    };
});
vi.mock('./canvas/canvas', () => ({
    Canvas: () => (
        <div
            id="canvas"
            data-testid="diagram-canvas"
            ref={(element) => {
                if (!element) return;
                element.getBoundingClientRect = () =>
                    ({
                        left:
                            document
                                .getElementById('editor-sidebar-panel')
                                ?.getAttribute('aria-hidden') === 'true'
                                ? 64
                                : canvasPosition.openLeft,
                    }) as DOMRect;
            }}
        >
            Canvas
        </div>
    ),
}));
vi.mock('./top-navbar/menu/menu', () => ({ Menu: () => null }));
vi.mock('./top-navbar/diagram-name', () => ({ DiagramName: () => null }));
vi.mock('./top-navbar/last-saved', () => ({ LastSaved: () => null }));
vi.mock('./top-navbar/language-nav/language-nav', () => ({
    LanguageNav: () => null,
}));

const LayoutControls = () => {
    const { selectSidebarSection, toggleSidePanel } = useLayout();
    return (
        <>
            <button onClick={() => selectSidebarSection('refs')}>
                Select Refs
            </button>
            <button onClick={toggleSidePanel}>Existing toggle</button>
        </>
    );
};

beforeEach(() => {
    animationFrames.clear();
    nextFrameId = 0;
    canvasPosition.openLeft = 600;
    viewportState.current = { x: -120, y: 45, zoom: 0.8 };
    setViewport.mockClear();
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
        const id = ++nextFrameId;
        animationFrames.set(id, callback);
        return id;
    });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => {
        animationFrames.delete(id);
    });
    vi.stubGlobal(
        'ResizeObserver',
        class {
            constructor(callback: ResizeObserverCallback) {
                canvasResize.notify = () =>
                    callback([], this as ResizeObserver);
            }
            observe() {}
            unobserve() {}
            disconnect() {}
        }
    );
});

it('collapses both left sections and restores their existing state', () => {
    render(
        <TooltipProvider>
            <LayoutProvider>
                <EditorDesktopLayout />
                <LayoutControls />
            </LayoutProvider>
        </TooltipProvider>
    );

    const navigation = document.getElementById('editor-sidebar-navigation');
    const panel = document.getElementById('editor-sidebar-panel');
    const handle = screen.getByTestId('resize-handle');
    const filter = screen.getByRole('textbox', { name: 'Filter tables' });
    expect(navigation).toHaveClass('contents');
    expect(panel).not.toHaveClass('hidden');
    expect(panel).toHaveAttribute(
        'style',
        'min-width: min(350px, calc(50vw - 248px)); max-width: calc(50vw - 248px);'
    );
    expect(screen.getByTestId('diagram-canvas')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Select Refs' }));
    fireEvent.change(filter, { target: { value: 'position' } });
    fireEvent.click(screen.getByRole('button', { name: 'Resize panel' }));
    expect(setViewport).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Hide Sidebar' }));
    flushAnimationFrames();

    expect(navigation).toHaveClass('contents');
    expect(screen.getByTestId('sidebar-navigation')).toBeVisible();
    expect(panel).toHaveClass('hidden');
    expect(panel).toHaveAttribute('aria-hidden', 'true');
    expect(handle).toHaveClass('hidden');
    expect(screen.getByTestId('diagram-canvas')).toBeInTheDocument();
    expect(setViewport).toHaveBeenLastCalledWith({
        x: 266,
        y: 45,
        zoom: 0.8,
    });
    const reopen = screen.getByRole('button', { name: 'Show Sidebar' });
    expect(reopen).toHaveAttribute('aria-expanded', 'false');
    expect(navigation).toContainElement(reopen);
    expect(reopen).toHaveAttribute('aria-controls', 'editor-sidebar-panel');

    fireEvent.click(reopen);
    flushAnimationFrames();
    expect(navigation).toHaveClass('contents');
    expect(panel).not.toHaveClass('hidden');
    expect(screen.getByText('Section: refs')).toBeInTheDocument();
    expect(filter).toHaveValue('position');
    expect(setViewport).toHaveBeenLastCalledWith({
        x: -120,
        y: 45,
        zoom: 0.8,
    });
    expect(
        screen.getByRole('button', { name: 'Hide Sidebar' })
    ).toHaveAttribute('aria-expanded', 'true');
    expect(navigation).toContainElement(
        screen.getByRole('button', { name: 'Hide Sidebar' })
    );
});

it('keeps the visible toggle synchronized with the existing menu and shortcut state', () => {
    render(
        <TooltipProvider>
            <LayoutProvider>
                <EditorDesktopLayout />
                <LayoutControls />
            </LayoutProvider>
        </TooltipProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Existing toggle' }));
    flushAnimationFrames();
    expect(
        screen.getByRole('button', { name: 'Show Sidebar' })
    ).toHaveAttribute('aria-expanded', 'false');
    expect(viewportState.current).toEqual({ x: 416, y: 45, zoom: 0.8 });
    expect(document.getElementById('editor-sidebar-navigation')).toHaveClass(
        'contents'
    );

    fireEvent.click(screen.getByRole('button', { name: 'Existing toggle' }));
    flushAnimationFrames();
    expect(
        screen.getByRole('button', { name: 'Hide Sidebar' })
    ).toHaveAttribute('aria-expanded', 'true');
    expect(viewportState.current).toEqual({ x: -120, y: 45, zoom: 0.8 });
    expect(document.getElementById('editor-sidebar-navigation')).toHaveClass(
        'contents'
    );
});

it('compensates for a panel width restored after the toggle layout effect', () => {
    render(
        <TooltipProvider>
            <LayoutProvider>
                <EditorDesktopLayout />
            </LayoutProvider>
        </TooltipProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Resize panel' }));
    fireEvent.click(screen.getByRole('button', { name: 'Hide Sidebar' }));
    flushAnimationFrames();
    expect(viewportState.current).toEqual({ x: 266, y: 45, zoom: 0.8 });

    fireEvent.click(screen.getByRole('button', { name: 'Show Sidebar' }));
    // The resizable panel finishes restoring to a different width after the
    // parent layout effect has already run.
    canvasPosition.openLeft = 520;
    canvasResize.notify();
    flushAnimationFrames();

    expect(viewportState.current).toEqual({ x: -190, y: 45, zoom: 0.8 });
    expect(canvasPosition.openLeft + viewportState.current.x).toBe(330);
});

it('keeps the mobile header on its existing menu control', () => {
    mobileToggle.mockClear();
    render(<TopNavbarMobile />);

    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).not.toHaveAccessibleName('Show Sidebar');
    fireEvent.click(buttons[0]);
    expect(mobileToggle).toHaveBeenCalledOnce();
});
