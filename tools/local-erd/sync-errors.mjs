export class SyncEnvironmentError extends Error {
    constructor(code, message, options) {
        super(message, options);
        this.code = code;
    }
}

export function classifyGitError(error, args) {
    const detail = `${error.stderr ?? ''} ${error.message ?? ''}`;
    if (
        /authentication failed|could not read username|terminal prompts disabled/i.test(
            detail
        )
    )
        return new SyncEnvironmentError(
            'GITHUB_AUTH_REQUIRED',
            'GitHub 인증을 확인하세요. gh auth login 후 다시 시도하세요.',
            { cause: error }
        );
    if (
        /permission denied|repository not found|403|access denied/i.test(detail)
    )
        return new SyncEnvironmentError(
            'GITHUB_PERMISSION_DENIED',
            'GitHub 저장소 접근 권한을 확인하세요.',
            { cause: error }
        );
    if (
        /could not resolve host|failed to connect|connection timed out|network is unreachable/i.test(
            detail
        )
    )
        return new SyncEnvironmentError(
            'GITHUB_NETWORK_FAILED',
            'GitHub 네트워크 연결에 실패했습니다. 인터넷과 프록시 설정을 확인하세요.',
            { cause: error }
        );
    if (
        /couldn.t find remote ref|unknown revision|not a valid object name|needed a single revision/i.test(
            detail
        ) ||
        args.includes('rev-parse')
    )
        return new SyncEnvironmentError(
            'GIT_BRANCH_NOT_FOUND',
            '선택한 Git 브랜치 또는 커밋을 찾을 수 없습니다. 브랜치 목록을 새로고침하세요.',
            { cause: error }
        );
    return new SyncEnvironmentError(
        'GIT_OPERATION_FAILED',
        'Git 저장소를 읽지 못했습니다. 저장소 상태와 원격 설정을 확인하세요.',
        { cause: error }
    );
}
