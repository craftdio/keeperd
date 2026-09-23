import React from 'react';
import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { CodeSnippet } from './code-snippet';

const mocks = vi.hoisted(() => ({
    defineTheme: vi.fn(),
    setTheme: vi.fn(),
    revealLine: vi.fn(),
}));

vi.mock('@/hooks/use-theme', () => ({
    useTheme: () => ({ effectiveTheme: 'dark' }),
}));
vi.mock('@/components/toast/use-toast', () => ({
    useToast: () => ({ toast: vi.fn() }),
}));
vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('./code-editor', async () => {
    const React = await import('react');
    return {
        Editor: ({
            onMount,
        }: {
            onMount: (editor: never, monaco: never) => void;
        }) => {
            React.useEffect(() => {
                onMount(
                    {
                        getModel: () => ({ getLineCount: () => 3 }),
                        revealLine: mocks.revealLine,
                    } as never,
                    {
                        editor: {
                            defineTheme: mocks.defineTheme,
                            setTheme: mocks.setTheme,
                        },
                    } as never
                );
            }, [onMount]);
            return React.createElement('div', { 'data-testid': 'editor' });
        },
        DiffEditor: () => null,
    };
});

afterEach(() => {
    cleanup();
    vi.clearAllMocks();
});

it('sets the theme, scrolls, and forwards the editor mount callback after lazy loading', async () => {
    const onMount = vi.fn();
    const editorProps = { onMount };
    const { rerender } = render(
        <CodeSnippet
            code="select 1"
            autoScroll
            allowCopy={false}
            editorProps={editorProps}
        />
    );

    await waitFor(() => expect(onMount).toHaveBeenCalledOnce());
    expect(mocks.defineTheme).toHaveBeenCalledWith('dark', expect.any(Object));
    expect(mocks.setTheme).toHaveBeenCalledWith('dark');
    expect(mocks.revealLine).toHaveBeenCalledWith(3);

    rerender(
        <CodeSnippet
            code="select 2"
            autoScroll
            allowCopy={false}
            editorProps={editorProps}
        />
    );
    await waitFor(() => expect(mocks.revealLine).toHaveBeenCalledTimes(2));
});
