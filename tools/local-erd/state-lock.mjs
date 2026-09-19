import {
    closeSync,
    mkdirSync,
    openSync,
    readFileSync,
    statSync,
    unlinkSync,
    writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export class StateLockError extends Error {
    constructor(record) {
        const address = record?.port
            ? ` 기존 KeepERD 주소: http://localhost:${record.port}/`
            : '';
        super(`KeepERD가 이미 같은 사용자 데이터로 실행 중입니다.${address}`);
        this.name = 'StateLockError';
        this.record = record;
    }
}

const processIsAlive = (pid) => {
    if (!Number.isInteger(pid) || pid < 1) return false;
    try {
        process.kill(pid, 0);
        return true;
    } catch (error) {
        return error.code === 'EPERM';
    }
};

const readRecord = (file) => {
    try {
        return JSON.parse(readFileSync(file, 'utf8'));
    } catch {
        return null;
    }
};

export function acquireStateLock(
    state,
    { command = 'keeperd', port, env = process.env } = {}
) {
    mkdirSync(state, { recursive: true, mode: 0o700 });
    const file = path.join(state, '.keeperd.lock');
    const inherited = env.KEEPERD_LOCK_TOKEN;
    const existing = readRecord(file);
    if (
        inherited &&
        existing?.token === inherited &&
        processIsAlive(existing.pid)
    )
        return { delegated: true, token: inherited, release() {} };

    for (let attempt = 0; attempt < 2; attempt++) {
        const token = randomUUID();
        let descriptor;
        try {
            descriptor = openSync(file, 'wx', 0o600);
            writeFileSync(
                descriptor,
                JSON.stringify({
                    pid: process.pid,
                    command,
                    ...(port ? { port } : {}),
                    startedAt: new Date().toISOString(),
                    token,
                }) + '\n'
            );
            closeSync(descriptor);
            descriptor = undefined;
            let released = false;
            const release = () => {
                if (released) return;
                released = true;
                const current = readRecord(file);
                if (current?.token === token) {
                    try {
                        unlinkSync(file);
                    } catch (error) {
                        if (error.code !== 'ENOENT') throw error;
                    }
                }
            };
            return { delegated: false, token, release };
        } catch (error) {
            if (descriptor !== undefined) {
                closeSync(descriptor);
                try {
                    unlinkSync(file);
                } catch {
                    /* The original write failure is more useful. */
                }
            }
            if (error.code !== 'EEXIST') throw error;
            const record = readRecord(file);
            if (record && processIsAlive(record.pid))
                throw new StateLockError(record);
            if (!record && Date.now() - statSync(file).mtimeMs < 5000)
                throw new StateLockError(null);
            try {
                unlinkSync(file);
            } catch (unlinkError) {
                if (unlinkError.code !== 'ENOENT') throw unlinkError;
            }
        }
    }
    throw new StateLockError(readRecord(file));
}
