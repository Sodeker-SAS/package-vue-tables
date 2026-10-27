/**
 * Botones de página de la paginación: siempre la primera, la última y las
 * vecinas de la actual, con puntos suspensivos en los saltos.
 *
 * Con más de `slots` páginas devuelve siempre `slots` elementos, así la barra
 * no cambia de ancho al pasar de una página a otra.
 *
 *     paginationItems(6, 20) → 1 … 5 6 7 … 20
 *
 * @returns {{ type: 'page' | 'ellipsis', value: number | string }[]}
 */
export function paginationItems(current, last, slots = 7) {
    const pages = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => ({ type: 'page', value: from + i }));

    if (last <= slots) {
        return pages(1, last);
    }

    // Lugares para páginas a cada lado de la actual, descontando la primera,
    // la última y los dos puntos suspensivos.
    const side = Math.floor((slots - 5) / 2);
    const edge = slots - 2; // páginas seguidas cuando la actual está cerca de un extremo

    if (current <= edge - side) {
        return [...pages(1, edge), { type: 'ellipsis', value: 'end' }, ...pages(last, last)];
    }

    if (current >= last - (edge - side) + 1) {
        return [...pages(1, 1), { type: 'ellipsis', value: 'start' }, ...pages(last - edge + 1, last)];
    }

    return [
        ...pages(1, 1),
        { type: 'ellipsis', value: 'start' },
        ...pages(current - side, current + side),
        { type: 'ellipsis', value: 'end' },
        ...pages(last, last),
    ];
}
