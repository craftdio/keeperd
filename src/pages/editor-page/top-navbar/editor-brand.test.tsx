import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { TopNavbar } from './top-navbar';
import { TopNavbarMobile } from './top-navbar-mobile';

vi.mock('@/hooks/use-theme', () => ({
    useTheme: () => ({ effectiveTheme: 'dark' }),
}));
vi.mock('@/components/sidebar/use-sidebar', () => ({
    useSidebar: () => ({ toggleSidebar: vi.fn() }),
}));
vi.mock('./menu/menu', () => ({ Menu: () => <div>Menu</div> }));
vi.mock('./diagram-name', () => ({ DiagramName: () => <div>Diagram</div> }));
vi.mock('./last-saved', () => ({ LastSaved: () => null }));
vi.mock('./language-nav/language-nav', () => ({ LanguageNav: () => null }));

afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
});

it('shows only the KeepERD home link in the local desktop header', () => {
    vi.stubEnv('VITE_LOCAL_ERD', 'true');
    const { container } = render(<TopNavbar />);

    const brand = screen.getByRole('link', {
        name: 'KeepERD 브랜치 목록 홈으로 이동',
    });
    expect(brand).toHaveAttribute('href', '/');
    expect(brand).toHaveTextContent('KeepERD');
    expect(screen.getAllByRole('link')).toHaveLength(1);
    expect(brand).toHaveClass('focus-visible:outline');
    expect(container.querySelector('nav')).toHaveClass('lg:flex-row');
    expect(container.querySelector('nav')).not.toHaveClass('md:flex-row');
    expect(screen.queryByRole('link', { name: 'KeepERD' })).toBeNull();
});

it('keeps the mobile menu and shows only the local home link', () => {
    vi.stubEnv('VITE_LOCAL_ERD', 'true');
    render(<TopNavbarMobile />);

    expect(screen.getByRole('button')).toBeInTheDocument();
    expect(
        screen.getByRole('link', {
            name: 'KeepERD 브랜치 목록 홈으로 이동',
        })
    ).toHaveAttribute('href', '/');
    expect(screen.getAllByRole('link')).toHaveLength(1);
});

it('preserves the original logo link outside local KeepERD mode', () => {
    vi.stubEnv('VITE_LOCAL_ERD', 'false');
    const desktop = render(<TopNavbar />);

    expect(screen.getByRole('link', { name: 'KeepERD' })).toHaveAttribute(
        'href',
        'https://github.com/craftdio/keeperd'
    );
    expect(screen.getByRole('img', { name: 'KeepERD' })).toBeInTheDocument();
    expect(
        screen.queryByRole('link', { name: '브랜치 목록으로 돌아가기' })
    ).toBeNull();
    expect(desktop.container.querySelector('nav')).toHaveClass('md:flex-row');
    desktop.unmount();

    render(<TopNavbarMobile />);
    expect(screen.getByRole('link', { name: 'KeepERD' })).toHaveAttribute(
        'href',
        'https://github.com/craftdio/keeperd'
    );
    expect(
        screen.queryByRole('link', { name: '브랜치 목록으로 돌아가기' })
    ).toBeNull();
});
