import { parentPort, workerData } from 'node:worker_threads';
import {
    resolveLocalRepository,
    localBranchDetails,
    LocalSourceError,
} from './local-source.mjs';

try {
    const { registered } = workerData;
    const repo = resolveLocalRepository(
        { localRepositories: [registered] },
        registered.id
    );
    parentPort.postMessage({ value: localBranchDetails(repo) });
} catch (error) {
    parentPort.postMessage({
        error: {
            code:
                error instanceof LocalSourceError
                    ? error.code
                    : 'LOCAL_REQUEST_FAILED',
            message:
                error instanceof LocalSourceError
                    ? error.message
                    : '로컬 브랜치 조회에 실패했습니다. 경로와 Git 상태를 확인하세요.',
        },
    });
}
