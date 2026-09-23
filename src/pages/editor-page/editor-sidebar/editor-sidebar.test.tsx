import React from 'react';
import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { EditorSidebar } from './editor-sidebar';
import { TooltipProvider } from '@/components/tooltip/tooltip';

vi.mock('@/hooks/use-layout', () => ({
    useLayout: () => ({
        selectSidebarSection: vi.fn(),
        selectedSidebarSection: 'tables',
        isSidePanelShowed: true,
        toggleSidePanel: vi.fn(),
        showSidePanel: vi.fn(),
        selectVisualsTab: vi.fn(),
    }),
}));
vi.mock('@/hooks/use-breakpoint', () => ({
    useBreakpoint: () => ({ isMd: true }),
}));
vi.mock('@/hooks/use-chartdb', () => ({
    useChartDB: () => ({ databaseType: 'postgresql' }),
}));
vi.mock('@/hooks/use-dialog', () => ({
    useDialog: () => ({
        openCreateDiagramDialog: vi.fn(),
        openOpenDiagramDialog: vi.fn(),
    }),
}));
vi.mock('@/components/sidebar/use-sidebar', () => ({
    useSidebar: () => ({ isMobile: false, state: 'expanded' }),
}));
vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}));

it('shows a distinct ChartDB source link at the bottom of the sidebar', () => {
    render(
        <TooltipProvider>
            <EditorSidebar />
        </TooltipProvider>
    );

    const source = screen.getByRole('link', { name: 'ChartDB Source' });
    expect(source).toHaveAttribute(
        'href',
        'https://github.com/chartdb/chartdb'
    );
    expect(source).toHaveAttribute('target', '_blank');
    expect(source).toHaveAttribute('rel', 'noopener noreferrer');
    expect(source).toHaveTextContent('ChartDBSource');
    expect(source.querySelector('span')).toHaveClass('text-center');
    expect(screen.queryByText('GitHub Issues')).toBeNull();
    const toggle = screen.getByRole('button', {
        name: 'menu.view.hide_sidebar',
    });
    expect(toggle.closest('[data-sidebar="header"]')).not.toBeNull();
    expect(toggle).toHaveAttribute('aria-controls', 'editor-sidebar-panel');
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
});
