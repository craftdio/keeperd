import { settledNodeChanges } from '@/lib/settled-node-changes';
import { preserveInteraction } from '@/lib/preserve-interaction';
import React, {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import type {
    addEdge,
    NodePositionChange,
    NodeRemoveChange,
    NodeDimensionChange,
    OnEdgesChange,
    OnNodesChange,
    NodeTypes,
    EdgeTypes,
    NodeChange,
} from '@xyflow/react';
import {
    ReactFlow,
    useEdgesState,
    useNodesState,
    Background,
    BackgroundVariant,
    MiniMap,
    Controls,
    useReactFlow,
    useKeyPress,
    SelectionMode,
    useUpdateNodeInternals,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import equal from 'fast-deep-equal';
import type { TableNodeType } from './table-node/table-node';
import {
    TABLE_RELATIONSHIP_SOURCE_HANDLE_ID_PREFIX,
    TABLE_RELATIONSHIP_TARGET_HANDLE_ID_PREFIX,
    TableNode,
} from './table-node/table-node';
import type { RelationshipEdgeType } from './relationship-edge/relationship-edge';
import { RelationshipEdge } from './relationship-edge/relationship-edge';
import { useChartDB } from '@/hooks/use-chartdb';
import {
    LEFT_HANDLE_ID_PREFIX,
    TARGET_ID_PREFIX,
} from './table-node/table-node-field';
import { Toolbar } from './toolbar/toolbar';
import { ViewportCenteredControls } from './viewport-centered-controls';
import { useToast } from '@/components/toast/use-toast';
import {
    Pencil,
    Magnet,
    AlertTriangle,
    Highlighter,
    EyeOff,
} from 'lucide-react';
import { Button } from '@/components/button/button';
import { useLayout } from '@/hooks/use-layout';
import { useBreakpoint } from '@/hooks/use-breakpoint';
import { Badge } from '@/components/badge/badge';
import { useTheme } from '@/hooks/use-theme';
import { useTranslation } from 'react-i18next';
import type { DBTable } from '@/lib/domain/db-table';
import { MIN_TABLE_SIZE } from '@/lib/domain/db-table';
import { useLocalConfig } from '@/hooks/use-local-config';
import {
    Tooltip,
    TooltipTrigger,
    TooltipContent,
} from '@/components/tooltip/tooltip';
import { MarkerDefinitions } from './marker-definitions';
import { CanvasContextMenu } from './canvas-context-menu';
import { areFieldTypesCompatible } from '@/lib/data/data-types/data-types';
import {
    calcTableHeight,
    findOverlappingTables,
    findTableOverlapping,
} from './canvas-utils';
import type { Graph } from '@/lib/graph';
import { removeVertex } from '@/lib/graph';
import type { ChartDBEvent } from '@/context/chartdb-context/chartdb-context';
import { cn, debounce, getOperatingSystem } from '@/lib/utils';
import type { DependencyEdgeType } from './dependency-edge/dependency-edge';
import { DependencyEdge } from './dependency-edge/dependency-edge';
import {
    BOTTOM_SOURCE_HANDLE_ID_PREFIX,
    TARGET_DEP_PREFIX,
    TOP_SOURCE_HANDLE_ID_PREFIX,
} from './table-node/table-node-dependency-indicator';
import type { DatabaseType } from '@/lib/domain/database-type';
import { useCanvas } from '@/hooks/use-canvas';
import type { AreaNodeType } from './area-node/area-node';
import { AreaNode } from './area-node/area-node';
import type { Area } from '@/lib/domain/area';
import type { NoteNodeType } from './note-node/note-node';
import { NoteNode } from './note-node/note-node';
import type { Note } from '@/lib/domain/note';
import type { TempCursorNodeType } from './temp-cursor-node/temp-cursor-node';
import {
    TEMP_CURSOR_HANDLE_ID,
    TEMP_CURSOR_NODE_ID,
    TempCursorNode,
} from './temp-cursor-node/temp-cursor-node';
import type { TempFloatingEdgeType } from './temp-floating-edge/temp-floating-edge';
import {
    TEMP_FLOATING_EDGE_ID,
    TempFloatingEdge,
} from './temp-floating-edge/temp-floating-edge';
import type { CreateRelationshipNodeType } from './create-relationship-node/create-relationship-node';
import { CreateRelationshipNode } from './create-relationship-node/create-relationship-node';
import { ConnectionLine } from './connection-line/connection-line';
import {
    updateTablesParentAreas,
    getTablesInArea,
} from '@/lib/utils/area-utils';
import { CanvasFilter } from './canvas-filter/canvas-filter';
import { SelectedTableColors } from './selected-table-colors';
import { useHotkeys } from 'react-hotkeys-hook';
import { ShowAllButton } from './show-all-button';
import { useIsLostInCanvas } from './hooks/use-is-lost-in-canvas';
import type { DiagramFilter } from '@/lib/domain/diagram-filter/diagram-filter';
import { useDiagramFilter } from '@/context/diagram-filter-context/use-diagram-filter';
import { filterTable } from '@/lib/domain/diagram-filter/filter';
import { defaultSchemas } from '@/lib/data/default-schemas';
import { useDiff } from '@/context/diff-context/use-diff';
import { useClickAway } from 'react-use';
import { getChangedTableHandleIds } from './table-handle-changes';
import { initialTablesReady } from './initial-tables-ready';
import {
    measureCanvasInteraction,
    measureCanvasViewport,
} from './interaction-benchmark';
import {
    createEdgeHighlightIndex,
    getHighlightedEdgeIds,
    updateEdgeHighlights,
} from './edge-highlights';
import {
    getTableLevelOfDetail,
    getTableOverviewLabelScale,
    type TableLevelOfDetail,
} from './table-node/table-lod';
import { TableLODContext } from './table-node/table-lod-context';

const HIGHLIGHTED_EDGE_Z_INDEX = 1;
const DEFAULT_EDGE_Z_INDEX = 0;

export type EdgeType =
    | RelationshipEdgeType
    | DependencyEdgeType
    | TempFloatingEdgeType;

export type NodeType =
    | TableNodeType
    | AreaNodeType
    | NoteNodeType
    | TempCursorNodeType
    | CreateRelationshipNodeType;

type AddEdgeParams = Parameters<typeof addEdge<EdgeType>>[0];

const edgeTypes: EdgeTypes = {
    'relationship-edge': RelationshipEdge,
    'dependency-edge': DependencyEdge,
    'temp-floating-edge': TempFloatingEdge,
};

const nodeTypes: NodeTypes = {
    table: TableNode,
    area: AreaNode,
    note: NoteNode,
    'temp-cursor': TempCursorNode,
    'create-relationship': CreateRelationshipNode,
};

const initialEdges: EdgeType[] = [];

const tableToTableNode = (
    table: DBTable,
    {
        filter,
        databaseType,
        filterLoading,
        showDBViews,
        forceShow,
        isRelationshipCreatingTarget = false,
        targetEdgeCounts,
    }: {
        filter?: DiagramFilter;
        databaseType: DatabaseType;
        filterLoading: boolean;
        showDBViews?: boolean;
        forceShow?: boolean;
        isRelationshipCreatingTarget?: boolean;
        targetEdgeCounts?: Record<string, number>;
    }
): TableNodeType => {
    // Always use absolute position for now
    const position = { x: table.x, y: table.y };

    let hidden = false;

    if (forceShow) {
        hidden = false;
    } else {
        hidden =
            !filterTable({
                table: { id: table.id, schema: table.schema },
                filter,
                options: { defaultSchema: defaultSchemas[databaseType] },
            }) ||
            filterLoading ||
            (!showDBViews && table.isView);
    }

    return {
        id: table.id,
        type: 'table',
        position,
        data: {
            table,
            isOverlapping: false,
            isRelationshipCreatingTarget,
            targetEdgeCounts,
        },
        width: table.width ?? MIN_TABLE_SIZE,
        hidden,
    };
};

const areaToAreaNode = (
    area: Area,
    {
        tables,
        filter,
        databaseType,
        filterLoading,
    }: {
        tables: DBTable[];
        filter?: DiagramFilter;
        databaseType: DatabaseType;
        filterLoading: boolean;
    }
): AreaNodeType => {
    // Get all tables in this area
    const tablesInArea = tables.filter((t) => t.parentAreaId === area.id);

    // Check if at least one table in the area is visible
    const hasVisibleTable =
        tablesInArea.length === 0 ||
        tablesInArea.some((table) =>
            filterTable({
                table: { id: table.id, schema: table.schema },
                filter,
                options: {
                    defaultSchema: defaultSchemas[databaseType],
                },
            })
        );

    return {
        id: area.id,
        type: 'area',
        position: { x: area.x, y: area.y },
        data: { area },
        width: area.width,
        height: area.height,
        zIndex: -10,
        style: {
            zIndex: -10,
        },
        hidden: !hasVisibleTable || filterLoading,
    };
};

const noteToNoteNode = (note: Note): NoteNodeType => {
    return {
        id: note.id,
        type: 'note',
        position: { x: note.x, y: note.y },
        data: { note },
        width: note.width,
        height: note.height,
        zIndex: 50,
        style: {
            zIndex: 50,
        },
    };
};

export interface CanvasProps {
    initialTables: DBTable[];
}

export const Canvas: React.FC<CanvasProps> = ({ initialTables }) => {
    const settleChanges = useRef(settledNodeChanges());
    const resizingNodes = useRef(new Set<string>());
    const { getEdge, getInternalNode, getNode } = useReactFlow();
    const updateNodeInternals = useUpdateNodeInternals();
    const [selectedTableIds, setSelectedTableIds] = useState<string[]>([]);
    const [selectedRelationshipIds, setSelectedRelationshipIds] = useState<
        string[]
    >([]);
    const { toast } = useToast();
    const { t } = useTranslation();
    const { isLostInCanvas } = useIsLostInCanvas();
    const {
        tables,
        areas,
        notes,
        relationships,
        createRelationship,
        createDependency,
        updateTablesState,
        removeRelationships,
        removeDependencies,
        getField,
        databaseType,
        events,
        dependencies,
        readonly,
        removeArea,
        updateArea,
        removeNote,
        updateNote,
        highlightedCustomType,
        highlightCustomTypeId,
    } = useChartDB();
    const { showSidePanel } = useLayout();
    const { effectiveTheme } = useTheme();
    const { scrollAction, showDBViews, showMiniMapOnCanvas } = useLocalConfig();
    const { isMd: isDesktop } = useBreakpoint('md');
    const [highlightOverlappingTables, setHighlightOverlappingTables] =
        useState(false);
    const {
        fitView,
        setOverlapGraph,
        overlapGraph,
        showFilter,
        setShowFilter,
        setEditTableModeTable,
        tempFloatingEdge,
        endFloatingEdgeCreation,
        hoveringTableId,
        hideCreateRelationshipNode,
        closeRelationshipPopover,
        events: canvasEvents,
    } = useCanvas();
    const {
        filter,
        loading: filterLoading,
        hasActiveFilter,
        resetFilter,
    } = useDiagramFilter();
    const { checkIfNewTable } = useDiff();

    const shouldForceShowTable = useCallback(
        (tableId: string) => {
            return checkIfNewTable({ tableId });
        },
        [checkIfNewTable]
    );

    const [isInitialLoadingNodes, setIsInitialLoadingNodes] = useState(true);

    const [nodes, setNodes, onNodesChange] = useNodesState<NodeType>(
        initialTables.map((table) =>
            tableToTableNode(table, {
                filter,
                databaseType,
                filterLoading,
                showDBViews,
                forceShow: shouldForceShowTable(table.id),
                isRelationshipCreatingTarget: false,
            })
        )
    );
    const [edges, setEdges, onEdgesChange] =
        useEdgesState<EdgeType>(initialEdges);
    const edgeHighlightIndex = useMemo(
        () => createEdgeHighlightIndex(relationships, dependencies),
        [relationships, dependencies]
    );
    const highlightedEdgeIds = useRef<ReadonlySet<string>>(new Set());
    const selectedColorTableIds = useMemo(() => {
        const editableIds = new Set(
            tables.filter((table) => !table.isView).map((table) => table.id)
        );
        return nodes
            .filter(
                (node) =>
                    node.type === 'table' &&
                    node.selected &&
                    !node.hidden &&
                    editableIds.has(node.id)
            )
            .map((node) => node.id);
    }, [nodes, tables]);

    const [snapToGridEnabled, setSnapToGridEnabled] = useState(false);

    const [cursorPosition, setCursorPosition] = useState<{
        x: number;
        y: number;
    } | null>(null);

    useEffect(() => {
        setIsInitialLoadingNodes(true);
    }, [initialTables]);

    useEffect(() => {
        if (
            initialTablesReady(
                initialTables,
                nodes.filter(
                    (node): node is TableNodeType => node.type === 'table'
                )
            )
        ) {
            setIsInitialLoadingNodes(false);
        }
    }, [initialTables, nodes]);

    useEffect(() => {
        if (isInitialLoadingNodes) return;
        const timeoutId = setTimeout(() => {
            fitView({ duration: 200, padding: 0.1, maxZoom: 0.8 });
        }, 500);
        return () => clearTimeout(timeoutId);
    }, [isInitialLoadingNodes, fitView]);

    useEffect(() => {
        if (
            !new URLSearchParams(window.location.search).has(
                'canvasBenchmark'
            ) ||
            typeof PerformanceObserver === 'undefined'
        ) {
            return;
        }
        const observer = new PerformanceObserver((list) => {
            const dataset = document.documentElement.dataset;
            dataset.canvasBenchmarkLongTasks = String(
                Number(dataset.canvasBenchmarkLongTasks ?? 0) +
                    list.getEntries().length
            );
            dataset.canvasBenchmarkLongTaskMs = String(
                Number(dataset.canvasBenchmarkLongTaskMs ?? 0) +
                    list
                        .getEntries()
                        .reduce((total, entry) => total + entry.duration, 0)
            );
        });
        try {
            observer.observe({ type: 'longtask', buffered: true });
        } catch {
            // Some browsers do not implement the Long Tasks API.
        }
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        if (
            initialTables.length === 0 ||
            nodes.filter((node) => node.type === 'table').length <
                initialTables.length ||
            edges.length < relationships.length + dependencies.length ||
            !new URLSearchParams(window.location.search).has('canvasBenchmark')
        ) {
            return;
        }
        let paintFrame = 0;
        const frame = requestAnimationFrame(() => {
            paintFrame = requestAnimationFrame(() => {
                performance.mark('keeperd:canvas-ready', {
                    detail: {
                        tables: initialTables.length,
                        relationships: relationships.length,
                    },
                });
                document.documentElement.dataset.canvasBenchmarkReadyMs ??=
                    performance.now().toFixed(1);
            });
        });
        return () => {
            cancelAnimationFrame(frame);
            cancelAnimationFrame(paintFrame);
        };
    }, [
        initialTables,
        nodes,
        relationships.length,
        dependencies.length,
        edges.length,
    ]);

    useEffect(() => {
        // Commit the node/handle DOM first. React Flow then measures the handles
        // and updates edge positions without a fixed 100 ms loading delay.
        const frameId = requestAnimationFrame(() => {
            const targetIndexes: Record<string, number> = relationships.reduce(
                (acc, relationship) => {
                    acc[
                        `${relationship.targetTableId}${relationship.targetFieldId}`
                    ] = 0;
                    return acc;
                },
                {} as Record<string, number>
            );

            const targetDepIndexes: Record<string, number> =
                dependencies.reduce(
                    (acc, dep) => {
                        acc[dep.tableId] = 0;
                        return acc;
                    },
                    {} as Record<string, number>
                );

            setEdges((prevEdges) => {
                const highlightedIds = highlightedEdgeIds.current;
                // Create a map of previous edge states to preserve selection
                const prevEdgeStates = new Map(
                    prevEdges.map((edge) => [
                        edge.id,
                        { selected: edge.selected },
                    ])
                );

                return [
                    ...relationships.map(
                        (relationship): RelationshipEdgeType => {
                            const prevState = prevEdgeStates.get(
                                relationship.id
                            );
                            return {
                                id: relationship.id,
                                source: relationship.sourceTableId,
                                target: relationship.targetTableId,
                                sourceHandle: `${LEFT_HANDLE_ID_PREFIX}${relationship.sourceFieldId}`,
                                targetHandle: `${TARGET_ID_PREFIX}${targetIndexes[`${relationship.targetTableId}${relationship.targetFieldId}`]++}_${relationship.targetFieldId}`,
                                type: 'relationship-edge',
                                data: {
                                    relationship,
                                    highlighted: highlightedIds.has(
                                        relationship.id
                                    ),
                                },
                                selected: prevState?.selected ?? false,
                                animated: highlightedIds.has(relationship.id),
                                zIndex: highlightedIds.has(relationship.id)
                                    ? HIGHLIGHTED_EDGE_Z_INDEX
                                    : DEFAULT_EDGE_Z_INDEX,
                            };
                        }
                    ),
                    ...dependencies.map((dep): DependencyEdgeType => {
                        const prevState = prevEdgeStates.get(dep.id);
                        return {
                            id: dep.id,
                            source: dep.dependentTableId,
                            target: dep.tableId,
                            sourceHandle: `${TOP_SOURCE_HANDLE_ID_PREFIX}${dep.dependentTableId}`,
                            targetHandle: `${TARGET_DEP_PREFIX}${targetDepIndexes[dep.tableId]++}_${dep.tableId}`,
                            type: 'dependency-edge',
                            data: {
                                dependency: dep,
                                highlighted: highlightedIds.has(dep.id),
                            },
                            hidden: !showDBViews,
                            selected: prevState?.selected ?? false,
                            animated: highlightedIds.has(dep.id),
                            zIndex: highlightedIds.has(dep.id)
                                ? HIGHLIGHTED_EDGE_Z_INDEX
                                : DEFAULT_EDGE_Z_INDEX,
                        };
                    }),
                ];
            });
        });

        return () => cancelAnimationFrame(frameId);
    }, [relationships, dependencies, setEdges, showDBViews]);

    useEffect(() => {
        const selectedNodesIds = nodes
            .filter((node) => node.selected)
            .map((node) => node.id);

        if (equal(selectedNodesIds, selectedTableIds)) {
            return;
        }

        setSelectedTableIds(selectedNodesIds);
    }, [nodes, setSelectedTableIds, selectedTableIds]);

    useEffect(() => {
        const selectedEdgesIds = edges
            .filter((edge) => edge.selected)
            .map((edge) => edge.id);

        if (equal(selectedEdgesIds, selectedRelationshipIds)) {
            return;
        }

        setSelectedRelationshipIds(selectedEdgesIds);
    }, [edges, setSelectedRelationshipIds, selectedRelationshipIds]);

    useEffect(() => {
        const nextHighlightedIds = getHighlightedEdgeIds(
            edgeHighlightIndex,
            selectedTableIds,
            selectedRelationshipIds
        );
        const previousHighlightedIds = highlightedEdgeIds.current;
        highlightedEdgeIds.current = nextHighlightedIds;
        setEdges((prevEdges) =>
            updateEdgeHighlights(
                prevEdges,
                edgeHighlightIndex,
                nextHighlightedIds,
                previousHighlightedIds,
                HIGHLIGHTED_EDGE_Z_INDEX,
                DEFAULT_EDGE_Z_INDEX
            )
        );
    }, [
        edgeHighlightIndex,
        selectedRelationshipIds,
        selectedTableIds,
        setEdges,
    ]);

    const previousNodeBuildInputs = useRef<unknown[] | null>(null);
    useEffect(() => {
        const nodeBuildInputs = [
            filter,
            databaseType,
            overlapGraph.lastUpdated,
            overlapGraph.graph,
            highlightOverlappingTables,
            highlightedCustomType,
            filterLoading,
            showDBViews,
            shouldForceShowTable,
            relationships,
        ];
        const canReuseTableNodes =
            previousNodeBuildInputs.current?.every((input, index) =>
                Object.is(input, nodeBuildInputs[index])
            ) ?? false;
        previousNodeBuildInputs.current = nodeBuildInputs;

        // Compute target edge counts per field (same logic as edge creation)
        // This ensures handle creation is synchronized with edge indices
        const targetEdgeCountsByField: Record<string, number> = {};
        relationships.forEach((rel) => {
            const fieldId = rel.targetFieldId;
            targetEdgeCountsByField[fieldId] =
                (targetEdgeCountsByField[fieldId] || 0) + 1;
        });

        setNodes((prevNodes) => {
            const previousById = new Map(
                prevNodes.map((node) => [node.id, node])
            );
            const preserveChangedNode = (node: NodeType): NodeType => {
                const previous = previousById.get(node.id);
                return previous
                    ? preserveInteraction(
                          [node],
                          [previous],
                          resizingNodes.current
                      )[0]
                    : node;
            };
            const newNodes = [
                ...tables.map((table) => {
                    const previous = previousById.get(table.id);
                    if (
                        canReuseTableNodes &&
                        previous?.type === 'table' &&
                        previous.data.table === table
                    ) {
                        return previous;
                    }

                    const isOverlapping =
                        (overlapGraph.graph.get(table.id) ?? []).length > 0;

                    // Get target edge counts for this table's fields
                    const tableTargetEdgeCounts: Record<string, number> = {};
                    table.fields.forEach((field) => {
                        if (targetEdgeCountsByField[field.id]) {
                            tableTargetEdgeCounts[field.id] =
                                targetEdgeCountsByField[field.id];
                        }
                    });

                    const node = tableToTableNode(table, {
                        filter,
                        databaseType,
                        filterLoading,
                        showDBViews,
                        forceShow: shouldForceShowTable(table.id),
                        isRelationshipCreatingTarget: false,
                        targetEdgeCounts: tableTargetEdgeCounts,
                    });

                    // Check if table uses the highlighted custom type
                    let hasHighlightedCustomType = false;
                    if (highlightedCustomType) {
                        hasHighlightedCustomType = table.fields.some(
                            (field) =>
                                field.type.name === highlightedCustomType.name
                        );
                    }

                    return preserveChangedNode({
                        ...node,
                        data: {
                            ...node.data,
                            isOverlapping,
                            highlightOverlappingTables,
                            hasHighlightedCustomType,
                        },
                    }) as TableNodeType;
                }),
                ...areas.map((area) =>
                    preserveChangedNode(
                        areaToAreaNode(area, {
                            tables,
                            filter,
                            databaseType,
                            filterLoading,
                        })
                    )
                ),
                ...notes.map((note) => {
                    const previous = previousById.get(note.id);
                    return previous?.type === 'note' &&
                        previous.data.note === note
                        ? previous
                        : preserveChangedNode(noteToNoteNode(note));
                }),
                ...prevNodes.filter(
                    (n) =>
                        n.type === 'temp-cursor' ||
                        n.type === 'create-relationship'
                ),
            ];

            if (
                prevNodes.length === newNodes.length &&
                prevNodes.every((node, index) => node === newNodes[index])
            ) {
                return prevNodes;
            }

            return newNodes;
        });
    }, [
        tables,
        areas,
        notes,
        setNodes,
        filter,
        databaseType,
        overlapGraph.lastUpdated,
        overlapGraph.graph,
        highlightOverlappingTables,
        highlightedCustomType,
        filterLoading,
        showDBViews,
        shouldForceShowTable,
        relationships,
    ]);

    const handleSignatures = useRef(new Map<string, string>());
    useEffect(() => {
        const { changedIds, signatures } = getChangedTableHandleIds(
            tables,
            relationships,
            dependencies,
            handleSignatures.current
        );
        handleSignatures.current = signatures;
        if (changedIds.length === 0) return;

        // The node update above must render its new handle DOM before React Flow
        // measures it. Refresh all affected tables in one call, not per field.
        const frameId = requestAnimationFrame(() => {
            updateNodeInternals(changedIds);
            if (
                new URLSearchParams(window.location.search).has(
                    'canvasBenchmark'
                )
            ) {
                performance.mark('keeperd:handle-refresh', {
                    detail: { tables: changedIds.length },
                });
                const dataset = document.documentElement.dataset;
                dataset.canvasBenchmarkRefreshCalls = String(
                    Number(dataset.canvasBenchmarkRefreshCalls ?? 0) + 1
                );
                dataset.canvasBenchmarkRefreshTables = String(
                    Number(dataset.canvasBenchmarkRefreshTables ?? 0) +
                        changedIds.length
                );
            }
        });
        return () => cancelAnimationFrame(frameId);
    }, [tables, relationships, dependencies, updateNodeInternals]);

    // Surgical update for relationship creation target highlighting
    // This avoids expensive full node recalculation when only the visual state changes
    useEffect(() => {
        setNodes((nds) => {
            let hasChanges = false;
            const updatedNodes = nds.map((node) => {
                if (node.type !== 'table') return node;

                const shouldBeTarget =
                    !!tempFloatingEdge?.sourceNodeId &&
                    node.id !== tempFloatingEdge.sourceNodeId;
                const isCurrentlyTarget =
                    node.data.isRelationshipCreatingTarget ?? false;

                if (shouldBeTarget !== isCurrentlyTarget) {
                    hasChanges = true;
                    return {
                        ...node,
                        data: {
                            ...node.data,
                            isRelationshipCreatingTarget: shouldBeTarget,
                        },
                    };
                }
                return node;
            });

            return hasChanges ? updatedNodes : nds;
        });
    }, [tempFloatingEdge?.sourceNodeId, setNodes]);

    const prevFilter = useRef<DiagramFilter | undefined>(filter);
    const prevShowDBViews = useRef<boolean>(showDBViews);
    useEffect(() => {
        if (
            !equal(filter, prevFilter.current) ||
            showDBViews !== prevShowDBViews.current
        ) {
            debounce(() => {
                const overlappingTablesInDiagram = findOverlappingTables({
                    tables: tables.filter(
                        (table) =>
                            filterTable({
                                table: {
                                    id: table.id,
                                    schema: table.schema,
                                },
                                filter,
                                options: {
                                    defaultSchema: defaultSchemas[databaseType],
                                },
                            }) && (showDBViews ? true : !table.isView)
                    ),
                });
                setOverlapGraph(overlappingTablesInDiagram);
                fitView({
                    duration: 500,
                    padding: 0.1,
                    maxZoom: 0.8,
                });
            }, 500)();
            prevFilter.current = filter;
            prevShowDBViews.current = showDBViews;
        }
    }, [filter, fitView, tables, setOverlapGraph, databaseType, showDBViews]);

    useEffect(() => {
        const checkParentAreas = debounce(() => {
            if (resizingNodes.current.size > 0) return;
            const visibleTables = nodes
                .filter((node) => node.type === 'table' && !node.hidden)
                .map((node) => (node as TableNodeType).data.table);
            const visibleAreas = nodes
                .filter((node) => node.type === 'area' && !node.hidden)
                .map((node) => (node as AreaNodeType).data.area);

            const updatedTables = updateTablesParentAreas(
                visibleTables,
                visibleAreas
            );
            const needsUpdate: Array<{
                id: string;
                parentAreaId: string | null;
            }> = [];

            updatedTables.forEach((newTable, index) => {
                const oldTable = visibleTables[index];
                if (
                    oldTable &&
                    (!!newTable.parentAreaId || !!oldTable.parentAreaId) &&
                    newTable.parentAreaId !== oldTable.parentAreaId
                ) {
                    needsUpdate.push({
                        id: newTable.id,
                        parentAreaId: newTable.parentAreaId || null,
                    });
                }
            });

            if (needsUpdate.length > 0) {
                updateTablesState(
                    (currentTables) =>
                        currentTables.map((table) => {
                            const update = needsUpdate.find(
                                (u) => u.id === table.id
                            );
                            if (update) {
                                return {
                                    id: table.id,
                                    parentAreaId: update.parentAreaId,
                                };
                            }
                            return table;
                        }),
                    { updateHistory: false }
                );
            }
        }, 300);

        checkParentAreas();
    }, [nodes, updateTablesState]);

    const onConnectHandler = useCallback(
        async (params: AddEdgeParams) => {
            if (
                params.sourceHandle?.startsWith?.(
                    TOP_SOURCE_HANDLE_ID_PREFIX
                ) ||
                params.sourceHandle?.startsWith?.(
                    BOTTOM_SOURCE_HANDLE_ID_PREFIX
                )
            ) {
                const tableId = params.target;
                const dependentTableId = params.source;

                createDependency({
                    tableId,
                    dependentTableId,
                });

                return;
            }

            const sourceTableId = params.source;
            const targetTableId = params.target;
            const sourceFieldId = params.sourceHandle?.split('_')?.pop() ?? '';
            const targetFieldId = params.targetHandle?.split('_')?.pop() ?? '';
            const sourceField = getField(sourceTableId, sourceFieldId);
            const targetField = getField(targetTableId, targetFieldId);

            if (!sourceField || !targetField) {
                return;
            }

            if (
                !areFieldTypesCompatible(
                    sourceField.type,
                    targetField.type,
                    databaseType
                )
            ) {
                toast({
                    title: 'Field types are not compatible',
                    variant: 'destructive',
                    description:
                        'Relationships can only be created between compatible field types',
                });
                return;
            }

            createRelationship({
                sourceTableId,
                targetTableId,
                sourceFieldId,
                targetFieldId,
            });
        },
        [createRelationship, createDependency, getField, toast, databaseType]
    );

    const onEdgesChangeHandler: OnEdgesChange<EdgeType> = useCallback(
        (changes) => {
            let changesToApply = changes;

            if (readonly) {
                changesToApply = changesToApply.filter(
                    (change) => change.type !== 'remove'
                );
            }

            const removeChanges: NodeRemoveChange[] = changesToApply.filter(
                (change) => change.type === 'remove'
            ) as NodeRemoveChange[];

            const edgesToRemove = removeChanges
                .map((change) => getEdge(change.id) as EdgeType | undefined)
                .filter((edge) => !!edge);

            const relationshipsToRemove: string[] = (
                edgesToRemove.filter(
                    (edge) => edge?.type === 'relationship-edge'
                ) as RelationshipEdgeType[]
            ).map((edge) => edge?.data?.relationship?.id as string);

            const dependenciesToRemove: string[] = (
                edgesToRemove.filter(
                    (edge) => edge?.type === 'dependency-edge'
                ) as DependencyEdgeType[]
            ).map((edge) => edge?.data?.dependency?.id as string);

            if (relationshipsToRemove.length > 0) {
                removeRelationships(relationshipsToRemove);
            }

            if (dependenciesToRemove.length > 0) {
                removeDependencies(dependenciesToRemove);
            }

            return onEdgesChange(changesToApply);
        },
        [
            getEdge,
            onEdgesChange,
            removeRelationships,
            removeDependencies,
            readonly,
        ]
    );

    const updateOverlappingGraphOnChanges = useCallback(
        ({
            positionChanges,
            sizeChanges,
        }: {
            positionChanges: NodePositionChange[];
            sizeChanges: NodeDimensionChange[];
        }) => {
            if (positionChanges.length > 0 || sizeChanges.length > 0) {
                let newOverlappingGraph: Graph<string> = overlapGraph;

                for (const change of positionChanges) {
                    const node = getNode(change.id) as NodeType;
                    if (!node) {
                        continue;
                    }

                    if (node.type !== 'table') {
                        continue;
                    }

                    newOverlappingGraph = findTableOverlapping(
                        { node: node as TableNodeType },
                        {
                            nodes: nodes.filter(
                                (node) => !node.hidden && node.type === 'table'
                            ) as TableNodeType[],
                        },
                        newOverlappingGraph
                    );
                }

                for (const change of sizeChanges) {
                    const node = getNode(change.id) as NodeType;
                    if (!node) {
                        continue;
                    }

                    if (node.type !== 'table') {
                        continue;
                    }

                    newOverlappingGraph = findTableOverlapping(
                        { node: node as TableNodeType },
                        {
                            nodes: nodes.filter(
                                (node) => !node.hidden && node.type === 'table'
                            ) as TableNodeType[],
                        },
                        newOverlappingGraph
                    );
                }

                setOverlapGraph(newOverlappingGraph);
            }
        },
        [nodes, overlapGraph, setOverlapGraph, getNode]
    );

    const updateOverlappingGraphOnChangesDebounced = debounce(
        updateOverlappingGraphOnChanges,
        200
    );

    const findRelevantNodesChanges = useCallback(
        (changes: NodeChange<NodeType>[], type: NodeType['type']) => {
            const relevantChanges = changes.filter((change) => {
                if (
                    (change.type === 'position' &&
                        !change.dragging &&
                        change.position?.x !== undefined &&
                        change.position?.y !== undefined &&
                        !isNaN(change.position.x) &&
                        !isNaN(change.position.y)) ||
                    (change.type === 'dimensions' &&
                        change.resizing === false) ||
                    change.type === 'remove'
                ) {
                    const node = getNode(change.id);
                    if (!node) {
                        return false;
                    }

                    if (node.type !== type) {
                        return false;
                    }

                    return true;
                }

                return false;
            });

            const positionChanges: NodePositionChange[] =
                relevantChanges.filter(
                    (change) =>
                        change.type === 'position' &&
                        !change.dragging &&
                        change.position?.x !== undefined &&
                        change.position?.y !== undefined &&
                        !isNaN(change.position.x) &&
                        !isNaN(change.position.y)
                ) as NodePositionChange[];

            const removeChanges: NodeRemoveChange[] = relevantChanges.filter(
                (change) => change.type === 'remove'
            ) as NodeRemoveChange[];

            const sizeChanges: NodeDimensionChange[] = relevantChanges.filter(
                (change) =>
                    change.type === 'dimensions' && change.resizing === false
            ) as NodeDimensionChange[];

            return {
                positionChanges,
                removeChanges,
                sizeChanges,
            };
        },
        [getNode]
    );

    const onNodesChangeHandler: OnNodesChange<NodeType> = useCallback(
        (changes) => {
            if (changes.some((change) => change.type === 'select')) {
                measureCanvasInteraction('select');
            } else if (
                changes.some(
                    (change) => change.type === 'position' && !change.dragging
                )
            ) {
                measureCanvasInteraction('drag');
            }
            for (const change of changes) {
                if (change.type === 'dimensions') {
                    if (change.resizing === true)
                        resizingNodes.current.add(change.id);
                    if (change.resizing === false)
                        resizingNodes.current.delete(change.id);
                }
                if (change.type === 'remove')
                    resizingNodes.current.delete(change.id);
            }
            let changesToApply = changes;

            if (readonly) {
                changesToApply = changesToApply.filter(
                    (change) => change.type !== 'remove'
                );
            }

            // Handle area drag changes - add child table movements for visual feedback only
            const areaDragChanges = changesToApply.filter((change) => {
                if (change.type === 'position') {
                    const node = getNode(change.id);
                    return (
                        node?.type === 'area' &&
                        change.dragging &&
                        !resizingNodes.current.has(change.id)
                    );
                }
                return false;
            }) as NodePositionChange[];

            // Add visual position changes for child tables during area dragging
            if (areaDragChanges.length > 0) {
                const additionalChanges: NodePositionChange[] = [];

                areaDragChanges.forEach((areaChange) => {
                    const currentArea = areas.find(
                        (a) => a.id === areaChange.id
                    );
                    if (currentArea && areaChange.position) {
                        const deltaX = areaChange.position.x - currentArea.x;
                        const deltaY = areaChange.position.y - currentArea.y;

                        // Find child tables and create visual position changes
                        const childTables = tables.filter(
                            (table) => table.parentAreaId === areaChange.id
                        );

                        childTables.forEach((table) => {
                            additionalChanges.push({
                                id: table.id,
                                type: 'position',
                                position: {
                                    x: table.x + deltaX,
                                    y: table.y + deltaY,
                                },
                                dragging: true,
                            });
                        });
                    }
                });

                // Add visual changes to React Flow
                changesToApply = [...changesToApply, ...additionalChanges];
            }

            const persistenceChanges = settleChanges.current(
                changesToApply
            ) as NodeChange<NodeType>[];
            // First, detect area changes
            const {
                positionChanges: areaPositionChanges,
                removeChanges: areaRemoveChanges,
                sizeChanges: areaSizeChanges,
            } = findRelevantNodesChanges(persistenceChanges, 'area');

            // Then, detect note changes
            const {
                positionChanges: notePositionChanges,
                removeChanges: noteRemoveChanges,
                sizeChanges: noteSizeChanges,
            } = findRelevantNodesChanges(persistenceChanges, 'note');

            // Then, detect table changes
            const { positionChanges, removeChanges, sizeChanges } =
                findRelevantNodesChanges(persistenceChanges, 'table');

            // Calculate child table movements from area position changes
            const childTableMovements: Map<
                string,
                { deltaX: number; deltaY: number }
            > = new Map();
            if (
                areaPositionChanges.length > 0 &&
                areaSizeChanges.length === 0
            ) {
                areaPositionChanges.forEach((change) => {
                    if (change.type === 'position' && change.position) {
                        const currentArea = areas.find(
                            (a) => a.id === change.id
                        );
                        if (currentArea) {
                            const deltaX = change.position.x - currentArea.x;
                            const deltaY = change.position.y - currentArea.y;

                            const childTables = getTablesInArea(
                                change.id,
                                tables
                            );
                            childTables.forEach((table) => {
                                childTableMovements.set(table.id, {
                                    deltaX,
                                    deltaY,
                                });
                            });
                        }
                    }
                });
            }

            // Apply all table updates in a single call
            if (
                positionChanges.length > 0 ||
                removeChanges.length > 0 ||
                sizeChanges.length > 0 ||
                childTableMovements.size > 0 ||
                areaRemoveChanges.length > 0
            ) {
                updateTablesState(
                    (currentTables) => {
                        const updatedTables = currentTables
                            .map((currentTable) => {
                                // Handle area removal - clear parentAreaId
                                const removedArea = areaRemoveChanges.find(
                                    (change) =>
                                        change.id === currentTable.parentAreaId
                                );
                                if (removedArea) {
                                    return {
                                        ...currentTable,
                                        parentAreaId: null,
                                    };
                                }

                                // Handle direct table changes
                                const positionChange = positionChanges.find(
                                    (change) => change.id === currentTable.id
                                );
                                const sizeChange = sizeChanges.find(
                                    (change) => change.id === currentTable.id
                                );

                                // Handle child table movement from area drag
                                const areaMovement = childTableMovements.get(
                                    currentTable.id
                                );

                                if (
                                    positionChange ||
                                    sizeChange ||
                                    areaMovement
                                ) {
                                    const x = positionChange?.position?.x;
                                    const y = positionChange?.position?.y;

                                    return {
                                        ...currentTable,
                                        ...(positionChange &&
                                        x !== undefined &&
                                        y !== undefined &&
                                        !isNaN(x) &&
                                        !isNaN(y)
                                            ? {
                                                  x,
                                                  y,
                                              }
                                            : {}),
                                        ...(areaMovement && !positionChange
                                            ? {
                                                  x:
                                                      currentTable.x +
                                                      areaMovement.deltaX,
                                                  y:
                                                      currentTable.y +
                                                      areaMovement.deltaY,
                                              }
                                            : {}),
                                        ...(sizeChange
                                            ? {
                                                  width:
                                                      sizeChange.dimensions
                                                          ?.width ??
                                                      currentTable.width,
                                              }
                                            : {}),
                                    };
                                }
                                return currentTable;
                            })
                            .filter(
                                (table) =>
                                    !removeChanges.some(
                                        (change) => change.id === table.id
                                    )
                            );

                        return updatedTables;
                    },
                    {
                        updateHistory:
                            positionChanges.length > 0 ||
                            removeChanges.length > 0 ||
                            sizeChanges.length > 0,
                    }
                );
            }

            updateOverlappingGraphOnChangesDebounced({
                positionChanges,
                sizeChanges,
            });

            if (
                areaPositionChanges.length > 0 ||
                areaRemoveChanges.length > 0 ||
                areaSizeChanges.length > 0
            ) {
                const areasUpdates: Record<string, Partial<Area>> = {};
                // Handle area position changes (child tables already moved above)
                areaPositionChanges.forEach((change) => {
                    if (change.type === 'position' && change.position) {
                        areasUpdates[change.id] = {
                            ...areasUpdates[change.id],
                            x: change.position.x,
                            y: change.position.y,
                        };
                    }
                });

                // Handle area size changes
                areaSizeChanges.forEach((change) => {
                    if (change.type === 'dimensions' && change.dimensions) {
                        areasUpdates[change.id] = {
                            ...areasUpdates[change.id],
                            width: change.dimensions.width,
                            height: change.dimensions.height,
                        };
                    }
                });

                // Handle area removal (child tables parentAreaId already cleared above)
                areaRemoveChanges.forEach((change) => {
                    removeArea(change.id);
                    delete areasUpdates[change.id];
                });

                // Apply area updates to storage
                if (Object.keys(areasUpdates).length > 0) {
                    for (const [id, updates] of Object.entries(areasUpdates)) {
                        updateArea(id, updates);
                    }
                }
            }

            // Handle note changes
            if (
                notePositionChanges.length > 0 ||
                noteRemoveChanges.length > 0 ||
                noteSizeChanges.length > 0
            ) {
                const notesUpdates: Record<string, Partial<Note>> = {};
                // Handle note position changes
                notePositionChanges.forEach((change) => {
                    if (change.type === 'position' && change.position) {
                        notesUpdates[change.id] = {
                            ...notesUpdates[change.id],
                            x: change.position.x,
                            y: change.position.y,
                        };
                    }
                });

                // Handle note size changes
                noteSizeChanges.forEach((change) => {
                    if (change.type === 'dimensions' && change.dimensions) {
                        notesUpdates[change.id] = {
                            ...notesUpdates[change.id],
                            width: change.dimensions.width,
                            height: change.dimensions.height,
                        };
                    }
                });

                // Handle note removal
                noteRemoveChanges.forEach((change) => {
                    removeNote(change.id);
                    delete notesUpdates[change.id];
                });

                // Apply note updates to storage
                if (Object.keys(notesUpdates).length > 0) {
                    for (const [id, updates] of Object.entries(notesUpdates)) {
                        updateNote(id, updates);
                    }
                }
            }

            return onNodesChange(changesToApply);
        },
        [
            onNodesChange,
            updateTablesState,
            updateOverlappingGraphOnChangesDebounced,
            findRelevantNodesChanges,
            updateArea,
            removeArea,
            updateNote,
            removeNote,
            readonly,
            tables,
            areas,
            getNode,
        ]
    );

    const eventConsumer = useCallback(
        (event: ChartDBEvent) => {
            let newOverlappingGraph: Graph<string> = overlapGraph;
            if (event.action === 'add_tables') {
                for (const table of event.data.tables) {
                    newOverlappingGraph = findTableOverlapping(
                        { node: getNode(table.id) as TableNodeType },
                        {
                            nodes: nodes.filter(
                                (node) => !node.hidden && node.type === 'table'
                            ) as TableNodeType[],
                        },
                        overlapGraph
                    );
                }

                setOverlapGraph(newOverlappingGraph);
            } else if (event.action === 'remove_tables') {
                for (const tableId of event.data.tableIds) {
                    newOverlappingGraph = removeVertex(
                        newOverlappingGraph,
                        tableId
                    );
                }

                setOverlapGraph(newOverlappingGraph);
            } else if (
                event.action === 'update_table' &&
                event.data.table.width
            ) {
                const node = getNode(event.data.id) as TableNodeType;

                const measured = {
                    ...node.measured,
                    width: event.data.table.width,
                };

                newOverlappingGraph = findTableOverlapping(
                    {
                        node: {
                            ...node,
                            measured,
                        },
                    },
                    {
                        nodes: nodes.filter(
                            (node) => !node.hidden && node.type === 'table'
                        ) as TableNodeType[],
                    },
                    overlapGraph
                );
                setOverlapGraph(newOverlappingGraph);

                setTimeout(() => {
                    setNodes((prevNodes) =>
                        prevNodes.map((n) => {
                            if (n.id === event.data.id) {
                                return {
                                    ...n,
                                    measured,
                                };
                            }

                            return n;
                        })
                    );
                }, 0);
            } else if (
                event.action === 'add_field' ||
                event.action === 'remove_field'
            ) {
                const node = getNode(event.data.tableId) as TableNodeType;

                const measured = {
                    ...(node.measured ?? {}),
                    height: calcTableHeight({
                        ...node.data.table,
                        fields: event.data.fields,
                    }),
                };

                newOverlappingGraph = findTableOverlapping(
                    {
                        node: {
                            ...node,
                            measured,
                        },
                    },
                    {
                        nodes: nodes.filter(
                            (node) => !node.hidden && node.type === 'table'
                        ) as TableNodeType[],
                    },
                    overlapGraph
                );
                setOverlapGraph(newOverlappingGraph);
            } else if (event.action === 'load_diagram') {
                const diagramTables = event.data.diagram.tables ?? [];
                const overlappingTablesInDiagram = findOverlappingTables({
                    tables: diagramTables.filter(
                        (table) =>
                            filterTable({
                                table: {
                                    id: table.id,
                                    schema: table.schema,
                                },
                                filter,
                                options: {
                                    defaultSchema: defaultSchemas[databaseType],
                                },
                            }) && (showDBViews ? true : !table.isView)
                    ),
                });
                setOverlapGraph(overlappingTablesInDiagram);
            }
        },
        [
            overlapGraph,
            setOverlapGraph,
            getNode,
            nodes,
            filter,
            setNodes,
            databaseType,
            showDBViews,
        ]
    );

    events.useSubscription(eventConsumer);

    const isLoadingDOM =
        tables.length > 0 ? !getInternalNode(tables[0].id) : false;

    const hasOverlappingTables = useMemo(
        () =>
            Array.from(overlapGraph.graph).some(
                ([, value]) => value.length > 0
            ),
        [overlapGraph]
    );

    // Check if all tables are hidden due to filtering
    // Derived from filter state directly (not nodes) for better performance
    const allTablesHiddenByFilter = useMemo(() => {
        if (!hasActiveFilter || tables.length === 0 || filterLoading) {
            return false;
        }
        // Check if any table passes the filter
        const visibleTableCount = tables.filter((table) =>
            filterTable({
                table: { id: table.id, schema: table.schema },
                filter,
                options: { defaultSchema: defaultSchemas[databaseType] },
            })
        ).length;
        return visibleTableCount === 0;
    }, [hasActiveFilter, tables, filter, databaseType, filterLoading]);

    const pulseOverlappingTables = useCallback(() => {
        setHighlightOverlappingTables(true);
        setTimeout(() => setHighlightOverlappingTables(false), 600);
    }, []);

    const containerRef = useRef<HTMLDivElement>(null);
    const [tableLOD, setTableLOD] = useState<TableLevelOfDetail>('detail');
    const tableLODRef = useRef<TableLevelOfDetail>('detail');
    const updateTableLevelOfDetail = useCallback((zoom: number) => {
        const container = containerRef.current;
        if (!container) return;

        const next = getTableLevelOfDetail(zoom);
        if (tableLODRef.current !== next) {
            tableLODRef.current = next;
            setTableLOD(next);
        }
        container.style.setProperty(
            '--table-overview-label-scale',
            String(getTableOverviewLabelScale(zoom))
        );
    }, []);
    const exitEditTableMode = useCallback(
        () => setEditTableModeTable(null),
        [setEditTableModeTable]
    );
    useClickAway(containerRef, exitEditTableMode);
    useClickAway(containerRef, hideCreateRelationshipNode);

    const shiftPressed = useKeyPress('Shift');
    const operatingSystem = getOperatingSystem();

    useHotkeys(
        operatingSystem === 'mac' ? 'meta+f' : 'ctrl+f',
        () => {
            setShowFilter((prev) => !prev);
        },
        {
            preventDefault: true,
            enableOnFormTags: true,
        },
        []
    );

    // Handle mouse move to update cursor position for floating edge
    const { screenToFlowPosition } = useReactFlow();
    const rafIdRef = useRef<number>();
    const handleMouseMove = useCallback(
        (event: React.MouseEvent) => {
            if (tempFloatingEdge) {
                // Throttle using requestAnimationFrame
                if (rafIdRef.current) {
                    return;
                }

                rafIdRef.current = requestAnimationFrame(() => {
                    const position = screenToFlowPosition({
                        x: event.clientX,
                        y: event.clientY,
                    });
                    setCursorPosition(position);
                    rafIdRef.current = undefined;
                });
            }
        },
        [tempFloatingEdge, screenToFlowPosition]
    );

    // Cleanup RAF on unmount
    useEffect(() => {
        return () => {
            if (rafIdRef.current) {
                cancelAnimationFrame(rafIdRef.current);
            }
        };
    }, []);

    // Handle escape key to cancel floating edge creation, close relationship node, and close relationship popover
    useEffect(() => {
        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                if (tempFloatingEdge) {
                    endFloatingEdgeCreation();
                    setCursorPosition(null);
                }
                // Also close CreateRelationshipNode if present
                hideCreateRelationshipNode();
                // Exit edit table mode
                exitEditTableMode();
                // Close relationship edit popover
                closeRelationshipPopover();
            }
        };
        document.addEventListener('keydown', handleEscape);
        return () => document.removeEventListener('keydown', handleEscape);
    }, [
        tempFloatingEdge,
        endFloatingEdgeCreation,
        hideCreateRelationshipNode,
        closeRelationshipPopover,
        exitEditTableMode,
    ]);

    // Add temporary invisible node at cursor position and edge
    const nodesWithCursor = useMemo(() => {
        if (!tempFloatingEdge || !cursorPosition) {
            return nodes;
        }

        const tempNode: TempCursorNodeType = {
            id: TEMP_CURSOR_NODE_ID,
            type: 'temp-cursor',
            position: cursorPosition,
            data: {},
            draggable: false,
            selectable: false,
        };

        return [...nodes, tempNode];
    }, [nodes, tempFloatingEdge, cursorPosition]);

    const edgesWithFloating = useMemo(() => {
        if (!tempFloatingEdge || !cursorPosition) return edges;

        let target = TEMP_CURSOR_NODE_ID;
        let targetHandle: string | undefined = TEMP_CURSOR_HANDLE_ID;

        if (tempFloatingEdge.targetNodeId) {
            target = tempFloatingEdge.targetNodeId;
            targetHandle = `${TABLE_RELATIONSHIP_TARGET_HANDLE_ID_PREFIX}${tempFloatingEdge.targetNodeId}`;
        } else if (
            hoveringTableId &&
            hoveringTableId !== tempFloatingEdge.sourceNodeId
        ) {
            target = hoveringTableId;
            targetHandle = `${TABLE_RELATIONSHIP_TARGET_HANDLE_ID_PREFIX}${hoveringTableId}`;
        }

        const tempEdge: TempFloatingEdgeType = {
            id: TEMP_FLOATING_EDGE_ID,
            source: tempFloatingEdge.sourceNodeId,
            sourceHandle: `${TABLE_RELATIONSHIP_SOURCE_HANDLE_ID_PREFIX}${tempFloatingEdge.sourceNodeId}`,
            target,
            targetHandle,
            type: 'temp-floating-edge',
        };

        return [...edges, tempEdge];
    }, [edges, tempFloatingEdge, cursorPosition, hoveringTableId]);

    const onPaneClickHandler = useCallback(
        (event: React.MouseEvent<Element, MouseEvent>) => {
            if (tempFloatingEdge) {
                endFloatingEdgeCreation();
                setCursorPosition(null);
            }

            // Close CreateRelationshipNode if it exists
            hideCreateRelationshipNode();

            // Exit edit table mode
            exitEditTableMode();

            // Close relationship edit popover
            closeRelationshipPopover();

            canvasEvents.emit({
                action: 'pan_click',
                data: {
                    x: event.clientX,
                    y: event.clientY,
                },
            });
        },
        [
            canvasEvents,
            tempFloatingEdge,
            exitEditTableMode,
            endFloatingEdgeCreation,
            hideCreateRelationshipNode,
            closeRelationshipPopover,
        ]
    );

    return (
        <CanvasContextMenu>
            <div
                className="relative flex h-full"
                id="canvas"
                ref={containerRef}
                data-table-lod={tableLOD}
                onMouseMove={handleMouseMove}
            >
                <TableLODContext.Provider value={tableLOD}>
                    <ReactFlow
                        onlyRenderVisibleElements
                        colorMode={effectiveTheme}
                        className={cn('nodes-animated', {
                            'canvas-cursor-multi-select': shiftPressed,
                            'canvas-cursor-default': !shiftPressed,
                        })}
                        nodes={nodesWithCursor}
                        edges={edgesWithFloating}
                        onNodesChange={onNodesChangeHandler}
                        onEdgesChange={onEdgesChangeHandler}
                        maxZoom={5}
                        minZoom={0.1}
                        onMove={(_, viewport) =>
                            updateTableLevelOfDetail(viewport.zoom)
                        }
                        onMoveEnd={measureCanvasViewport}
                        onConnect={onConnectHandler}
                        proOptions={{
                            hideAttribution: true,
                        }}
                        fitView={false}
                        nodeTypes={nodeTypes}
                        edgeTypes={edgeTypes}
                        defaultEdgeOptions={{
                            animated: false,
                            type: 'relationship-edge',
                        }}
                        panOnScroll={scrollAction === 'pan'}
                        snapToGrid={shiftPressed || snapToGridEnabled}
                        snapGrid={[20, 20]}
                        selectionMode={SelectionMode.Full}
                        onPaneClick={onPaneClickHandler}
                        connectionLineComponent={ConnectionLine}
                        deleteKeyCode={['Backspace', 'Delete']}
                        multiSelectionKeyCode={['Shift', 'Meta', 'Control']}
                    >
                        <Controls
                            position="top-left"
                            showZoom={false}
                            showFitView={false}
                            showInteractive={false}
                            className="!shadow-none"
                        >
                            <div className="flex flex-col items-center gap-2 md:flex-row">
                                {!readonly ? (
                                    <>
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <span>
                                                    <Button
                                                        variant="secondary"
                                                        className={cn(
                                                            'size-8 p-1 shadow-none',
                                                            snapToGridEnabled ||
                                                                shiftPressed
                                                                ? 'bg-pink-600 text-white hover:bg-pink-500 dark:hover:bg-pink-700 hover:text-white'
                                                                : ''
                                                        )}
                                                        onClick={() =>
                                                            setSnapToGridEnabled(
                                                                (prev) => !prev
                                                            )
                                                        }
                                                    >
                                                        <Magnet className="size-4" />
                                                    </Button>
                                                </span>
                                            </TooltipTrigger>
                                            <TooltipContent>
                                                {t('snap_to_grid_tooltip', {
                                                    key:
                                                        operatingSystem ===
                                                        'mac'
                                                            ? '⇧'
                                                            : 'Shift',
                                                })}
                                            </TooltipContent>
                                        </Tooltip>
                                        {highlightedCustomType ? (
                                            <Tooltip>
                                                <TooltipTrigger asChild>
                                                    <span>
                                                        <Button
                                                            variant="secondary"
                                                            className="size-8 border border-yellow-400 bg-yellow-200 p-1 shadow-none hover:bg-yellow-300 dark:border-yellow-700 dark:bg-yellow-800 dark:hover:bg-yellow-700"
                                                            onClick={() =>
                                                                highlightCustomTypeId(
                                                                    undefined
                                                                )
                                                            }
                                                        >
                                                            <Highlighter className="size-4" />
                                                        </Button>
                                                    </span>
                                                </TooltipTrigger>
                                                <TooltipContent>
                                                    {t(
                                                        'toolbar.custom_type_highlight_tooltip',
                                                        {
                                                            typeName:
                                                                highlightedCustomType.name,
                                                        }
                                                    )}
                                                </TooltipContent>
                                            </Tooltip>
                                        ) : null}
                                    </>
                                ) : null}

                                <div
                                    className={`transition-opacity duration-300 ease-in-out ${
                                        hasOverlappingTables
                                            ? 'opacity-100'
                                            : 'opacity-0'
                                    }`}
                                >
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <span>
                                                <Button
                                                    variant="default"
                                                    className="size-8 p-1 shadow-none"
                                                    onClick={
                                                        pulseOverlappingTables
                                                    }
                                                >
                                                    <AlertTriangle className="size-4 text-white" />
                                                </Button>
                                            </span>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                            {t(
                                                'toolbar.highlight_overlapping_tables'
                                            )}
                                        </TooltipContent>
                                    </Tooltip>
                                </div>
                            </div>
                        </Controls>
                        {isLoadingDOM ? (
                            <Controls
                                position="top-center"
                                orientation="horizontal"
                                showZoom={false}
                                showFitView={false}
                                showInteractive={false}
                                className="!shadow-none"
                            >
                                <Badge
                                    variant="default"
                                    className="bg-pink-600 text-white"
                                >
                                    {t('loading_diagram')}
                                </Badge>
                            </Controls>
                        ) : null}

                        {!readonly && selectedColorTableIds.length > 0 ? (
                            <ViewportCenteredControls
                                desktop={isDesktop}
                                position="bottom-center"
                                orientation="horizontal"
                                showZoom={false}
                                showFitView={false}
                                showInteractive={false}
                                className="!shadow-none"
                                style={{ bottom: isDesktop ? '70px' : '20px' }}
                            >
                                <SelectedTableColors
                                    selectedTableIds={selectedColorTableIds}
                                />
                            </ViewportCenteredControls>
                        ) : null}

                        {!isDesktop && !readonly ? (
                            <Controls
                                position="bottom-left"
                                orientation="horizontal"
                                showZoom={false}
                                showFitView={false}
                                showInteractive={false}
                                className="!shadow-none"
                            >
                                <Button
                                    className="size-11 bg-pink-600 p-2 hover:bg-pink-500"
                                    onClick={showSidePanel}
                                >
                                    <Pencil />
                                </Button>
                            </Controls>
                        ) : null}
                        {isLostInCanvas ? (
                            <ViewportCenteredControls
                                desktop={isDesktop}
                                position={
                                    isDesktop ? 'bottom-center' : 'top-center'
                                }
                                orientation="horizontal"
                                showZoom={false}
                                showFitView={false}
                                showInteractive={false}
                                className="!shadow-none"
                                style={{
                                    [isDesktop ? 'bottom' : 'top']: isDesktop
                                        ? selectedColorTableIds.length > 0 &&
                                          !readonly
                                            ? '130px'
                                            : '70px'
                                        : '70px',
                                }}
                            >
                                <ShowAllButton />
                            </ViewportCenteredControls>
                        ) : null}
                        <ViewportCenteredControls
                            desktop={isDesktop}
                            position={
                                isDesktop ? 'bottom-center' : 'top-center'
                            }
                            orientation="horizontal"
                            showZoom={false}
                            showFitView={false}
                            showInteractive={false}
                            className="!shadow-none"
                        >
                            <Toolbar readonly={readonly} />
                        </ViewportCenteredControls>
                        {showMiniMapOnCanvas && (
                            <MiniMap
                                style={{
                                    width: isDesktop ? 100 : 60,
                                    height: isDesktop ? 100 : 60,
                                }}
                            />
                        )}
                        <Background
                            variant={BackgroundVariant.Dots}
                            gap={16}
                            size={1}
                        />
                        {/* Empty state when all tables are hidden by filter */}
                        {allTablesHiddenByFilter && (
                            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
                                <div className="pointer-events-auto flex items-center gap-3 rounded-lg border bg-background/90 px-4 py-3 shadow-sm backdrop-blur-sm">
                                    <EyeOff className="size-5 text-muted-foreground" />
                                    <span className="text-sm text-muted-foreground">
                                        {t('canvas.all_tables_hidden')}
                                    </span>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => resetFilter()}
                                    >
                                        {t('canvas.show_all_tables')}
                                    </Button>
                                </div>
                            </div>
                        )}
                        {showFilter ? (
                            <CanvasFilter
                                onClose={() => setShowFilter(false)}
                            />
                        ) : null}
                    </ReactFlow>
                </TableLODContext.Provider>
                <MarkerDefinitions />
            </div>
        </CanvasContextMenu>
    );
};
