/**
 * Punto de entrada público de vue-tables. Cada tabla, composable o utilidad
 * nueva se exporta aquí para que los proyectos la importen desde '@vue-tables':
 *
 *     import { DataTable } from '@vue-tables';
 */
export { default as DataTable } from './components/DataTable.vue';
export { default as EditableTable } from './components/EditableTable.vue';
export { moveItem } from './utils/reorder.js';
