import React from 'react';
import { useTheme } from '@/hooks/use-theme';

export interface EditorBrandProps {
    lightLogo: string;
    darkLogo?: string;
}

export const EditorBrand: React.FC<EditorBrandProps> = ({
    lightLogo,
    darkLogo,
}) => {
    const { effectiveTheme } = useTheme();
    const localERD = import.meta.env.VITE_LOCAL_ERD === 'true';

    return (
        <div className="flex min-w-0 shrink-0 items-center gap-2">
            {localERD ? (
                <a
                    href="/"
                    aria-label="KeepERD 브랜치 목록 홈으로 이동"
                    className="shrink-0 rounded px-1 py-0.5 font-semibold tracking-tight text-foreground hover:text-pink-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pink-500"
                >
                    KeepERD
                </a>
            ) : (
                <a
                    href="https://github.com/craftdio/keeperd"
                    className="cursor-pointer"
                    rel="noreferrer"
                >
                    <img
                        src={
                            effectiveTheme === 'light'
                                ? lightLogo
                                : (darkLogo ?? lightLogo)
                        }
                        alt="KeepERD"
                        className="h-4 max-w-fit"
                    />
                </a>
            )}
        </div>
    );
};
