/**
 * Carga los datos operativos desde Firebase Firestore.
 * Obtiene las mesas, los productos y la configuración general.
 * Clasifica los productos en productos, bebidas y adicionales.
 * Guarda una copia local de los datos en localStorage.
 */

async function loadDataFromCloud() {
    try {
        console.log('RESTOPOS: Cargando datos desde Firebase...');

        const [cloudTables, cloudProducts, cloudConfig] =
            await Promise.all([
                window.RestoposDB.getAll('mesas'),
                window.RestoposDB.getAll('productos'),
                window.RestoposDB.getById('configuracion', 'general')
            ]);

        // MESAS
        tables = cloudTables;

        // PRODUCTOS
        products = cloudProducts;

        // BEBIDAS: productos de categoría bebidas
        drinks = products.filter(product =>
            String(product.category || '').toLowerCase() === 'bebidas'
        );

        // ADICIONALES: productos de categoría adicionales
        addons = products.filter(product =>
            String(product.category || '').toLowerCase() === 'adicionales'
        );

        // CONFIGURACIÓN GENERAL
        if (cloudConfig) {
            appConfig = {
                ...appConfig,
                ...cloudConfig
            };
        }

        // Guardar copia local
        saveData();

        console.log('RESTOPOS: Datos cargados desde Firebase.', {
            mesas: tables.length,
            productos: products.length,
            bebidas: drinks.length,
            adicionales: addons.length
        });

        return true;

    } catch (error) {
        console.error(
            'RESTOPOS: Error cargando datos desde Firebase:',
            error.code,
            error.message
        );

        return false;
    }
}

/**
 * Guarda una copia local de los datos operativos en localStorage.
 * Almacena mesas, productos, bebidas, adicionales, usuarios,
 * historial de ventas y configuración general.
 */

function saveData() {
    localStorage.setItem('restopos_tables', JSON.stringify(tables));
    localStorage.setItem('restopos_addons', JSON.stringify(addons));
    localStorage.setItem('restopos_products', JSON.stringify(products));
    localStorage.setItem('restopos_drinks', JSON.stringify(drinks));
    localStorage.setItem('restopos_sales_history', JSON.stringify(salesHistory));
    localStorage.setItem('restopos_users', JSON.stringify(users));
    localStorage.setItem('restopos_config', JSON.stringify(appConfig));
}