import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    mkdirSync,
    mkdtempSync,
    chmodSync,
    rmSync,
    writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
    alembicConfiguration,
    alembicDockerArguments,
    alembicEnvironment,
    alembicRunnerDockerfile,
} from './alembic-replay.mjs';
import { alembicProfile } from './schema-replay.mjs';

test(
    'Alembic follows revision dependencies and initializes the configured schema',
    { skip: process.env.LOCAL_ERD_ALEMBIC_TEST !== '1', timeout: 300000 },
    async () => {
        const profile = alembicProfile(
            'https://github.com/NangmanAzit/myhouse-backend.git'
        );
        const suffix = process.pid.toString(36);
        const postgres = `keeperd-alembic-pg-${suffix}`;
        const workspace = mkdtempSync(
            path.join(tmpdir(), 'keeperd-alembic-revisions-')
        );
        const docker = (args, input) =>
            execFileSync('docker', args, {
                input,
                encoding: 'utf8',
                timeout: 240000,
                stdio: ['pipe', 'pipe', 'pipe'],
            });
        try {
            chmodSync(workspace, 0o755);
            try {
                docker(['image', 'inspect', profile.alembicImage]);
            } catch {
                docker(
                    ['build', '--tag', profile.alembicImage, '-'],
                    alembicRunnerDockerfile(profile)
                );
            }
            mkdirSync(path.join(workspace, 'alembic/versions'), {
                recursive: true,
                mode: 0o755,
            });
            writeFileSync(
                path.join(workspace, 'alembic.ini'),
                alembicConfiguration()
            );
            writeFileSync(
                path.join(workspace, 'alembic/env.py'),
                alembicEnvironment(profile)
            );
            writeFileSync(
                path.join(workspace, 'alembic/versions/0010_later.py'),
                `from alembic import op
import sqlalchemy as sa
revision = "0010"
down_revision = "0002"
branch_labels = None
depends_on = None
def upgrade():
    op.add_column("revision_order", sa.Column("later", sa.Boolean(), nullable=False, server_default=sa.true()))
def downgrade():
    op.drop_column("revision_order", "later")
`
            );
            writeFileSync(
                path.join(workspace, 'alembic/versions/0002_base.py'),
                `from alembic import op
import sqlalchemy as sa
revision = "0002"
down_revision = None
branch_labels = None
depends_on = None
def upgrade():
    op.create_table("revision_order", sa.Column("id", sa.Integer(), primary_key=True))
def downgrade():
    op.drop_table("revision_order")
`
            );
            docker([
                'run',
                '-d',
                '--rm',
                '--name',
                postgres,
                '--network',
                'none',
                '-e',
                'POSTGRES_HOST_AUTH_METHOD=trust',
                'postgres:17-alpine',
            ]);
            for (let attempt = 0; attempt < 60; attempt++) {
                try {
                    docker(['exec', postgres, 'pg_isready', '-U', 'postgres']);
                    break;
                } catch (error) {
                    if (attempt === 59) throw error;
                    await new Promise((resolve) => setTimeout(resolve, 1000));
                }
            }
            docker(['exec', postgres, 'createdb', '-U', 'postgres', 'fixture']);
            const alembic = (command) =>
                docker(
                    alembicDockerArguments({
                        profile,
                        container: postgres,
                        database: 'fixture',
                        workspace,
                        command,
                    })
                );
            assert.match(alembic(['heads']), /^0010 \(head\)$/m);
            alembic(['upgrade', 'head']);
            const result = docker([
                'exec',
                postgres,
                'psql',
                '-U',
                'postgres',
                '-d',
                'fixture',
                '-qAt',
                '-c',
                "SELECT version_num, to_regclass('myhouse.revision_order'), EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='myhouse' AND table_name='revision_order' AND column_name='later') FROM myhouse.alembic_version;",
            ]).trim();
            assert.equal(result, '0010|myhouse.revision_order|t');
        } finally {
            try {
                docker(['stop', postgres]);
            } catch {
                /* Container may not have started. */
            }
            rmSync(workspace, { recursive: true, force: true });
        }
    }
);
