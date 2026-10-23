import { accessSync, constants } from 'node:fs';

export function nodeCommand(execPath = process.execPath) {
    try {
        accessSync(execPath, constants.X_OK);
        return execPath;
    } catch {
        // Never switch a running server to an unverified Node from PATH.
        throw new Error(
            '실행 중인 Node 런타임이 제거됐습니다. Node 26.12.1을 확인한 뒤 KeepERD를 다시 시작하세요.'
        );
    }
}
