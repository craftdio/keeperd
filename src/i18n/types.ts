import type { en } from './locales/en';

export type LanguageTranslation = {
    // New color controls fall back to English until each locale is translated.
    translation: Omit<
        typeof en.translation,
        'color_picker' | 'selected_table_colors'
    > &
        Partial<
            Pick<
                typeof en.translation,
                'color_picker' | 'selected_table_colors'
            >
        >;
};

export type LanguageMetadata = {
    name: string;
    nativeName: string;
    code: string;
};
