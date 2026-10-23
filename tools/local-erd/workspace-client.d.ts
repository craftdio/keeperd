import type { Diagram } from '../../src/lib/domain/diagram';
import type { ChartDBConfig } from '../../src/lib/domain/config';
import type { DiagramFilter } from '../../src/lib/domain/diagram-filter/diagram-filter';
export interface WorkspaceState {
    revision: number;
    diagrams: Diagram[];
    filters: Record<string, DiagramFilter>;
    config: ChartDBConfig;
    backups: { id: number; diagramId: string; kind: string; bytes: number }[];
    warning?: string;
}
export function readWorkspace(options?: {
    refresh?: boolean;
}): Promise<WorkspaceState>;
export function writeWorkspace(action: string, params: unknown): Promise<void>;
export function workspaceNotice(message: string): void;
export function workspaceBackup(id: number): Promise<unknown>;
