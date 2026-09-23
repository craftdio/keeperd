import { randomBytes } from 'node:crypto';
import { lstatSync, readFileSync } from 'node:fs';
import { connect } from 'node:net';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { localCommand } from './cli-command.mjs';
import { statePaths } from './state-paths.mjs';
import { matchesStopProof, stopProof } from './stop-control.mjs';

export class StopError extends Error {
    constructor(code, message) {
        super(message);
        this.code = code;
    }
}

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const portIsOpen = (port) =>
    new Promise((resolve) => {
        const socket = connect({ host: '127.0.0.1', port });
        socket.setTimeout(250);
        socket.once('connect', () => {
            socket.destroy();
            resolve(true);
        });
        socket.once('error', (error) => resolve(error.code !== 'ECONNREFUSED'));
        socket.once('timeout', () => {
            socket.destroy();
            resolve(true);
        });
    });

function readServerLock(file) {
    let record;
    try {
        if (!lstatSync(file).isFile())
            throw new StopError(
                'LOCK_INVALID',
                '잠금 파일이 일반 파일이 아닙니다.'
            );
        record = JSON.parse(readFileSync(file, 'utf8'));
    } catch (error) {
        if (error.code === 'ENOENT') return null;
        if (error instanceof StopError) throw error;
        throw new StopError(
            'LOCK_INVALID',
            'KeepERD 잠금 파일을 읽거나 해석할 수 없습니다.'
        );
    }
    if (
        record?.command !== 'start' ||
        !Number.isInteger(record.pid) ||
        record.pid < 1 ||
        !Number.isInteger(record.port) ||
        record.port < 1 ||
        record.port > 65535 ||
        typeof record.token !== 'string' ||
        !/^[a-f0-9-]{36}$/.test(record.token)
    )
        throw new StopError(
            'NOT_SERVER_LOCK',
            '잠금이 실행 중인 KeepERD 서버를 가리키지 않습니다. Sync·초기화 작업이나 오래된 잠금은 종료하지 않습니다.'
        );
    return record;
}

const processIsAlive = (pid) => {
    try {
        process.kill(pid, 0);
        return true;
    } catch (error) {
        return error.code === 'EPERM';
    }
};

async function controlRequest(url, options = {}) {
    return fetch(url, {
        redirect: 'manual',
        cache: 'no-store',
        signal: AbortSignal.timeout(1500),
        ...options,
    });
}

async function challenge(base, record) {
    const nonce = randomBytes(16).toString('hex');
    const response = await controlRequest(
        `${base}/_keeperd/stop?nonce=${nonce}`
    );
    if (response.status !== 200)
        throw new StopError(
            'IDENTITY_MISMATCH',
            '잠금에 기록된 포트가 같은 KeepERD 서버인지 확인할 수 없습니다. 다른 프로세스는 종료하지 않았습니다.'
        );
    let payload;
    try {
        payload = await response.json();
    } catch {
        throw new StopError(
            'IDENTITY_MISMATCH',
            '종료 대상 서버의 확인 응답이 올바르지 않습니다.'
        );
    }
    if (
        payload.pid !== record.pid ||
        !matchesStopProof(record.token, 'identify', nonce, payload.proof)
    )
        throw new StopError(
            'IDENTITY_MISMATCH',
            'PID가 재사용됐거나 포트에 다른 프로세스가 있습니다. 어떤 프로세스도 종료하지 않았습니다.'
        );
    return nonce;
}

async function awaitStopped(lockFile, record, deadline) {
    while (Date.now() < deadline) {
        const current = readServerLock(lockFile);
        if (
            (!current || current.token !== record.token) &&
            !(await portIsOpen(record.port))
        )
            return { status: 'stopped', pid: record.pid, port: record.port };
        await pause(100);
    }
    throw new StopError(
        'STOP_TIMEOUT',
        '종료 확인 시간이 지났습니다. 잠금과 포트 상태를 확인하세요. 강제 종료는 하지 않았습니다.'
    );
}

export async function stopKeeperd({
    lockFile = statePaths().lock,
    timeoutMs = 5000,
} = {}) {
    const record = readServerLock(lockFile);
    if (!record) return { status: 'already-stopped' };
    const base = `http://localhost:${record.port}`;
    let nonce;
    try {
        nonce = await challenge(base, record);
    } catch (error) {
        if (error instanceof StopError) throw error;
        throw new StopError(
            processIsAlive(record.pid) ? 'IDENTITY_MISMATCH' : 'STALE_LOCK',
            processIsAlive(record.pid)
                ? '기록된 포트에서 잠금 소유 서버를 확인할 수 없습니다. 다른 프로세스는 종료하지 않았습니다.'
                : '실행 중인 서버가 없는 오래된 잠금입니다. 서버를 다시 시작하면 안전하게 정리됩니다.'
        );
    }
    // Re-read the lock before requesting termination; a changed owner must not be stopped.
    if (readServerLock(lockFile)?.token !== record.token)
        throw new StopError(
            'LOCK_CHANGED',
            '확인 중 서버 잠금 소유자가 바뀌었습니다. 다시 시도하세요.'
        );
    let response;
    try {
        response = await controlRequest(`${base}/_keeperd/stop`, {
            method: 'POST',
            headers: {
                'X-KeeperD-Stop-Nonce': nonce,
                'X-KeeperD-Stop-Proof': stopProof(
                    record.token,
                    'authorize',
                    nonce
                ),
            },
        });
    } catch {
        // The server may have accepted the request and exited before the response arrived.
        return awaitStopped(lockFile, record, Date.now() + timeoutMs);
    }
    if (response.status === 409) {
        const payload = await response.json();
        throw new StopError(payload.code ?? 'STOP_BUSY', payload.error);
    }
    if (response.status !== 200)
        throw new StopError(
            'STOP_REFUSED',
            '서버가 종료 요청을 거부했습니다. 기존 프로세스는 유지됩니다.'
        );
    const payload = await response.json();
    if (payload.pid !== record.pid || payload.stopping !== true)
        throw new StopError(
            'IDENTITY_MISMATCH',
            '종료 응답의 서버 정체가 일치하지 않습니다.'
        );
    return awaitStopped(lockFile, record, Date.now() + timeoutMs);
}

export async function main(args = process.argv.slice(2)) {
    if (args.includes('--help') || args.includes('-h')) {
        console.log(
            `Usage: ${localCommand('stop')}\n현재 사용자 데이터 폴더에서 실행 중인 KeepERD 서버만 확인 후 종료합니다. Sync 중에는 종료하지 않습니다.`
        );
        return 0;
    }
    if (args.length) {
        console.error('keeperd stop은 인수를 받지 않습니다.');
        return 1;
    }
    try {
        const result = await stopKeeperd();
        console.log(
            result.status === 'stopped'
                ? `KeepERD 서버가 종료됐습니다. (포트 ${result.port}) 설정과 ERD 데이터는 유지됩니다.`
                : '현재 사용자 데이터 폴더에 실행 중인 KeepERD 서버가 없습니다.'
        );
        return 0;
    } catch (error) {
        console.error(`KeepERD 종료 실패: ${error.message}`);
        return 1;
    }
}

if (
    process.argv[1] &&
    path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
    process.exitCode = await main();
