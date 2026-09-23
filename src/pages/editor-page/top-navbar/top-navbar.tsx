import React from 'react';
import ChartDBLogo from '@/assets/logo-light.png';
import ChartDBDarkLogo from '@/assets/logo-dark.png';
import { cn } from '@/lib/utils';
import { DiagramName } from './diagram-name';
import { LastSaved } from './last-saved';
import { LanguageNav } from './language-nav/language-nav';
import { Menu } from './menu/menu';
import { EditorBrand } from './editor-brand';

export interface TopNavbarProps {}

export const TopNavbar: React.FC<TopNavbarProps> = () => {
    const localERD = import.meta.env.VITE_LOCAL_ERD === 'true';

    return (
        <nav
            className={cn(
                'flex flex-col justify-between border-b px-3 md:px-4',
                localERD
                    ? 'lg:h-12 lg:flex-row lg:items-center'
                    : 'md:h-12 md:flex-row md:items-center'
            )}
        >
            <div
                className={cn(
                    'flex flex-1 flex-col justify-between gap-x-1',
                    localERD
                        ? 'lg:flex-row lg:justify-normal'
                        : 'md:flex-row md:justify-normal'
                )}
            >
                <div className="flex items-center justify-between gap-1 pt-[8px] font-primary md:py-[10px]">
                    <EditorBrand
                        lightLogo={ChartDBLogo}
                        darkLogo={ChartDBDarkLogo}
                    />
                </div>
                <Menu />
            </div>
            <DiagramName />
            <div className="hidden flex-1 items-center justify-end gap-2 sm:flex">
                <LastSaved />
                <LanguageNav />
            </div>
        </nav>
    );
};
