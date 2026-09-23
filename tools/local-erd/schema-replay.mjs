export const schemaInputDirectories = [
    'db/schema',
    'db/migration',
    'src/main/resources/db/migration',
    'alembic',
];

export const schemaInputPaths = [
    ...schemaInputDirectories,
    'alembic.ini',
    'Dockerfile',
    'docker-compose.yml',
    '.env.example',
];

export function isSchemaInputFile(name) {
    return (
        ((name.startsWith('db/schema/') ||
            name.startsWith('db/migration/') ||
            name.startsWith('src/main/resources/db/migration/')) &&
            name.endsWith('.sql')) ||
        name === 'alembic.ini' ||
        name === 'Dockerfile' ||
        name === 'docker-compose.yml' ||
        name === '.env.example' ||
        name === 'alembic/env.py' ||
        (name.startsWith('alembic/versions/') && name.endsWith('.py'))
    );
}

export const supportedSchemaMethods = [
    'Atlas 선언 SQL (db/schema/*.sql)',
    'debut 순차 SQL (db/migration/*.sql)',
    '설정된 Flyway SQL (src/main/resources/db/migration/{V,R}*.sql)',
    '설정된 Alembic revision (alembic/versions/*.py)',
    '설정된 Airflow 메타 DB (Dockerfile의 고정 버전)',
];

const supportMessage = `현재 지원 방식: ${supportedSchemaMethods.join(', ')}`;

export class SchemaReplayError extends Error {
    constructor(code, message, options) {
        super(`${message} ${supportMessage}`, options);
        this.code = code;
    }
}

const flywayProfiles = new Map([
    [
        'https://github.com/nangmanazit/myhouse-agent-backend.git',
        {
            postgresImage: 'postgres:17-alpine',
            flywayImage: 'redgate/flyway:11.7.2-alpine',
            location: 'src/main/resources/db/migration',
            schemas: ['myhouse_agent'],
            defaultSchema: 'myhouse_agent',
            initSql: 'CREATE SCHEMA IF NOT EXISTS myhouse_agent',
        },
    ],
    [
        'https://github.com/nangmanazit/nangmanazit-data-batch.git',
        {
            postgresImage: 'postgres:17-alpine',
            flywayImage: 'redgate/flyway:11.7.2-alpine',
            location: 'src/main/resources/db/migration',
            schemas: ['public'],
            defaultSchema: 'public',
        },
    ],
]);

const alembicProfiles = new Map([
    [
        'https://github.com/nangmanazit/myhouse-backend.git',
        {
            postgresImage: 'postgres:17-alpine',
            pythonImage:
                'python:3.14-slim@sha256:a7fb1e634c4a578f9e0bd6327f11a3cde11b7a9395f48e24360c0988bcc5c2bc',
            alembicImage: 'keeperd-alembic:1.18.4-python3.14',
            alembicVersion: '1.18.4',
            sqlalchemyVersion: '2.0.51',
            psycopgVersion: '2.9.12',
            location: 'alembic/versions',
            config: 'alembic.ini',
            environment: 'alembic/env.py',
            schema: 'myhouse',
        },
    ],
]);

const airflowProfiles = new Map([
    [
        'https://github.com/nangmanazit/nangmanazit-data-airflow.git',
        {
            files: ['Dockerfile', 'docker-compose.yml', '.env.example'],
            supportedVersions: new Map([['3.3.1', ['3.12']]]),
            authManager:
                'airflow.providers.fab.auth_manager.fab_auth_manager.FabAuthManager',
        },
    ],
]);

const normalizedRepository = (url = '') =>
    url
        .trim()
        .replace(/\/$/, '')
        .toLowerCase()
        .replace(/\.git$/, '') + '.git';

export function flywayProfile(repositoryUrl) {
    const profile = flywayProfiles.get(normalizedRepository(repositoryUrl));
    return profile ? structuredClone(profile) : null;
}

export function alembicProfile(repositoryUrl) {
    const profile = alembicProfiles.get(normalizedRepository(repositoryUrl));
    return profile ? structuredClone(profile) : null;
}

export function airflowProfile(repositoryUrl) {
    const profile = airflowProfiles.get(normalizedRepository(repositoryUrl));
    return profile ? structuredClone(profile) : null;
}

const requiredMatch = (contents, pattern, description, repositoryUrl) => {
    const match = pattern.exec(contents ?? '');
    if (!match)
        throw new SchemaReplayError(
            'SCHEMA_CONFIGURATION_MISSING',
            `${repositoryUrl}에서 ${description}을 찾지 못했습니다.`
        );
    return match[1];
};

export function resolveAirflowConfiguration(input, repositoryUrl, profile) {
    const dockerfile = input.get('Dockerfile');
    const compose = input.get('docker-compose.yml');
    const environment = input.get('.env.example');
    const airflowVersion = requiredMatch(
        dockerfile,
        /^ARG AIRFLOW_VERSION=([^\s#]+)$/m,
        'Dockerfile의 고정 AIRFLOW_VERSION',
        repositoryUrl
    );
    const pythonVersion = requiredMatch(
        dockerfile,
        /^ARG PYTHON_VERSION=([^\s#]+)$/m,
        'Dockerfile의 고정 PYTHON_VERSION',
        repositoryUrl
    );
    if (
        !new RegExp(
            `^FROM apache/airflow:\\$\\{AIRFLOW_VERSION\\}-python\\$\\{PYTHON_VERSION\\}(?:\\s|$)`,
            'm'
        ).test(dockerfile)
    )
        throw new SchemaReplayError(
            'SCHEMA_CONFIGURATION_MISSING',
            `${repositoryUrl}의 Dockerfile이 고정 Airflow/Python 인수로 공식 이미지를 선택하지 않습니다.`
        );
    const composeAirflowVersion = requiredMatch(
        compose,
        /AIRFLOW_VERSION:\s*\$\{AIRFLOW_VERSION:-([^}\s]+)\}/,
        'docker-compose.yml의 AIRFLOW_VERSION 기본값',
        repositoryUrl
    );
    const composePythonVersion = requiredMatch(
        compose,
        /PYTHON_VERSION:\s*\$\{PYTHON_VERSION:-([^}\s]+)\}/,
        'docker-compose.yml의 PYTHON_VERSION 기본값',
        repositoryUrl
    );
    const authManager = requiredMatch(
        compose,
        /AIRFLOW__CORE__AUTH_MANAGER:\s*([^\s#]+)/,
        'docker-compose.yml의 Airflow auth manager',
        repositoryUrl
    );
    const envAirflowVersion = requiredMatch(
        environment,
        /^AIRFLOW_VERSION=([^\s#]+)$/m,
        '.env.example의 AIRFLOW_VERSION',
        repositoryUrl
    );
    const envPythonVersion = requiredMatch(
        environment,
        /^PYTHON_VERSION=([^\s#]+)$/m,
        '.env.example의 PYTHON_VERSION',
        repositoryUrl
    );
    const supportedPython = profile.supportedVersions.get(airflowVersion);
    if (
        !supportedPython?.includes(pythonVersion) ||
        [composeAirflowVersion, envAirflowVersion].some(
            (version) => version !== airflowVersion
        ) ||
        [composePythonVersion, envPythonVersion].some(
            (version) => version !== pythonVersion
        ) ||
        authManager !== profile.authManager
    )
        throw new SchemaReplayError(
            'SCHEMA_VERSION_UNSUPPORTED',
            `${repositoryUrl}의 Airflow 실행 구성이 지원 목록과 다릅니다. 감지: Airflow ${airflowVersion}, Python ${pythonVersion}, auth manager ${authManager}. 지원: Airflow 3.3.1 / Python 3.12 / FAB auth manager.`
        );
    return {
        ...profile,
        airflowVersion,
        pythonVersion,
        airflowImage: `apache/airflow:${airflowVersion}-python${pythonVersion}`,
    };
}

export function selectSchemaSource(input, repositoryUrl = '') {
    const names = [...(input instanceof Map ? input.keys() : input)];
    const configuredAirflow = airflowProfile(repositoryUrl);
    if (configuredAirflow) {
        const missing = configuredAirflow.files.filter(
            (name) => !names.includes(name)
        );
        if (missing.length)
            throw new SchemaReplayError(
                'SCHEMA_CONFIGURATION_MISSING',
                `${repositoryUrl}의 Airflow 버전 입력이 부족합니다. 누락: ${missing.join(', ')}`
            );
        if (!(input instanceof Map))
            throw new SchemaReplayError(
                'SCHEMA_CONFIGURATION_MISSING',
                `${repositoryUrl}의 Airflow 버전 파일 내용을 읽지 못했습니다.`
            );
        const profile = resolveAirflowConfiguration(
            input,
            repositoryUrl,
            configuredAirflow
        );
        return {
            kind: 'airflow-metadata',
            label: 'Airflow 메타 DB',
            path: `Dockerfile · Airflow ${profile.airflowVersion}`,
            files: configuredAirflow.files,
            profile,
        };
    }
    const configuredAlembic = alembicProfile(repositoryUrl);
    if (configuredAlembic) {
        const missing = [
            configuredAlembic.config,
            configuredAlembic.environment,
        ].filter((name) => !names.includes(name));
        const prefix = `${configuredAlembic.location}/`;
        const revisions = names
            .filter(
                (name) =>
                    name.startsWith(prefix) &&
                    name.endsWith('.py') &&
                    !name.endsWith('/__init__.py')
            )
            .sort();
        if (missing.length || !revisions.length)
            throw new SchemaReplayError(
                'SCHEMA_CONFIGURATION_MISSING',
                `${repositoryUrl}의 Alembic 입력이 부족합니다. 누락: ${[
                    ...missing,
                    ...(!revisions.length
                        ? [`${configuredAlembic.location}/*.py`]
                        : []),
                ].join(', ')}`
            );
        return {
            kind: 'alembic',
            label: 'Alembic Python 마이그레이션',
            prefix,
            path: `${configuredAlembic.location}/*.py`,
            files: [
                configuredAlembic.config,
                configuredAlembic.environment,
                ...revisions,
            ],
            revisions,
            profile: configuredAlembic,
        };
    }
    const profile = flywayProfile(repositoryUrl);
    if (profile) {
        const prefix = `${profile.location}/`;
        const files = names
            .filter(
                (name) =>
                    name.startsWith(prefix) &&
                    /\/(?:V[^/]*__[^/]+|R__[^/]+)\.sql$/i.test(name)
            )
            .sort();
        if (!files.length)
            throw new SchemaReplayError(
                'SCHEMA_CONFIGURATION_MISSING',
                `${repositoryUrl}의 Flyway 설정 경로(${profile.location})에 V/R SQL 마이그레이션이 없습니다.`
            );
        return {
            kind: 'flyway',
            label: 'Flyway SQL 마이그레이션',
            prefix,
            path: `${profile.location}/{V,R}*.sql`,
            files,
            profile,
        };
    }

    const definitions = [
        {
            kind: 'atlas-schema',
            label: 'Atlas 선언 스키마',
            prefix: 'db/schema/',
            path: 'db/schema/*.sql',
        },
        {
            kind: 'sql-migrations',
            label: 'SQL 마이그레이션',
            prefix: 'db/migration/',
            path: 'db/migration/*.sql',
        },
    ];
    for (const definition of definitions) {
        const files = names
            .filter(
                (name) =>
                    name.startsWith(definition.prefix) && name.endsWith('.sql')
            )
            .sort();
        if (files.length) return { ...definition, files };
    }
    if (
        names.some((name) =>
            name.startsWith('src/main/resources/db/migration/')
        )
    )
        throw new SchemaReplayError(
            'SCHEMA_METHOD_UNSUPPORTED',
            '이 저장소의 Flyway 실행 설정이 KeepERD에 등록되지 않았습니다.'
        );
    if (
        names.includes('alembic.ini') ||
        names.some((name) => name.startsWith('alembic/versions/'))
    )
        throw new SchemaReplayError(
            'SCHEMA_METHOD_UNSUPPORTED',
            '이 저장소의 Alembic 실행 설정이 KeepERD에 등록되지 않았습니다.'
        );
    throw new SchemaReplayError(
        'SCHEMA_SOURCE_NOT_FOUND',
        '지원 가능한 SQL 스키마 입력을 찾지 못했습니다.'
    );
}

export function flywayDockerArguments({
    profile,
    network,
    databaseHost,
    database,
    migrationDirectory,
}) {
    return [
        'run',
        '--rm',
        '--network',
        network,
        '--memory=512m',
        '--cpus=1',
        '--pids-limit=128',
        '--mount',
        `type=bind,src=${migrationDirectory},dst=/flyway/sql,readonly`,
        profile.flywayImage,
        `-url=jdbc:postgresql://${databaseHost}:5432/${database}`,
        '-user=postgres',
        '-password=',
        '-locations=filesystem:/flyway/sql',
        '-connectRetries=10',
        '-validateMigrationNaming=true',
        '-failOnMissingLocations=true',
        `-schemas=${profile.schemas.join(',')}`,
        `-defaultSchema=${profile.defaultSchema}`,
        ...(profile.initSql ? [`-initSql=${profile.initSql}`] : []),
        'migrate',
    ];
}
