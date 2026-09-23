export function alembicRunnerDockerfile(profile) {
    return `FROM ${profile.pythonImage}
RUN pip install --no-cache-dir alembic==${profile.alembicVersion} SQLAlchemy==${profile.sqlalchemyVersion} psycopg2-binary==${profile.psycopgVersion}
USER 65534:65534
ENTRYPOINT ["alembic"]
`;
}

export function alembicEnvironment(profile) {
    return `import os
from logging.config import fileConfig
from alembic import context
from sqlalchemy import engine_from_config, pool, text

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)
config.set_main_option("sqlalchemy.url", os.environ["DATABASE_URL"])

def run_migrations_online():
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        connection.execute(text('CREATE SCHEMA IF NOT EXISTS "${profile.schema}"'))
        connection.execute(text('SET search_path TO "${profile.schema}"'))
        connection.commit()
        connection.dialect.default_schema_name = "${profile.schema}"
        context.configure(
            connection=connection,
            version_table_schema="${profile.schema}",
            compare_type=True,
            compare_server_default=True,
        )
        with context.begin_transaction():
            context.run_migrations()

if context.is_offline_mode():
    raise RuntimeError("KeepERD only supports isolated online Alembic replay")
run_migrations_online()
`;
}

export function alembicConfiguration() {
    return `[alembic]
script_location = /workspace/alembic
prepend_sys_path = /workspace
path_separator = os

[loggers]
keys = root,sqlalchemy,alembic
[handlers]
keys = console
[formatters]
keys = generic
[logger_root]
level = WARNING
handlers = console
qualname =
[logger_sqlalchemy]
level = WARNING
handlers =
qualname = sqlalchemy.engine
[logger_alembic]
level = INFO
handlers = console
qualname = alembic
[handler_console]
class = StreamHandler
args = (sys.stderr,)
level = NOTSET
formatter = generic
[formatter_generic]
format = %(level)-5.5s [%(name)s] %(message)s
datefmt = %H:%M:%S
`;
}

export function alembicDockerArguments({
    profile,
    container,
    database,
    workspace,
    command,
}) {
    return [
        'run',
        '--rm',
        '--network',
        `container:${container}`,
        '--memory=512m',
        '--cpus=1',
        '--pids-limit=128',
        '--read-only',
        '--tmpfs',
        '/tmp:rw,noexec,nosuid,size=16m',
        '-e',
        'PYTHONDONTWRITEBYTECODE=1',
        '-e',
        `DATABASE_URL=postgresql+psycopg2://postgres@localhost:5432/${database}`,
        '--mount',
        `type=bind,src=${workspace},dst=/workspace,readonly`,
        profile.alembicImage,
        '-c',
        '/workspace/alembic.ini',
        ...command,
    ];
}

export const alembicHeadRevisions = (output) =>
    output.trim().split('\n').filter(Boolean);
