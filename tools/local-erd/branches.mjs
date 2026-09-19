import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec = promisify(execFile);

export function githubFailure(error) {
    if (error?.code === 'ENOENT')
        return {
            status: 503,
            code: 'CLI_MISSING',
            error: 'GitHub CLI(gh)가 설치되어 있지 않습니다. 설치 후 터미널에서 로그인하세요.',
        };
    const detail = `${error?.stderr ?? ''} ${error?.message ?? ''}`;
    if (
        /HTTP\s+401|gh auth login|not logged (?:in|into)|authentication token.*invalid/i.test(
            detail
        )
    )
        return {
            status: 401,
            code: 'AUTH_REQUIRED',
            error: 'GitHub 로그인이 없거나 인증이 만료됐습니다. 서버를 실행한 컴퓨터의 터미널에서 로그인하세요.',
        };
    return {
        status: 502,
        code: 'GITHUB_UNAVAILABLE',
        error: 'GitHub에 연결하지 못했습니다. 네트워크와 저장소 접근 권한을 확인하고 다시 시도하세요.',
    };
}

export function repositorySlug(url) {
    const match = /^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)$/.exec(url);
    if (!match) throw new Error('Invalid GitHub repository URL');
    return `${match[1]}/${match[2].replace(/\.git$/, '')}`;
}

export function validateBranch(branch) {
    if (
        typeof branch !== 'string' ||
        !branch ||
        branch.length > 255 ||
        branch.startsWith('-') ||
        branch.startsWith('/') ||
        branch.endsWith('/') ||
        branch.endsWith('.') ||
        /[\s~^:?*[\\]/.test(branch) ||
        [...branch].some(
            (c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127
        ) ||
        branch.includes('..') ||
        branch.includes('@{') ||
        branch.includes('//') ||
        branch === '@' ||
        branch.split('/').some((p) => p.startsWith('.') || p.endsWith('.lock'))
    )
        throw new Error('Invalid branch name');
    return branch;
}

export function branchKey(branch) {
    validateBranch(branch);
    // Preserve existing IDs and URLs; hash other refs for safe paths and DB names.
    return ['develop', 'main'].includes(branch)
        ? branch
        : `branch-${createHash('sha256').update(branch).digest('hex').slice(0, 24)}`;
}

export function mergeSnapshots(previous, updated) {
    const key = (s) =>
        `${s.repositoryUrl ? repositorySlug(s.repositoryUrl).toLowerCase() : ''}:${s.branch}:${s.source?.kind === 'local' ? `${s.source.repositoryId}:${s.source.mode}` : 'remote'}`;
    const merged = new Map(previous.map((s) => [key(s), s]));
    for (const snapshot of updated) merged.set(key(snapshot), snapshot);
    return [...merged.values()];
}

export function canonicalRepository(url) {
    return `https://github.com/${repositorySlug(url).toLowerCase()}.git`;
}

export function repositoryKey(url) {
    return createHash('sha256')
        .update(canonicalRepository(url))
        .digest('hex')
        .slice(0, 24);
}

export function diagramKey(url, branch, primaryUrl) {
    return primaryUrl &&
        canonicalRepository(url) === canonicalRepository(primaryUrl)
        ? branchKey(branch)
        : `repo-${repositoryKey(url)}-${branchKey(branch)}`;
}

async function githubAPI(endpoint, paginate = false) {
    const { stdout } = await exec(
        'gh',
        [
            'api',
            '--hostname',
            'github.com',
            ...(paginate ? ['--paginate', '--slurp'] : []),
            endpoint,
        ],
        { timeout: 30000, maxBuffer: 16 * 1024 * 1024 }
    );
    const payload = JSON.parse(stdout);
    return paginate ? payload.flat() : payload;
}

export function sortBranchesByUpdatedAt(branches) {
    return [...branches]
        .map((branch) => ({
            name: validateBranch(branch.name),
            updatedAt: branch.updatedAt ?? null,
        }))
        .sort(
            (a, b) =>
                (Date.parse(b.updatedAt ?? '') || 0) -
                    (Date.parse(a.updatedAt ?? '') || 0) ||
                a.name.localeCompare(b.name)
        );
}

export async function getAccount() {
    const user = await githubAPI('user');
    return {
        login: user.login,
        name: user.name || user.login,
        avatarUrl: user.avatar_url,
        url: user.html_url,
    };
}

export async function listRepositories() {
    const repos = await githubAPI(
        'user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member',
        true
    );
    return repos.map((repo) => ({
        name: repo.full_name,
        url: `https://github.com/${repo.full_name}.git`,
        private: repo.private,
        defaultBranch: repo.default_branch,
        owner: {
            login: repo.owner.login,
            avatarUrl: repo.owner.avatar_url,
            type: repo.owner.type,
        },
    }));
}

export async function listBranches(repositoryUrl) {
    const [owner, name] = repositorySlug(repositoryUrl).split('/');
    const { stdout } = await exec(
        'gh',
        [
            'api',
            'graphql',
            '--hostname',
            'github.com',
            '--paginate',
            '--slurp',
            '-f',
            `query=query($endCursor: String) {
              repository(owner: "${owner}", name: "${name}") {
                refs(refPrefix: "refs/heads/", first: 100, after: $endCursor) {
                  nodes {
                    name
                    target {
                      ... on Commit { committedDate }
                    }
                  }
                  pageInfo { hasNextPage endCursor }
                }
              }
            }`,
        ],
        { timeout: 30000, maxBuffer: 16 * 1024 * 1024 }
    );
    const branches = JSON.parse(stdout).flatMap(
        (page) => page.data?.repository?.refs?.nodes ?? []
    );
    return sortBranchesByUpdatedAt(
        branches.map((branch) => ({
            name: branch.name,
            updatedAt: branch.target?.committedDate,
        }))
    ).map((branch) => branch.name);
}
