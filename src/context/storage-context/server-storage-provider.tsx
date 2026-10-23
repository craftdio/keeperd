import React, { useMemo, useState, useEffect } from 'react';
import { storageContext } from './storage-context';
import { createServerStorage } from './server-storage';

export const ServerStorageProvider: React.FC<React.PropsWithChildren> = ({
    children,
}) => {
    const storage = useMemo(createServerStorage, []);
    const [notice, setNotice] = useState('');
    useEffect(() => {
        const listener = (event: Event) =>
            setNotice((event as CustomEvent<string>).detail);
        window.addEventListener('keeperd:storage-notice', listener);
        return () =>
            window.removeEventListener('keeperd:storage-notice', listener);
    }, []);
    return (
        <storageContext.Provider value={storage}>
            {notice && (
                <div
                    role="alert"
                    className="fixed inset-x-4 top-4 z-[10000] rounded border border-amber-500 bg-background p-4 text-sm shadow-lg"
                >
                    {notice}
                    <button
                        type="button"
                        className="ml-4 underline"
                        onClick={() => setNotice('')}
                    >
                        닫기
                    </button>
                </div>
            )}
            {children}
        </storageContext.Provider>
    );
};
