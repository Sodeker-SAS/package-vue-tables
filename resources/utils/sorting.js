/**
 * Orden de las filas en el cliente. Sin DataTables: Vue ordena una copia de los
 * ítems y la tabla nunca toca el DOM que pinta Vue.
 */

/** Tipos de orden que acepta una columna (`sortType`) y la tabla (`orderType`). */
export const SORT_TYPES = ['text', 'number', 'num', 'date', 'datetime'];

// Natural y sin distinguir tildes ni mayúsculas: "item 2" va antes de "item 10"
// y "Ángel" junto a "angel".
const collator = new Intl.Collator('es', { numeric: true, sensitivity: 'base' });

// Fecha colombiana: dd/mm/aaaa o dd-mm-aaaa, con hora opcional.
const DMY = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/;

function normalizeType(type) {
    if (type === 'num') {
        return 'number';
    }
    if (type === 'datetime') {
        return 'date';
    }
    return SORT_TYPES.includes(type) ? type : 'text';
}

function toTime(raw) {
    if (raw instanceof Date) {
        return raw.getTime();
    }
    const match = String(raw).trim().match(DMY);
    if (match) {
        const [, day, month, year, hours = 0, minutes = 0, seconds = 0] = match;
        return new Date(year, month - 1, day, hours, minutes, seconds).getTime();
    }
    return Date.parse(raw);
}

/**
 * Valor por el que se ordena una celda; `null` si está vacía o no se entiende
 * para su tipo (esas filas van siempre al final).
 */
export function sortValue(raw, type = 'text') {
    if (raw === null || raw === undefined || raw === '') {
        return null;
    }

    const normalized = normalizeType(type);

    if (normalized === 'number') {
        const number = Number(raw);
        return Number.isFinite(number) ? number : null;
    }

    if (normalized === 'date') {
        const time = toTime(raw);
        return Number.isFinite(time) ? time : null;
    }

    return String(raw);
}

/** Compara dos valores de `sortValue`. Los vacíos van al final en ambas direcciones. */
export function compareSortValues(a, b, dir = 'asc') {
    if (a === null || b === null) {
        return (a === null) - (b === null);
    }

    const sign = dir === 'desc' ? -1 : 1;

    if (typeof a === 'number' && typeof b === 'number') {
        return (a - b) * sign;
    }

    return collator.compare(String(a), String(b)) * sign;
}
