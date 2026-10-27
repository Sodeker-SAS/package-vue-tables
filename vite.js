/**
 * Plugin de Vite que conecta vue-tables con la aplicación que lo consume.
 *
 * Trabaja sobre la copia del paquete desde la que se importa este archivo: la
 * carpeta viva ../package-vue-tables en local o vendor/sodeker/vue-tables
 * cuando lo instaló Composer. Cuál de las dos se usa lo decide el vite.config.js
 * de la app.
 */
import { readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = dirname(fileURLToPath(import.meta.url));
const { peerDependencies = {} } = JSON.parse(readFileSync(resolve(packageRoot, 'package.json'), 'utf8'));

export default function vueTables() {
    let isLocalCopy = false;

    return {
        name: 'sodeker:vue-tables',

        config(userConfig) {
            const appRoot = resolve(userConfig.root ?? process.cwd());
            isLocalCopy = relative(appRoot, packageRoot).startsWith('..');

            return {
                resolve: {
                    alias: { '@vue-tables': resolve(packageRoot, 'resources') },
                    // En local los componentes viven fuera de la app y Vite buscaría
                    // sus dependencias junto a ellos. Así se resuelven siempre desde
                    // node_modules de la app: un solo Vue, igual que en producción.
                    dedupe: Object.keys(peerDependencies),
                },
                // Vite no sirve archivos fuera de la raíz de la app. Declarar allow
                // reemplaza el valor por defecto, por eso se incluye también la app.
                ...(isLocalCopy && { server: { fs: { allow: [appRoot, packageRoot] } } }),
            };
        },

        configureServer(server) {
            // Fuera de la raíz, Vite solo vigila lo que ya cargó y archivo por
            // archivo: un componente borrado y vuelto a crear quedaba viejo en
            // caché. Vigilar la carpeta entera lo iguala al código de la app.
            if (isLocalCopy) {
                server.watcher.add(resolve(packageRoot, 'resources'));
            }
        },

        configResolved({ command, logger }) {
            if (!isLocalCopy) {
                return;
            }
            if (command === 'build') {
                logger.warn(`vue-tables: el build usa la copia LOCAL (${packageRoot}), no la versión publicada.`);
            } else {
                logger.info(`vue-tables: usando la copia local ${packageRoot}`);
            }
        },
    };
}
