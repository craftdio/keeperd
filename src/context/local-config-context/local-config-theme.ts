import type { Theme } from '../theme-context/theme-context';

export const resolveInitialTheme = (
    storedTheme: Theme | null,
    localERD = import.meta.env.VITE_LOCAL_ERD === 'true'
): Theme => {
    if (localERD && (!storedTheme || storedTheme === 'system')) return 'dark';
    return storedTheme || 'system';
};
