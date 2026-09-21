export function githubGitEnvironment(environment = process.env) {
    const configuredCount = environment.GIT_CONFIG_COUNT ?? '0';
    const count = /^\d+$/.test(configuredCount) ? Number(configuredCount) : 0;
    return {
        ...environment,
        GIT_TERMINAL_PROMPT: '0',
        GIT_CONFIG_COUNT: String(count + 2),
        [`GIT_CONFIG_KEY_${count}`]: 'credential.https://github.com.helper',
        [`GIT_CONFIG_VALUE_${count}`]: '',
        [`GIT_CONFIG_KEY_${count + 1}`]: 'credential.https://github.com.helper',
        [`GIT_CONFIG_VALUE_${count + 1}`]: '!gh auth git-credential',
    };
}
