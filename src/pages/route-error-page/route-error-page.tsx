import React, { useEffect } from 'react';
import { useRouteError } from 'react-router-dom';
import {
    chunkRecoveryKey,
    claimChunkReload,
    isChunkLoadError,
} from '@/lib/chunk-load-recovery';

export const RouteErrorPage: React.FC = () => {
    const error = useRouteError();
    const staleBuild = isChunkLoadError(error);
    const localERD = import.meta.env.VITE_LOCAL_ERD === 'true';

    useEffect(() => {
        if (
            localERD &&
            staleBuild &&
            claimChunkReload({
                pathname: window.location.pathname,
                storage: window.sessionStorage,
            })
        ) {
            window.location.reload();
        }
    }, [localERD, staleBuild]);

    const retry = () => {
        window.sessionStorage.removeItem(
            chunkRecoveryKey(window.location.pathname)
        );
        window.location.reload();
    };

    return (
        <main className="grid min-h-screen place-items-center bg-slate-950 px-6 text-slate-100">
            <section className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-8 text-center shadow-2xl">
                <h1 className="mb-3 text-2xl font-bold">
                    {staleBuild
                        ? '새 버전으로 화면을 다시 불러와야 해요'
                        : '화면을 불러오지 못했어요'}
                </h1>
                <p className="mb-6 leading-7 text-slate-300">
                    {staleBuild
                        ? '빌드가 갱신되어 이전 화면 파일을 사용할 수 없습니다. 자동 복구가 되지 않았다면 아래 버튼을 눌러주세요.'
                        : '잠시 후 다시 시도해 주세요. 문제가 계속되면 로컬 서버 터미널의 오류를 확인해 주세요.'}
                </p>
                <button
                    type="button"
                    className="rounded-lg bg-indigo-600 px-5 py-3 font-semibold text-white hover:bg-indigo-500"
                    onClick={retry}
                >
                    최신 화면 다시 불러오기
                </button>
            </section>
        </main>
    );
};
