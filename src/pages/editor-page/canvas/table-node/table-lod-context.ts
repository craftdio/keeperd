import { createContext } from 'react';
import type { TableLevelOfDetail } from './table-lod';

export const TableLODContext = createContext<TableLevelOfDetail>('detail');
