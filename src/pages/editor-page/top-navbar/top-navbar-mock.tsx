import React from 'react';

import ChartDBLogo from '@/assets/logo-light.png';
import ChartDBDarkLogo from '@/assets/logo-dark.png';
import { EditorBrand } from './editor-brand';

export const TopNavbarMock: React.FC = () => {
    return (
        <nav className="flex h-[105px] flex-col justify-between border-b px-3 md:h-12 md:flex-row md:items-center md:px-4">
            <div className="flex flex-1 flex-col justify-between gap-x-1 md:flex-row md:justify-normal">
                <div className="flex items-center justify-between pt-[8px] font-primary md:py-[10px]">
                    <EditorBrand
                        lightLogo={ChartDBLogo}
                        darkLogo={ChartDBDarkLogo}
                    />
                </div>
            </div>
        </nav>
    );
};
