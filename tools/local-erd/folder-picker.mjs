import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { LocalSourceError, registerLocalRepository } from './local-source.mjs';
const run = promisify(execFile);
export async function chooseRepositoryFolder() {
    if (process.platform !== 'darwin')
        throw new LocalSourceError(
            'FOLDER_PICKER_UNAVAILABLE',
            '폴더 선택은 macOS에서 지원합니다. 절대 경로를 입력하세요.'
        );
    try {
        const { stdout } = await run(
            '/usr/bin/osascript',
            [
                '-e',
                'POSIX path of (choose folder with prompt "Git 저장소 폴더를 선택하세요. 바로 안에 .git 폴더 또는 파일이 있어야 합니다.")',
            ],
            { timeout: 120000, maxBuffer: 8192 }
        );
        return { path: registerLocalRepository(stdout.trim()).path };
    } catch (error) {
        if (error instanceof LocalSourceError) throw error;
        if (error.stderr?.includes('(-128)')) return { cancelled: true };
        throw new LocalSourceError(
            'FOLDER_PICKER_FAILED',
            '폴더 선택을 완료하지 못했습니다. 다시 시도하거나 절대 경로를 입력하세요.'
        );
    }
}
