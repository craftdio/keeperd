import React from 'react';
import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { ViewportCenteredControls } from './viewport-centered-controls';

vi.mock('@xyflow/react', () => ({
    Controls: ({
        children,
        className,
        position,
        style,
    }: {
        children: React.ReactNode;
        className?: string;
        position?: string;
        style?: React.CSSProperties;
    }) => (
        <div
            data-testid="centered-controls"
            data-position={position}
            className={className}
            style={style}
        >
            {children}
        </div>
    ),
}));

it('anchors desktop controls to the screen while keeping the bottom offset', () => {
    render(
        <ViewportCenteredControls
            desktop
            position="bottom-center"
            className="!shadow-none"
            style={{ bottom: '70px' }}
        >
            Toolbar
        </ViewportCenteredControls>
    );

    const controls = screen.getByTestId('centered-controls');
    expect(controls).toHaveClass('!fixed', '!z-20', '!shadow-none');
    expect(controls).toHaveAttribute('data-position', 'bottom-center');
    expect(controls).toHaveStyle({ bottom: '70px' });
});

it('keeps mobile controls positioned relative to the canvas', () => {
    render(
        <ViewportCenteredControls desktop={false} position="top-center">
            Toolbar
        </ViewportCenteredControls>
    );

    const controls = screen.getByTestId('centered-controls');
    expect(controls).not.toHaveClass('!fixed');
    expect(controls).toHaveAttribute('data-position', 'top-center');
});
