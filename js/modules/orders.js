/* ========================================================== */
/* 5. PEDIDOS Y COMANDAS                                      */
/* ========================================================== */


/**
 * ==========================================================
 * ABRIR COMANDA DE MESA
 * Consulta mesas y productos desde Firebase Firestore,
 * valida los datos y prepara la pantalla de pedidos.
 * ==========================================================
 */
async function openTableOrder(id) {

    // Guardar el identificador de la mesa seleccionada.
    currentTableId = id;

    // Descargar mesas y productos directamente desde Firebase.
    try {

        console.log(
            'RESTOPOS: Cargando datos de la comanda desde Firebase...'
        );

        // Consultar mesas y productos simultáneamente.
        const [cloudTables, cloudProducts] = await Promise.all([
            window.RestoposDB.getAll('mesas'),
            window.RestoposDB.getAll('productos')
        ]);

        // Actualizar las mesas locales si Firebase devuelve un arreglo.
        if (Array.isArray(cloudTables)) {
            tables = cloudTables;
        }

        // Actualizar los productos locales si Firebase devuelve un arreglo.
        if (Array.isArray(cloudProducts)) {
            products = cloudProducts;

            // Mantener compatibilidad con las listas de bebidas y adicionales.
            drinks = products.filter(product =>
                String(product.category || '').toLowerCase() === 'bebidas'
            );

            addons = products.filter(product =>
                String(product.category || '').toLowerCase() === 'adicionales'
            );
        }

        // Guardar los datos descargados en el almacenamiento local.
        saveData();

        console.log(
            'RESTOPOS: Datos de comanda cargados desde Firebase.',
            'Mesas:',
            tables.length,
            'Productos:',
            products.length
        );

    } catch (error) {

        // Conservar los datos locales si falla la consulta a Firebase.
        console.error(
            'RESTOPOS: Error cargando datos de comanda desde Firebase:',
            error.code,
            error.message
        );

        console.warn(
            'RESTOPOS: Se utilizarán los datos locales disponibles.'
        );
    }

    // Buscar la mesa seleccionada después de consultar Firebase.
    let table = tables.find(
        t => String(t.id) === String(id)
    );

    // Detener la operación si la mesa no existe.
    if (!table) {
        showCustomAlert('No se encontró la mesa seleccionada.');
        return;
    }

    // Asegurar que las comandas tengan un arreglo válido.
    if (typeof table.items === 'string') {
        try {
            table.items = JSON.parse(table.items);
        } catch (error) {
            table.items = [];
        }
    }

    if (!Array.isArray(table.items)) {
        table.items = [];
    }

    // Asegurar que los recibos tengan un arreglo válido.
    if (typeof table.receipts === 'string') {
        try {
            table.receipts = JSON.parse(table.receipts);
        } catch (error) {
            table.receipts = [];
        }
    }

    if (!Array.isArray(table.receipts)) {
        table.receipts = [];
    }

    // Abrir la sección de pedidos.
    await showSection('order-section');

    // Volver a buscar la mesa por si showSection actualizó los datos.
    table = tables.find(
        t => String(t.id) === String(id)
    );

    // Detener la operación si la mesa ya no está disponible.
    if (!table) return;

    // Preparar el título de la pantalla de pedidos.
    const title = `Pedido - ${table.name}`;

    // Actualizar los encabezados de la comanda.
    const orderTitle = document.getElementById('order-title');
    const titleEl = document.getElementById('orderTableTitle');

    if (orderTitle) {
        orderTitle.textContent = title;
    }

    if (titleEl) {
        titleEl.textContent = title;
    }

    // Seleccionar la categoría inicial de productos.
    filterPlusCategory('sopas');

    // Dibujar los productos y artículos de la comanda.
    renderPlusOrderItems();
}


/**
 * ==========================================================
 * MARCAR PEDIDO COMO RECOGIDO
 * Actualiza en Firebase los platos que ya fueron servidos
 * y confirma que el cliente los recogió.
 * ==========================================================
 */
async function markTablePickedUp() {

    // Buscar la mesa que tiene abierta el usuario.
    const table = tables.find(
        t => Number(t.id) === Number(currentTableId)
    );

    // Detener la operación si la mesa no existe.
    if (!table) return;

    // Verificar que exista conexión a internet.
    if (!navigator.onLine) {
        showCustomAlert(
            'No hay conexión a internet. No se pudo marcar el pedido como recogido.'
        );
        return;
    }

    // Comprobar que la mesa tenga una lista válida de platos.
    if (!Array.isArray(table.items)) {
        showCustomAlert('No se encontraron platos en esta mesa.');
        return;
    }

    try {

        // Crear una copia de los platos y marcar como recogidos
        // únicamente los que ya fueron enviados y servidos.
        const updatedItems = table.items.map(item => {

            if (item.sentToKitchen && item.served) {
                return {
                    ...item,
                    pickedUp: true
                };
            }

            // Mantener sin cambios los demás platos.
            return item;
        });

        // Obtener el identificador real del documento de Firestore.
        const documentId = table._docId || `mesa_${table.id}`;

        // Guardar los cambios directamente en Firebase.
        await window.RestoposDB.update(
            'mesas',
            documentId,
            {
                items: updatedItems
            }
        );

        // Actualizar los datos locales después de confirmar el guardado.
        table.items = updatedItems;

        // Actualizar la fecha de modificación local.
        appConfig.lastUpdated = Date.now();

        // Guardar el estado actualizado en el almacenamiento local.
        saveData();

        // Ocultar el aviso de platos listos para recoger.
        const readyBanner = document.getElementById(
            'readyForPickupBanner'
        );

        if (readyBanner) {
            readyBanner.style.display = 'none';
        }

        // Actualizar visualmente los platos de la comanda.
        renderPlusOrderItems();

        // Informar que el pedido fue marcado como recogido.
        showCustomAlert('Pedido marcado como recogido correctamente.');

    } catch (error) {

        // Registrar el error para facilitar su diagnóstico.
        console.error(
            'RESTOPOS: Error marcando pedido como recogido en Firebase:',
            error.code,
            error.message
        );

        // Informar que no se pudo completar la operación.
        showCustomAlert(
            'No se pudo marcar el pedido como recogido. Verifique su conexión e inténtelo nuevamente.'
        );
    }
}

/**
 * ==========================================================
 * NORMALIZAR CATEGORÍAS DE PRODUCTOS
 * Convierte los nombres de las categorías a valores
 * estandarizados para facilitar su clasificación y filtrado.
 * ==========================================================
 */
function normalizeCategory(cat) {
    if (!cat) return 'principales';
    const c = String(cat).toLowerCase().trim();
    if (c.includes('sopa') || c.includes('entrada')) return 'sopas';
    if (c.includes('principal') || c.includes('plato')) return 'principales';
    if (c.includes('bebida') || c.includes('jugo')) return 'bebidas';
    if (c.includes('adicional') || c.includes('extra')) return 'adicionales';
    return c;
}

/**
 * ==========================================================
 * VERIFICAR ESTADO DE ACTIVACIÓN DEL PRODUCTO
 * Determina si un producto está activo y disponible
 * para mostrarse en el catálogo de pedidos.
 * ==========================================================
 */
function isProductActive(p) {
    if (p.active === undefined || p.active === null) return true;
    if (typeof p.active === 'boolean') return p.active;
    const str = String(p.active).toLowerCase().trim();
    return !['false', 'inactivo', '0', 'no'].includes(str);
}

/**
 * ==========================================================
 * FILTRAR CATÁLOGO POR CATEGORÍA
 * Filtra los productos cargados en memoria según su categoría
 * normalizada y su estado de activación.
 * No realiza consultas adicionales a Firebase.
 * ==========================================================
 */

function filterPlusCategory(category, event) {
    currentPlusCategory = category;

    document.querySelectorAll('.plus-cat-btn').forEach(btn => {
        btn.style.background = '#ffffff';
        btn.classList.remove('active-cat');
    });

    if (event && event.currentTarget) {
        event.currentTarget.style.background = '#e2e8f0';
        event.currentTarget.classList.add('active-cat');
    } else {
        const firstBtn = document.querySelector('.plus-cat-btn');
        if (firstBtn) firstBtn.style.background = '#e2e8f0';
    }

    const catalogGrid = document.getElementById('plusCatalogGrid');
    if (!catalogGrid) return;

    catalogGrid.innerHTML = '';

    const targetCat = normalizeCategory(category);

    const itemsToDisplay = products.filter(p => {
        const prodCat = normalizeCategory(p.category);
        return prodCat === targetCat && isProductActive(p);
    });

    if (itemsToDisplay.length === 0) {
        catalogGrid.innerHTML = `
            <div style="
                grid-column: 1 / -1;
                text-align: center;
                font-size: 0.8rem;
                color: var(--text-secondary);
                padding: 1rem;
            ">
                No hay productos activos en esta categoría.
            </div>
        `;
        return;
    }

    // Configurar el catálogo para desplazamiento horizontal
    catalogGrid.style.display = 'grid';
    catalogGrid.style.gridTemplateRows = 'repeat(2, 55px)';
    catalogGrid.style.gridTemplateColumns = 'none';
    catalogGrid.style.gridAutoFlow = 'column';
    catalogGrid.style.gap = '8px';

    catalogGrid.style.width = '100%';
    catalogGrid.style.height = '126px';
    catalogGrid.style.maxHeight = '126px';
    catalogGrid.style.boxSizing = 'border-box';

    catalogGrid.style.overflowX = 'auto';
    catalogGrid.style.overflowY = 'hidden';
    catalogGrid.style.padding = '4px';
    catalogGrid.style.webkitOverflowScrolling = 'touch';
    catalogGrid.style.touchAction = 'pan-x';
    catalogGrid.style.justifyContent = 'start';
    catalogGrid.style.alignContent = 'start';

    // Calcular el ancho de cada columna según el espacio disponible
    const availableWidth = catalogGrid.clientWidth - 8;
    const columnWidth = Math.floor((availableWidth - 16) / 3);

    catalogGrid.style.gridAutoColumns = `${columnWidth}px`;

    // Crear los botones de platos
    itemsToDisplay.forEach(item => {
        const btn = document.createElement('div');

        btn.style.cssText = `
            background: #ffffff;
            border: 1px solid var(--border);
            border-radius: 6px;
            padding: 0.4rem;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            align-items: center;
            cursor: pointer;
            text-align: center;
            width: 100%;
            min-width: 0;
            height: 55px;
            box-sizing: border-box;
            overflow: hidden;
        `;

        const itemId = 'prod_' + item.id;

        btn.innerHTML = `
            <span style="
                font-size: 0.7rem;
                font-weight: bold;
                color: var(--text);
                overflow: hidden;
                text-overflow: ellipsis;
                display: -webkit-box;
                -webkit-line-clamp: 2;
                -webkit-box-orient: vertical;
                line-height: 1.1;
                width: 100%;
            ">${item.name}</span>

            <span style="
                font-size: 0.7rem;
                color: var(--primary);
                font-weight: bold;
            ">$${(Number(item.price) || 0).toLocaleString()}</span>
        `;

        btn.onclick = () => addProductDirectlyToOrder(itemId);

        catalogGrid.appendChild(btn);
    });

    // Comenzar mostrando los primeros platos
    catalogGrid.scrollLeft = 0;
}




/**
 * ==========================================================
 * AGREGAR PRODUCTO DIRECTAMENTE A LA COMANDA
 * Registra el producto en la mesa y guarda los cambios
 * directamente en Firebase Firestore.
 * ==========================================================
 */
async function addProductDirectlyToOrder(itemIdentifier) {

    // Buscar la mesa que tiene abierta el usuario.
    const table = tables.find(
        t => Number(t.id) === Number(currentTableId)
    );

    // Detener la operación si la mesa no existe.
    if (!table) return;

    // Comprobar que exista conexión a internet.
    if (!navigator.onLine) {
        showCustomAlert(
            'No hay conexión a internet. No se pudo agregar el producto.'
        );
        return;
    }

    // Extraer el identificador numérico del producto.
    const id = parseInt(
        String(itemIdentifier)
            .replace('prod_', '')
            .replace('drink_', '')
            .replace('addon_', ''),
        10
    );

    // Buscar el producto en el catálogo.
    const prod = products.find(
        p => Number(p.id) === id
    );

    // Detener la operación si el producto no existe.
    if (!prod) return;

    try {

        // Crear el nuevo elemento de la comanda.
        const orderItemData = {
            uid: '_' + Math.random().toString(36).substr(2, 9),
            productId: prod.id,
            name: prod.name,
            finalPrice: prod.price,
            modifications: [],
            observation: '',
            kitchenChecked: false,
            billed: false,
            sentToKitchen: false,
            served: false,
            pickedUp: false
        };

        // Preparar una copia de los elementos actuales.
        const currentItems = Array.isArray(table.items)
            ? table.items
            : [];

        // Agregar el nuevo producto sin modificar todavía los datos locales.
        const updatedItems = [
            ...currentItems,
            orderItemData
        ];

        // Obtener el identificador real del documento de Firestore.
        const documentId = table._docId || `mesa_${table.id}`;

        // Guardar la comanda directamente en Firebase.
        await window.RestoposDB.update(
            'mesas',
            documentId,
            {
                items: updatedItems,
                status: 'ocupada'
            }
        );

        // Actualizar los datos locales después del guardado exitoso.
        table.items = updatedItems;
        table.status = 'ocupada';

        // Actualizar la fecha de modificación local.
        appConfig.lastUpdated = Date.now();

        // Guardar los cambios en el almacenamiento local.
        saveData();

        // Actualizar visualmente los productos de la comanda.
        renderPlusOrderItems();

        console.log(
            'RESTOPOS: Producto agregado a la comanda en Firebase:',
            prod.name
        );

    } catch (error) {

        // Registrar el error para facilitar el diagnóstico.
        console.error(
            'RESTOPOS: Error agregando producto a Firebase:',
            error.code,
            error.message
        );

        // Informar que el producto no pudo agregarse.
        showCustomAlert(
            'No se pudo agregar el producto a la comanda. Verifique su conexión e inténtelo nuevamente.'
        );
    }
}


function renderPlusOrderItems() {
    const table = tables.find(t => t.id === currentTableId);
    const list = document.getElementById('plusOrderItemsList');
    if (!list || !table) return;

    list.innerHTML = '';
    let total = 0;

    if (table.items.length === 0) {
        list.innerHTML = '<p style="color: var(--text-secondary); text-align: center; padding: 1.5rem; font-size: 0.85rem;">No hay productos en esta mesa.</p>';
    } else {
        table.items.forEach((item, index) => {
            total += item.finalPrice;

            const row = document.createElement('div');
            row.style.cssText = "display: grid; grid-template-columns: 35px 2.2fr 2.5fr 40px; padding: 0.35rem 0.2rem; border-bottom: 1px solid var(--border); align-items: center; font-size: 0.8rem;";

            const isSentOrBilled = item.sentToKitchen || item.billed;
            const isCheckedAttr = (item.sentToKitchen || item.kitchenChecked) ? 'checked' : '';
            const disabledAttr = isSentOrBilled ? 'disabled' : '';

            let statusBadge = '';
            if (item.billed) {
                statusBadge = `<span style="font-size: 0.62rem; background: #e2e8f0; color: #475569; padding: 0.1rem 0.3rem; border-radius: 4px; font-weight: bold; margin-left: 6px; display: inline-block;">💳 Facturado</span>`;
            } else if (item.pickedUp) {
                statusBadge = `<span style="font-size: 0.62rem; background: #dcfce7; color: #15803d; padding: 0.1rem 0.3rem; border-radius: 4px; font-weight: bold; margin-left: 6px; display: inline-block;">✅ Servido</span>`;
            } else if (item.served) {
                statusBadge = `<span style="font-size: 0.62rem; background: #fef08a; color: #854d0e; padding: 0.1rem 0.3rem; border-radius: 4px; font-weight: bold; margin-left: 6px; display: inline-block;">🔔 Listo en Cocina</span>`;
            } else if (item.sentToKitchen) {
                statusBadge = `<span style="font-size: 0.62rem; background: #e0f2fe; color: #0369a1; padding: 0.1rem 0.3rem; border-radius: 4px; font-weight: bold; margin-left: 6px; display: inline-block;">🧑‍🍳 En Cocina</span>`;
            }

            row.innerHTML = `
                <div style="text-align: center;">
                    <input type="checkbox" ${isCheckedAttr} ${disabledAttr} onchange="updateItemKitchenCheck(${index}, this.checked)" style="width: 16px; height: 16px; cursor: pointer;">
                </div>
                <div style="padding-left: 2px; overflow: hidden;">
                    <strong style="font-size: 0.78rem; display: block; color: var(--text);">${item.name}</strong>
                    <div style="display: flex; align-items: center; flex-wrap: wrap;">
                        <span style="font-size: 0.7rem; color: var(--primary); font-weight: bold;">$${item.finalPrice.toLocaleString()}</span>
                        ${statusBadge}
                    </div>
                </div>
                <div style="padding: 0 2px;">
                    <input type="text" value="${item.observation || ''}" ${disabledAttr} placeholder="Nota..." oninput="updateItemObservation(${index}, this.value)" style="width: 100%; padding: 0.25rem; font-size: 0.75rem; border: 1px solid var(--border); border-radius: 4px; box-sizing: border-box; background: ${isSentOrBilled ? '#f1f5f9' : 'var(--bg)'}; color: var(--text);">
                </div>
                <div style="text-align: center;">
                    <button onclick="removePlusOrderItem(${index})" class="action-btn" title="Eliminar" style="font-size: 0.9rem; background: none; border: none; cursor: ${isSentOrBilled ? 'not-allowed' : 'pointer'}; color: ${isSentOrBilled ? '#cbd5e1' : '#ef4444'};" ${disabledAttr}>🗑️</button>
                </div>
            `;
            list.appendChild(row);
        });
    }

    const orderTotalEl = document.getElementById('orderTotal');
    if (orderTotalEl) orderTotalEl.innerText = `$ ${total.toLocaleString()}`;

    // 💡 NUEVO: Controlar automáticamente si se muestra u oculta el banner de "Marcar como Recogido"
    const hasReadyItems = table.items.some(item => item.sentToKitchen && item.served && !item.pickedUp);
    let readyBanner = document.getElementById('readyForPickupBanner');

    if (readyBanner) {
        readyBanner.style.display = hasReadyItems ? 'block' : 'none';
    }
}



/**
 * ==========================================================
 * ACTUALIZAR SELECCIÓN DE PLATO PARA COCINA
 * Guarda en Firebase el estado del checkbox que utiliza
 * el mesero para seleccionar los platos que enviará a cocina.
 * ==========================================================
 */

async function updateItemKitchenCheck(index, isChecked) {

    // Capturar el identificador de la mesa al iniciar la operación.
    const targetTableId = currentTableId;

    // Buscar la mesa que tiene abierta el usuario.
    const table = tables.find(
        t => Number(t.id) === Number(targetTableId)
    );

    if (!table || !Array.isArray(table.items)) return;

    const item = table.items[index];

    if (!item) return;

    // Impedir cambios en productos enviados o facturados.
    if (item.sentToKitchen || item.billed) {
        renderPlusOrderItems();
        return;
    }

    if (!navigator.onLine) {
        renderPlusOrderItems();

        showCustomAlert(
            'No hay conexión a internet. No se pudo actualizar la selección.'
        );
        return;
    }

    try {

        // Actualizar inmediatamente el estado local.
        const updatedItems = table.items.map(
            (currentItem, currentIndex) => {

                if (currentIndex === index) {
                    return {
                        ...currentItem,
                        kitchenChecked: isChecked
                    };
                }

                return currentItem;
            }
        );

        // Actualizar la mesa local antes de iniciar el guardado.
        table.items = updatedItems;

        // Actualizar la interfaz inmediatamente.
        saveData();
        renderPlusOrderItems();

        // Identificar el documento de Firestore.
        const documentId =
            table._docId || `mesa_${table.id}`;

        // Obtener la cola de guardados anterior.
        const previousSave =
            window.kitchenCheckSaveQueue || Promise.resolve();

        // Encolar el nuevo guardado.
        const currentSave = previousSave
            .catch(() => { })
            .then(async () => {

                // Buscar nuevamente la mesa original de esta operación.
                const latestTable = tables.find(
                    t => Number(t.id) === Number(targetTableId)
                );

                if (!latestTable) {
                    throw new Error('No se encontró la mesa.');
                }

                // Guardar el estado más reciente en Firebase.
                await window.RestoposDB.update(
                    'mesas',
                    documentId,
                    {
                        items: latestTable.items
                    }
                );
            });

        // Guardar la referencia de la operación pendiente.
        window.kitchenCheckSaveQueue = currentSave;

        // Esperar a que termine este guardado.
        await currentSave;

        console.log(
            'RESTOPOS: Selección guardada correctamente:',
            item.name,
            isChecked
        );

    } catch (error) {

        console.error(
            'RESTOPOS: Error actualizando selección para cocina:',
            error.code,
            error.message
        );

        showCustomAlert(
            'No se pudo guardar la selección en Firebase. Verifique su conexión.'
        );
    }
}



/**
 * ==========================================================
 * ACTUALIZAR OBSERVACIÓN DEL PLATO
 * Actualiza inmediatamente la observación en memoria
 * y programa su sincronización con Firebase después
 * de 700 ms sin nuevas modificaciones.
 * ==========================================================
 */
function updateItemObservation(index, textValue) {

    // Buscar la mesa que tiene abierta el usuario.
    const table = tables.find(
        t => Number(t.id) === Number(currentTableId)
    );

    // Verificar que la mesa y sus platos existan.
    if (!table || !Array.isArray(table.items)) return;

    // Obtener el plato correspondiente.
    const item = table.items[index];

    // Detener la operación si el plato no existe.
    if (!item) return;

    // Impedir modificaciones en platos enviados o facturados.
    if (item.sentToKitchen || item.billed) {
        renderPlusOrderItems();
        return;
    }

    // Actualizar inmediatamente los datos locales.
    item.observation = textValue;
    item.modifications = textValue
        ? [`Nota: ${textValue}`]
        : [];

    // Guardar el cambio localmente.
    saveData();

    // Identificar de forma única la observación que se está editando.
    const timerKey = `${currentTableId}_${item.uid}`;

    // Cancelar el guardado anterior si el usuario sigue escribiendo.
    if (observationSaveTimers[timerKey]) {
        clearTimeout(observationSaveTimers[timerKey]);
    }

    // Programar el guardado en Firebase después de 700 ms.
    observationSaveTimers[timerKey] = setTimeout(async () => {

        try {

            // Comprobar que exista conexión a internet.
            if (!navigator.onLine) {
                throw new Error('No hay conexión a internet.');
            }

            // Obtener el identificador real del documento de Firestore.
            const documentId = table._docId || `mesa_${table.id}`;

            // Guardar la lista actualizada de platos en Firebase.
            await window.RestoposDB.update(
                'mesas',
                documentId,
                {
                    items: table.items
                }
            );

            console.log(
                'RESTOPOS: Observación guardada en Firebase.',
                item.name
            );

        } catch (error) {

            // Registrar el error para facilitar su diagnóstico.
            console.error(
                'RESTOPOS: Error guardando observación:',
                error.code,
                error.message
            );

            // Informar del problema sin interrumpir la escritura.
            showCustomAlert(
                'No se pudo guardar la observación en Firebase. Verifique su conexión.'
            );

        } finally {

            // Liberar el temporizador utilizado por este plato.
            delete observationSaveTimers[timerKey];
        }

    }, 700);
}


/**
 * ==========================================================
 * ELIMINAR PRODUCTO DE LA COMANDA
 * Elimina el producto localmente y actualiza Firestore.
 * No permite eliminar platos enviados a cocina o facturados.
 * ==========================================================
 */
async function removePlusOrderItem(index) {

    // Buscar la mesa que tiene abierta el usuario.
    const table = tables.find(
        t => Number(t.id) === Number(currentTableId)
    );

    // Verificar que la mesa exista y tenga una lista de platos.
    if (!table || !Array.isArray(table.items)) return;

    // Buscar el producto que se desea eliminar.
    const item = table.items[index];

    // Comprobar que el producto exista.
    if (!item) return;

    // Impedir la eliminación de platos que ya fueron facturados.
    if (item.billed) {
        showCustomAlert('Este plato ya fue facturado.');
        return;
    }

    // Impedir la eliminación de platos que ya fueron enviados a cocina.
    if (item.sentToKitchen) {
        showCustomAlert(
            'Este plato ya fue enviado a cocina y no se puede eliminar.'
        );
        return;
    }

    // Comprobar que exista conexión a internet.
    if (!navigator.onLine) {
        showCustomAlert(
            'No hay conexión a internet. No se pudo eliminar el producto.'
        );
        return;
    }

    try {

        // Crear una copia de la lista sin el producto seleccionado.
        const updatedItems = table.items.filter(
            (currentItem, currentIndex) => currentIndex !== index
        );

        // Mantener el comportamiento actual cuando la mesa queda vacía.
        const updatedStatus = updatedItems.length === 0
            ? 'libre'
            : 'ocupada';

        // Obtener el identificador real del documento de Firestore.
        const documentId = table._docId || `mesa_${table.id}`;

        // Guardar la eliminación directamente en Firebase.
        await window.RestoposDB.update(
            'mesas',
            documentId,
            {
                items: updatedItems,
                status: updatedStatus
            }
        );

        // Actualizar los datos locales después del guardado exitoso.
        table.items = updatedItems;
        table.status = updatedStatus;

        // Actualizar la fecha de modificación local.
        appConfig.lastUpdated = Date.now();

        // Guardar los cambios en el almacenamiento local.
        saveData();

        // Actualizar visualmente la comanda y el total.
        renderPlusOrderItems();

        console.log(
            'RESTOPOS: Producto eliminado de la comanda en Firebase.'
        );

    } catch (error) {

        // Registrar el error para facilitar el diagnóstico.
        console.error(
            'RESTOPOS: Error eliminando producto de Firebase:',
            error.code,
            error.message
        );

        // Informar que no se pudo completar la eliminación.
        showCustomAlert(
            'No se pudo eliminar el producto. Verifique su conexión e inténtelo nuevamente.'
        );
    }
}
