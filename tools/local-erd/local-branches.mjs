import { Worker } from 'node:worker_threads';
import { LocalSourceError } from './local-source.mjs';

// Only in-flight results are shared. Each later refresh re-reads refs and dirty
// worktrees, including force pushes, branch deletions and schema edits.
export function createLocalBranchReader({
    concurrency = 2,
    capacity = 10,
    timeout = 25000,
    workerURL = new URL('./local-branches-worker.mjs', import.meta.url),
} = {}) {
    const jobs = new Map(),
        waiting = [],
        workers = new Set();
    let closed = false;
    const settle = (job, error, value) => {
        if (job.done) return;
        job.done = true;
        clearTimeout(job.timer);
        jobs.delete(job.key);
        if (error) job.reject(error);
        else job.resolve(value);
    };
    const start = () => {
        while (!closed && workers.size < concurrency && waiting.length) {
            const job = waiting.shift();
            if (job.done) continue;
            let worker;
            try {
                worker = new Worker(workerURL, {
                    workerData: { registered: job.registered },
                });
            } catch {
                settle(
                    job,
                    new LocalSourceError(
                        'LOCAL_REQUEST_FAILED',
                        '브랜치 조회 작업을 시작하지 못했습니다.'
                    )
                );
                continue;
            }
            job.worker = worker;
            workers.add(worker);
            worker.once('message', (result) => {
                if (result.error)
                    settle(
                        job,
                        new LocalSourceError(
                            result.error.code,
                            result.error.message
                        )
                    );
                else settle(job, null, result.value);
            });
            worker.once('error', () =>
                settle(
                    job,
                    new LocalSourceError(
                        'LOCAL_REQUEST_FAILED',
                        '브랜치 조회 작업이 실패했습니다.'
                    )
                )
            );
            worker.once('exit', () => {
                settle(
                    job,
                    new LocalSourceError(
                        'LOCAL_REQUEST_FAILED',
                        '브랜치 조회 작업이 종료됐습니다.'
                    )
                );
                workers.delete(worker);
                start();
            });
        }
    };
    return {
        read(config, id) {
            const registered = config.localRepositories?.find(
                (repo) => repo.id === id
            );
            if (!registered)
                return Promise.reject(
                    new LocalSourceError(
                        'LOCAL_NOT_REGISTERED',
                        '먼저 로컬 clone/worktree를 등록하세요.'
                    )
                );
            const key = JSON.stringify(registered);
            if (jobs.has(key)) return jobs.get(key).promise;
            if (closed || jobs.size >= capacity)
                return Promise.reject(
                    new LocalSourceError(
                        'LOCAL_BRANCH_BUSY',
                        '브랜치 조회가 많습니다. 잠시 후 다시 시도하세요.'
                    )
                );
            const job = { key, registered };
            job.promise = new Promise((resolve, reject) => {
                job.resolve = resolve;
                job.reject = reject;
            });
            job.timer = setTimeout(() => {
                const index = waiting.indexOf(job);
                if (index !== -1) waiting.splice(index, 1);
                settle(
                    job,
                    new LocalSourceError(
                        'LOCAL_BRANCH_TIMEOUT',
                        '브랜치 조회 시간이 초과됐습니다. Git 상태를 확인한 뒤 다시 시도하세요.'
                    )
                );
                void job.worker?.terminate();
                start();
            }, timeout);
            jobs.set(key, job);
            waiting.push(job);
            start();
            return job.promise;
        },
        async close() {
            closed = true;
            for (const job of jobs.values())
                settle(
                    job,
                    new LocalSourceError(
                        'LOCAL_REQUEST_FAILED',
                        '브랜치 조회를 종료했습니다.'
                    )
                );
            waiting.length = 0;
            await Promise.all([...workers].map((worker) => worker.terminate()));
        },
    };
}
