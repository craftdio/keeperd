import { createServer } from 'node:http';
import {
    readFile,
    stat,
    access,
    writeFile,
    rename,
    mkdir,
} from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { chooseRepositoryFolder } from './folder-picker.mjs';
import { listSaved, deleteSaved, LibraryError } from './library-store.mjs';
import { createMemoryCache } from './memory-cache.mjs';
import { hasCurrentBuild } from './build-state.mjs';
import { localCommand } from './cli-command.mjs';
import { stateDirectory } from './state-paths.mjs';
import { acquireStateLock } from './state-lock.mjs';
import { nodeCommand } from './node-command.mjs';
import {
    diagramKey,
    canonicalRepository,
    listBranches,
    validateBranch,
    getAccount,
    listRepositories,
    githubFailure,
} from './branches.mjs';
import {
    registerLocalRepository,
    describeLocalRepository,
    resolveLocalRepository,
    localBranchDetails,
    localDiagramKey,
    checkRemoteBranch,
    LocalSourceError,
} from './local-source.mjs';
const root = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(root, '../../dist');
const state = stateDirectory();
const port = Number(process.env.LOCAL_ERD_PORT ?? 18777);
const rejectJson = (res, status, code, error) =>
    res
        .writeHead(status, {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store',
        })
        .end(JSON.stringify({ code, error }));
if (!Number.isInteger(port) || port < 0 || port > 65535)
    throw new Error('LOCAL_ERD_PORT must be a valid TCP port');
let stateLock;
try {
    stateLock = acquireStateLock(state, { command: 'start', port });
} catch (error) {
    console.error(error.message);
    process.exit(1);
}
const releaseStateLock = () => stateLock.release();
process.once('exit', releaseStateLock);
for (const signal of ['SIGINT', 'SIGTERM'])
    process.once(signal, () => {
        releaseStateLock();
        process.exit(0);
    });
await mkdir(path.join(state, 'data'), { recursive: true });
try {
    await access(path.join(state, 'data/snapshots.json'));
} catch {
    await writeFile(
        path.join(state, 'data/snapshots.json'),
        JSON.stringify({ snapshots: [] })
    );
}
try {
    await Promise.all([
        access(path.join(state, 'config.json')),
        access(path.join(state, 'data/snapshots.json')),
    ]);
} catch {
    console.error(
        `최초 설정이 필요합니다. 먼저 ${localCommand('init')}을 실행하세요.`
    );
    process.exit(1);
}
if (!hasCurrentBuild(path.resolve(root, '../..'))) {
    console.log('현재 ChartDB 코드에 맞춰 로컬 ERD 화면을 빌드합니다…');
    const child = spawn(process.execPath, [path.join(root, 'build.mjs')], {
        cwd: path.resolve(root, '../..'),
        stdio: 'inherit',
    });
    const code = await new Promise((resolve) => child.once('close', resolve));
    if (code !== 0) {
        console.error(
            '로컬 ERD 화면 빌드에 실패했습니다. 오류를 해결한 뒤 다시 실행하세요.'
        );
        process.exit(1);
    }
}
try {
    await access(path.join(dist, 'index.html'));
} catch {
    console.error(
        `로컬 ERD 빌드 결과를 찾을 수 없습니다. ${localCommand('init')}을 다시 실행하세요.`
    );
    process.exit(1);
}
const types = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.woff2': 'font/woff2',
    '.jpg': 'image/jpeg',
};
let job = { id: 0, status: 'idle', message: '', progress: 0 };
const remoteChecks = new Map();
let registering = false;
let pickingFolder = false;
let deleting = false;
const githubCache = createMemoryCache();
const primaryRepository = (config) =>
    config.repositoryUrl ? canonicalRepository(config.repositoryUrl) : null;
function startSync(branch, repositoryUrl, primaryUrl, local, mode = 'commit') {
    if (job.status === 'running') return;
    job = {
        id: Date.now(),
        status: 'running',
        branch,
        repositoryUrl,
        diagramId: `debut-${local ? localDiagramKey(local, branch, mode) : diagramKey(repositoryUrl, branch, primaryUrl)}`,
        ...(local
            ? { source: { kind: 'local', repositoryId: local.id, mode } }
            : {}),
        message: `${repositoryUrl.replace('https://github.com/', '').replace(/\.git$/, '')} · ${branch} 가져오는 중…`,
        progress: 3,
    };
    const child = spawn(
        nodeCommand(),
        [
            path.join(root, 'sync.mjs'),
            `--branch=${branch}`,
            `--repository=${repositoryUrl}`,
            ...(local
                ? [
                      `--local=${local.id}`,
                      ...(mode === 'worktree' ? ['--worktree'] : []),
                      ...(remoteChecks.has(`${local.id}:${branch}`)
                          ? [
                                `--remote-check=${Buffer.from(JSON.stringify(remoteChecks.get(`${local.id}:${branch}`))).toString('base64url')}`,
                            ]
                          : []),
                  ]
                : []),
        ],
        {
            cwd: root,
            stdio: ['ignore', 'pipe', 'pipe'],
            env: {
                ...process.env,
                KEEPERD_LOCK_TOKEN: stateLock.token,
            },
        }
    );
    let pending = '',
        errors = '';
    child.stdout.on('data', (chunk) => {
        pending += chunk.toString();
        const lines = pending.split('\n');
        pending = lines.pop();
        for (const line of lines) {
            if (line.startsWith('PROGRESS ')) {
                const match = line.match(/^PROGRESS (\d+) (.+)$/);
                if (match)
                    Object.assign(job, {
                        progress: Number(match[1]),
                        message: match[2],
                    });
            }
        }
    });
    child.stderr.on('data', (chunk) => {
        errors = (errors + chunk.toString()).slice(-3000);
    });
    child.on('error', (error) => {
        Object.assign(job, {
            status: 'error',
            message: `동기화 실행 실패: ${error.message}`,
        });
    });
    child.on('close', (code) => {
        if (job.status === 'error') return;
        if (code === 0)
            Object.assign(job, {
                status: 'success',
                progress: 100,
                message: '동기화 완료. 최신 ERD를 불러옵니다.',
            });
        else {
            let detail;
            try {
                detail = JSON.parse(errors.trim().split('\n').at(-1));
            } catch {
                /* No raw subprocess output is exposed. */
            }
            Object.assign(job, {
                status: 'error',
                code: detail?.code ?? 'SYNC_FAILED',
                message:
                    detail?.error ??
                    '동기화에 실패했습니다. 실행 환경을 확인하세요. 기존 ERD는 유지됩니다.',
            });
        }
    });
}
const server = createServer(async (req, res) => {
    try {
        const url = new URL(req.url, 'http://localhost');
        const listeningPort = server.address().port;
        if (req.headers.host === `127.0.0.1:${listeningPort}`) {
            res.writeHead(308, {
                Location: `http://localhost:${listeningPort}${req.url}`,
                'Cache-Control': 'no-store',
            }).end();
            return;
        }
        if (url.pathname.startsWith('/api/')) {
            const origin = `http://${req.headers.host}`;
            if (
                req.headers.host !== `localhost:${listeningPort}` ||
                (req.headers.origin && req.headers.origin !== origin) ||
                (req.headers['sec-fetch-site'] &&
                    !['same-origin', 'none'].includes(
                        req.headers['sec-fetch-site']
                    ))
            ) {
                rejectJson(
                    res,
                    403,
                    'REQUEST_ORIGIN_REJECTED',
                    'Local ERD 서버와 같은 브라우저 주소에서 요청하세요.'
                );
                return;
            }
            if (
                ![
                    '/api/sync',
                    '/api/branches',
                    '/api/account',
                    '/api/repositories',
                    '/api/context',
                    '/api/local/repositories',
                    '/api/local/folder',
                    '/api/local/branches',
                    '/api/local/check',
                    '/api/library',
                ].includes(url.pathname)
            ) {
                res.writeHead(404).end();
                return;
            }
            const config = JSON.parse(
                await readFile(path.join(state, 'config.json'), 'utf8')
            );
            if (url.pathname.startsWith('/api/local/')) {
                try {
                    let payload;
                    if (url.pathname === '/api/local/folder') {
                        if (
                            req.method !== 'POST' ||
                            req.headers['x-local-erd'] !== 'sync'
                        ) {
                            rejectJson(
                                res,
                                403,
                                'LOCAL_REQUEST_FORBIDDEN',
                                '로컬 폴더 선택 요청을 확인하세요.'
                            );
                            return;
                        }
                        if (pickingFolder) {
                            rejectJson(
                                res,
                                409,
                                'FOLDER_PICKER_BUSY',
                                '이미 열린 폴더 선택 창을 확인하세요.'
                            );
                            return;
                        }
                        pickingFolder = true;
                        try {
                            const selection = await chooseRepositoryFolder();
                            res.writeHead(200, {
                                'Content-Type': 'application/json',
                                'Cache-Control': 'no-store',
                            }).end(JSON.stringify(selection));
                        } finally {
                            pickingFolder = false;
                        }
                        return;
                    }
                    if (url.pathname === '/api/local/repositories') {
                        if (req.method === 'POST') {
                            if (req.headers['x-local-erd'] !== 'sync') {
                                rejectJson(
                                    res,
                                    403,
                                    'LOCAL_REQUEST_FORBIDDEN',
                                    '로컬 저장소 등록 요청을 확인하세요.'
                                );
                                return;
                            }
                            if (job.status === 'running' || registering) {
                                rejectJson(
                                    res,
                                    409,
                                    'LOCAL_REQUEST_BUSY',
                                    'Sync 또는 로컬 저장소 등록이 진행 중입니다.'
                                );
                                return;
                            }
                            registering = true;
                            try {
                                const chunks = [];
                                let size = 0;
                                for await (const chunk of req) {
                                    chunks.push(chunk);
                                    size += chunk.length;
                                    if (size > 8192) {
                                        rejectJson(
                                            res,
                                            413,
                                            'REQUEST_TOO_LARGE',
                                            '로컬 저장소 등록 요청이 너무 큽니다.'
                                        );
                                        return;
                                    }
                                }
                                const local = registerLocalRepository(
                                    JSON.parse(
                                        Buffer.concat(chunks).toString('utf8')
                                    ).path
                                );
                                Object.assign(
                                    config,
                                    JSON.parse(
                                        await readFile(
                                            path.join(state, 'config.json'),
                                            'utf8'
                                        )
                                    )
                                );
                                config.localRepositories = [
                                    ...(config.localRepositories ?? []).filter(
                                        (r) => r.id !== local.id
                                    ),
                                    local,
                                ];
                                const configFile = path.join(
                                    state,
                                    'config.json'
                                );
                                await writeFile(
                                    `${configFile}.tmp`,
                                    JSON.stringify(config, null, 2)
                                );
                                await rename(`${configFile}.tmp`, configFile);
                            } finally {
                                registering = false;
                            }
                        } else if (req.method !== 'GET') {
                            rejectJson(
                                res,
                                405,
                                'METHOD_NOT_ALLOWED',
                                '지원하지 않는 요청 방식입니다.'
                            );
                            return;
                        }
                        payload = {
                            repositories: (config.localRepositories ?? []).map(
                                describeLocalRepository
                            ),
                            primaryUrl: primaryRepository(config),
                        };
                    } else {
                        if (req.method !== 'GET') {
                            rejectJson(
                                res,
                                405,
                                'METHOD_NOT_ALLOWED',
                                '지원하지 않는 요청 방식입니다.'
                            );
                            return;
                        }
                        const local = resolveLocalRepository(
                            config,
                            url.searchParams.get('local')
                        );
                        if (url.pathname === '/api/local/check') {
                            const branch = validateBranch(
                                url.searchParams.get('branch')
                            );
                            payload = checkRemoteBranch(local, branch);
                            remoteChecks.set(`${local.id}:${branch}`, payload);
                        } else payload = localBranchDetails(local);
                    }
                    res.writeHead(200, {
                        'Content-Type': 'application/json',
                        'Cache-Control': 'no-store',
                    }).end(JSON.stringify(payload));
                } catch (error) {
                    res.writeHead(400, {
                        'Content-Type': 'application/json',
                    }).end(
                        JSON.stringify({
                            code:
                                error instanceof LocalSourceError
                                    ? error.code
                                    : 'LOCAL_REQUEST_FAILED',
                            error:
                                error instanceof LocalSourceError
                                    ? error.message
                                    : '로컬 요청을 처리하지 못했습니다. 경로와 Git 상태를 확인하세요.',
                        })
                    );
                }
                return;
            }
            if (url.pathname === '/api/library') {
                try {
                    let payload;
                    if (req.method === 'GET')
                        payload = await listSaved(
                            path.join(state, 'data'),
                            primaryRepository(config)
                        );
                    else if (req.method === 'POST') {
                        if (req.headers['x-local-erd'] !== 'sync') {
                            res.writeHead(403).end();
                            return;
                        }
                        if (deleting || job.status === 'running') {
                            res.writeHead(409, {
                                'Content-Type': 'application/json',
                            }).end(
                                JSON.stringify({
                                    error: 'Sync 또는 삭제 작업이 진행 중입니다. 완료 후 다시 시도하세요.',
                                })
                            );
                            return;
                        }
                        deleting = true;
                        try {
                            const chunks = [];
                            let size = 0;
                            for await (const chunk of req) {
                                size += chunk.length;
                                if (size > 8192) {
                                    res.writeHead(413).end();
                                    return;
                                }
                                chunks.push(chunk);
                            }
                            payload = await deleteSaved(
                                path.join(state, 'data'),
                                JSON.parse(
                                    Buffer.concat(chunks).toString('utf8')
                                ).ids
                            );
                        } finally {
                            deleting = false;
                        }
                    } else {
                        res.writeHead(405).end();
                        return;
                    }
                    res.writeHead(200, {
                        'Content-Type': 'application/json',
                        'Cache-Control': 'no-store',
                    }).end(JSON.stringify(payload));
                } catch (error) {
                    res.writeHead(
                        error.code === 'SELECTION_CHANGED' ? 409 : 400,
                        { 'Content-Type': 'application/json' }
                    ).end(
                        JSON.stringify({
                            code:
                                error instanceof LibraryError
                                    ? error.code
                                    : 'LIBRARY_FAILED',
                            error:
                                error instanceof LibraryError
                                    ? error.message
                                    : '저장된 ERD 작업에 실패했습니다. 저장 폴더와 권한을 확인하세요.',
                        })
                    );
                }
                return;
            }
            if (url.pathname === '/api/context') {
                if (req.method !== 'GET') {
                    res.writeHead(405).end();
                    return;
                }
                res.writeHead(200, {
                    'Content-Type': 'application/json',
                    'Cache-Control': 'no-store',
                }).end(
                    JSON.stringify({
                        primaryUrl: primaryRepository(config),
                    })
                );
                return;
            }
            if (['/api/account', '/api/repositories'].includes(url.pathname)) {
                if (req.method !== 'GET') {
                    res.writeHead(405).end();
                    return;
                }
                try {
                    const refresh = url.searchParams.get('refresh') === '1';
                    const result = await githubCache.get(
                        url.pathname,
                        async () =>
                            url.pathname === '/api/account'
                                ? getAccount()
                                : {
                                      repositories: await listRepositories(),
                                      primaryUrl: primaryRepository(config),
                                  },
                        { refresh }
                    );
                    res.writeHead(200, {
                        'Content-Type': 'application/json',
                        'Cache-Control': 'no-store',
                        'X-Local-ERD-Cache': result.cached ? 'hit' : 'miss',
                    }).end(JSON.stringify(result.value));
                } catch (error) {
                    const failure = githubFailure(error);
                    res.writeHead(failure.status, {
                        'Content-Type': 'application/json',
                        'Cache-Control': 'no-store',
                    }).end(
                        JSON.stringify({
                            code: failure.code,
                            error: failure.error,
                        })
                    );
                }
                return;
            }
            if (url.pathname === '/api/branches') {
                if (req.method !== 'GET') {
                    res.writeHead(405).end();
                    return;
                }
                let repositoryUrl;
                try {
                    repositoryUrl = canonicalRepository(
                        url.searchParams.get('repository') ??
                            primaryRepository(config)
                    );
                } catch {
                    rejectJson(
                        res,
                        400,
                        'INVALID_REPOSITORY',
                        '동기화할 GitHub 저장소 주소를 선택하세요.'
                    );
                    return;
                }
                try {
                    const result = await githubCache.get(
                        `/api/branches:${repositoryUrl}`,
                        () => listBranches(repositoryUrl),
                        { refresh: url.searchParams.get('refresh') === '1' }
                    );
                    res.writeHead(200, {
                        'Content-Type': 'application/json',
                        'Cache-Control': 'no-store',
                        'X-Local-ERD-Cache': result.cached ? 'hit' : 'miss',
                    }).end(JSON.stringify({ branches: result.value }));
                } catch (error) {
                    const failure = githubFailure(error);
                    res.writeHead(failure.status, {
                        'Content-Type': 'application/json',
                        'Cache-Control': 'no-store',
                    }).end(
                        JSON.stringify({
                            code: failure.code,
                            error: failure.error,
                        })
                    );
                }
                return;
            }
            if (req.method === 'POST') {
                if (deleting) {
                    res.writeHead(409).end('Deletion in progress');
                    return;
                }
                if (req.headers['x-local-erd'] !== 'sync') {
                    res.writeHead(403).end();
                    return;
                }
                if (job.status === 'running') {
                    res.writeHead(409, {
                        'Content-Type': 'application/json',
                    }).end(JSON.stringify(job));
                    return;
                }
                let branch;
                try {
                    branch = validateBranch(url.searchParams.get('branch'));
                } catch {
                    rejectJson(
                        res,
                        400,
                        'INVALID_BRANCH',
                        '브랜치 이름을 확인하세요.'
                    );
                    return;
                }
                try {
                    const localId = url.searchParams.get('local');
                    const local = localId
                        ? resolveLocalRepository(config, localId)
                        : null;
                    const repositoryUrl =
                        local?.repositoryUrl ??
                        canonicalRepository(
                            url.searchParams.get('repository') ??
                                primaryRepository(config)
                        );
                    const mode = url.searchParams.get('mode') ?? 'commit';
                    if (local && !['commit', 'worktree'].includes(mode))
                        throw new LocalSourceError(
                            'LOCAL_MODE_INVALID',
                            '입력 모드를 확인하세요.'
                        );
                    startSync(
                        branch,
                        repositoryUrl,
                        primaryRepository(config),
                        local,
                        mode
                    );
                } catch (error) {
                    res.writeHead(400, {
                        'Content-Type': 'application/json',
                    }).end(
                        JSON.stringify({
                            code: error.code ?? 'LOCAL_REQUEST_FAILED',
                            error:
                                error instanceof LocalSourceError
                                    ? error.message
                                    : '로컬 입력을 확인하세요.',
                        })
                    );
                    return;
                }
            } else if (req.method !== 'GET') {
                res.writeHead(405).end();
                return;
            }
            res.writeHead(req.method === 'POST' ? 202 : 200, {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-store',
            }).end(JSON.stringify(job));
            return;
        }
        if (
            [
                '/sync-ui.js',
                '/home.js',
                '/picker.js',
                '/schema-diff.js',
                '/repository-switcher.js',
                '/library.js',
                '/browser-store.js',
                '/layout-transfer.js',
            ].includes(url.pathname)
        ) {
            res.writeHead(200, {
                'Content-Type': 'text/javascript',
                'Cache-Control': 'no-store',
            }).end(await readFile(path.join(root, url.pathname.slice(1))));
            return;
        }
        if (url.pathname === '/saved') {
            res.writeHead(200, {
                'Content-Type': 'text/html; charset=utf-8',
                'Cache-Control': 'no-store',
            }).end(await readFile(path.join(root, 'library.html')));
            return;
        }
        const base = url.pathname.startsWith('/data/') ? state : dist;
        let file =
            url.pathname === '/'
                ? path.join(root, 'index.html')
                : path.resolve(base, '.' + decodeURIComponent(url.pathname));
        if (
            !file.startsWith(base + path.sep) &&
            file !== path.join(root, 'index.html')
        ) {
            res.writeHead(403).end();
            return;
        }
        try {
            if (!(await stat(file)).isFile()) throw new Error();
        } catch {
            if (base === state) {
                res.writeHead(404).end();
                return;
            }
            file = path.join(dist, 'index.html');
        }
        let body = await readFile(file);
        if (file === path.join(dist, 'index.html'))
            body = Buffer.from(
                body
                    .toString()
                    .replace(
                        '</body>',
                        `<script>addEventListener('vite:preloadError',function(event){try{var key='chartdb:chunk-recovery:'+location.pathname;var now=Date.now();var previous=Number(sessionStorage.getItem(key));if(Number.isFinite(previous)&&now-previous<60000)return;event.preventDefault();sessionStorage.setItem(key,String(now));location.reload()}catch(error){console.error(error)}})</script><a href="/" style="position:fixed;bottom:12px;left:12px;z-index:99999;background:#172554;color:white;padding:8px 14px;border-radius:8px;font:13px sans-serif">← 브랜치 목록</a><script type="module" src="/sync-ui.js"></script></body>`
                    )
            );
        res.writeHead(200, {
            'Content-Type':
                types[path.extname(file)] ?? 'application/octet-stream',
            'Cache-Control': 'no-store',
            'X-Content-Type-Options': 'nosniff',
        }).end(body);
    } catch {
        res.writeHead(500).end('Local ERD server error');
    }
});
const localhostServer = createServer((req, res) =>
    server.emit('request', req, res)
);
server.listen(port, '127.0.0.1', () => {
    const listeningPort = server.address().port;
    localhostServer.listen(listeningPort, '::1', () =>
        console.log(`KeepERD: http://localhost:${listeningPort}`)
    );
});
