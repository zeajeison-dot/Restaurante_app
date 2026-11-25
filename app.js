/**
 * ==========================================================
 * CARGAR USUARIOS Y CONFIGURACIÓN DESDE FIREBASE
 * ==========================================================
 *
 * Obtiene la configuración general desde Firestore.
 * Si el usuario autenticado es administrador, también
 * consulta la colección de usuarios.
 *
 * La autenticación y las contraseñas son gestionadas
 * exclusivamente por Firebase Authentication.
 *
 * ==========================================================
 */
async function loadUsersAndConfigFromCloud() {
    try {
        if (!window.auth || !window.auth.currentUser) {
            throw new Error('No hay un usuario autenticado en Firebase.');
        }

        // Consultar la configuración general.
        const cloudConfig = await window.RestoposDB.getById(
            'configuracion',
            'general'
        );

        if (cloudConfig) {
            appConfig = {
                ...appConfig,
                waiterAlarmInterval: Number(cloudConfig.waiterAlarmInterval) || 60,
                waiterCanGenerateReceipt:
                    cloudConfig.waiterCanGenerateReceipt !== false,
                lastUpdated: Number(cloudConfig.lastUpdated) || 0
            };

            localStorage.setItem(
                'restopos_config',
                JSON.stringify(appConfig)
            );
        }

        // Consultar los datos del usuario autenticado.
        const currentUser = await window.RestoposDB.getById(
            'usuarios',
            window.auth.currentUser.uid
        );

        if (!currentUser || currentUser.activo !== true) {
            throw new Error('El usuario no existe o está desactivado.');
        }

        // Solo el administrador puede consultar la lista completa.
        if (currentUser.rol === 'admin') {
            users = await window.RestoposDB.getAll('usuarios');

            localStorage.setItem(
                'restopos_users',
                JSON.stringify(users)
            );
        }

        return true;

    } catch (error) {
        console.error(
            'RESTOPOS: Error cargando usuarios o configuración:',
            error.code,
            error.message
        );

        return false;
    }
}


/**
 * ==========================================================
 * GUARDAR CONFIGURACIÓN DE ALARMAS Y PERMISOS EN FIREBASE
 * ==========================================================
 *
 * Guarda el intervalo de alarma para los meseros y el permiso
 * para generar recibos directamente en Firestore.
 *
 * Colección: configuracion
 * Documento: general
 *
 * ==========================================================
 */
async function saveWaiterAlarmConfig() {
    const val = parseInt(
        document.getElementById('waiterAlarmIntervalParam').value,
        10
    );

    const canGen = document
        .getElementById('waiterCanGenerateReceiptParam')
        ?.checked ?? true;

    if (isNaN(val) || val < 5) {
        showCustomAlert(
            'Ingrese un valor válido en segundos (mínimo 5).'
        );
        return;
    }

    try {
        const updatedConfig = {
            waiterAlarmInterval: val,
            waiterCanGenerateReceipt: canGen,
            lastUpdated: Date.now()
        };

        // Guardar configuración directamente en Firestore.
        await window.RestoposDB.set(
            'configuracion',
            'general',
            updatedConfig,
            true
        );

        // Actualizar la configuración local.
        appConfig = {
            ...appConfig,
            ...updatedConfig
        };

        localStorage.setItem(
            'restopos_config',
            JSON.stringify(appConfig)
        );

        showCustomAlert(
            '✅ Configuración y permisos guardados correctamente en Firebase.'
        );

    } catch (error) {
        console.error(
            'RESTOPOS: Error guardando configuración:',
            error
        );

        showCustomAlert(
            '❌ No fue posible guardar la configuración en Firebase.'
        );
    }
}

/* ========================================================== */
/* 4. GESTIÓN Y ADMINISTRACIÓN DE MESAS                       */
/* ========================================================== */

/**
 * Renderiza la cuadrícula de mesas en salón.
 * Cómo lo realiza: Evalúa estados (libre, ocupada, alerta) y pinta las tarjetas.
 * Consulta a Sheets: Ninguna.
 */
/**
 * Renderiza la cuadrícula de mesas en salón de forma segura y robusta.
 */
function renderTables() {
    const container = document.getElementById('tableGridContainer');
    if (!container) return;
    container.innerHTML = '';

    // Asegurar que tables sea un arreglo válido
    if (!Array.isArray(tables)) {
        tables = [];
    }

    if (tables.length === 0) {
        container.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; color: var(--text-secondary); padding: 1.5rem; font-size: 0.85rem;">No hay mesas configuradas.</div>';
        return;
    }

    tables.forEach(t => {
        // Parsear items y receipts por si vienen como string desde Google Sheets
        let items = t.items;
        if (typeof items === 'string') {
            try { items = JSON.parse(items); } catch (e) { items = []; }
        }
        if (!Array.isArray(items)) items = [];

        let receipts = t.receipts;
        if (typeof receipts === 'string') {
            try { receipts = JSON.parse(receipts); } catch (e) { receipts = []; }
        }
        if (!Array.isArray(receipts)) receipts = [];

        const div = document.createElement('div');
        const hasReadyItems = items.some(item => item.sentToKitchen && item.served && !item.pickedUp);
        const hasInKitchenItems = items.some(item => item.sentToKitchen && !item.served);

        let classNames = `table-item ${t.status || 'libre'}`;
        let statusText = t.status || 'libre';

        if (hasReadyItems) {
            classNames += ` table-item-alert`;
            statusText = '¡Listos en cocina!';
        } else if (hasInKitchenItems) {
            classNames = `table-item ocupada`;
            statusText = 'En cocina';
        }

        div.className = classNames;
        div.innerHTML = `${t.name || 'Mesa'}<br><span style="font-size:0.65rem; text-transform:uppercase;">${statusText}</span>`;
        div.onclick = () => openTableOrder(t.id);
        container.appendChild(div);
    });
}



/* ========================================================== */
/* 6. MÓDULO DE COCINA (KDS)                                   */
/* ========================================================== */

function playAlarmBeep() {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(659.25, audioCtx.currentTime);
        gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.4);
    } catch (e) {
        console.log("Audio bloqueado", e);
    }
}


/**
 * ==========================================================
 * ENVIAR COMANDA A COCINA
 * Consulta primero los datos actualizados de Firestore
 * para identificar correctamente los productos seleccionados.
 * ==========================================================
 */
async function sendOrderToKitchen() {

    // Comprobar conexión a internet.
    if (!navigator.onLine) {
        showCustomAlert(
            'No hay conexión a internet. La comanda no se pudo enviar a cocina.'
        );
        return;
    }

    // Buscar la mesa seleccionada.
    const localTable = tables.find(
        t => Number(t.id) === Number(currentTableId)
    );

    if (!localTable) {
        showCustomAlert('No se encontró la mesa seleccionada.');
        return;
    }

    try {

        console.log(
            'RESTOPOS: Consultando estado actualizado de la mesa en Firebase...'
        );

        // Obtener el identificador del documento de Firestore.
        const documentId =
            localTable._docId || `mesa_${localTable.id}`;

        // Esperar a que terminen todos los guardados de los checkbox.
        if (window.kitchenCheckSaveQueue) {

            console.log(
                'RESTOPOS: Esperando guardados pendientes de selección...'
            );

            await window.kitchenCheckSaveQueue;
        }

        // Consultar directamente la mesa en Firebase.
        const cloudTable = await window.RestoposDB.getById(
            'mesas',
            documentId
        );

        if (!cloudTable) {
            showCustomAlert(
                'No se encontró la mesa en Firebase.'
            );
            return;
        }

        // Actualizar la copia local con los datos más recientes.
        localTable.items = Array.isArray(cloudTable.items)
            ? cloudTable.items
            : [];

        localTable.status = cloudTable.status || 'libre';

        // Identificar los productos nuevos seleccionados.
        const itemsToSend = localTable.items.filter(
            item =>
                item.sentToKitchen !== true &&
                item.kitchenChecked === true
        );

        console.log(
            'RESTOPOS: Productos seleccionados para cocina:',
            itemsToSend.length
        );

        // Mostrar los estados encontrados para diagnóstico.
        console.log(
            'RESTOPOS: Estado de productos:',
            localTable.items.map(item => ({
                nombre: item.name,
                kitchenChecked: item.kitchenChecked,
                sentToKitchen: item.sentToKitchen
            }))
        );

        // Detener el envío si no hay productos seleccionados.
        if (itemsToSend.length === 0) {

            saveData();
            renderPlusOrderItems();

            showCustomAlert(
                '⚠️ No hay productos nuevos seleccionados para enviar a cocina.'
            );

            return;
        }

        // Registrar el momento exacto del envío.
        const now = Date.now();

        // Preparar los productos seleccionados para cocina.
        const updatedItems = localTable.items.map(item => {

            // Conservar los productos que no fueron seleccionados.
            if (
                item.sentToKitchen === true ||
                item.kitchenChecked !== true
            ) {
                return item;
            }

            // Marcar el producto como enviado.
            return {
                ...item,
                sentToKitchen: true,
                served: false,
                pickedUp: false,
                sentAt: now,
                kitchenChecked: true
            };
        });

        // Guardar la comanda directamente en Firestore.
        await window.RestoposDB.update(
            'mesas',
            documentId,
            {
                items: updatedItems,
                status: 'ocupada'
            }
        );

        // Actualizar los datos locales después del guardado.
        localTable.items = updatedItems;
        localTable.status = 'ocupada';

        appConfig.lastUpdated = now;

        // Guardar el estado local.
        saveData();

        // Actualizar visualmente la comanda.
        renderPlusOrderItems();

        console.log(
            'RESTOPOS: Comanda enviada correctamente a Firebase.',
            'Productos:',
            itemsToSend.length
        );

        // Informar el resultado.
        showCustomAlert(
            `👨‍🍳 Comanda enviada a cocina exitosamente (${itemsToSend.length} ítem(s)).`
        );

        // Regresar a la pantalla de mesas.
        await showSection('tables-section');

    } catch (error) {

        console.error(
            'RESTOPOS: Error enviando comanda a Firebase:',
            error.code,
            error.message
        );

        showCustomAlert(
            '⚠️ No se pudo enviar la comanda a cocina. Verifique su conexión e inténtelo nuevamente.'
        );
    }
}



/**
 * Renderiza comandas en pantalla de cocina con alertas de color según porcentaje y umbral.
 * Cómo lo realiza: Agrupa por lotes y calcula umbrales porcentuales.
 * Consulta a Sheets: Ninguna.
 */
function renderKitchenOrders() {
    const container = document.getElementById('kitchenOrdersContainer');
    if (!container) return;
    container.innerHTML = '';

    const limitMinutes = parseInt(document.getElementById('kitchenTimerParam').value, 10) || 15;
    const limitSeconds = limitMinutes * 60;

    const alarmPercent = parseInt(document.getElementById('kitchenAlarmParam')?.value, 10) || 25;
    const redThresholdSeconds = limitSeconds * (alarmPercent / 100);
    const yellowThresholdSeconds = limitSeconds * 0.50;

    const now = Date.now();
    const activeBatches = [];
    let triggerAlarm = false;

    tables.forEach(table => {
        const activeItems = table.items.filter(item => item.sentToKitchen && !item.served);

        if (activeItems.length > 0) {
            const batchesMap = {};
            activeItems.forEach(item => {
                const batchKey = item.sentAt || now;
                if (!batchesMap[batchKey]) batchesMap[batchKey] = [];
                batchesMap[batchKey].push(item);
            });

            Object.keys(batchesMap).forEach(batchKey => {
                const batchTime = parseInt(batchKey, 10);
                activeBatches.push({
                    tableId: table.id,
                    tableName: table.name,
                    batchId: batchTime,
                    items: batchesMap[batchKey],
                    sentAt: batchTime
                });
            });
        }
    });

    activeBatches.sort((a, b) => a.sentAt - b.sentAt);

    activeBatches.forEach(batch => {
        const elapsedSecs = Math.floor((now - batch.sentAt) / 1000);
        const remainingSecs = limitSeconds - elapsedSecs;
        if (remainingSecs <= redThresholdSeconds) {
            triggerAlarm = true;
        }
    });

    if (triggerAlarm && (now - lastKitchenAlarmTime >= 30000)) {
        playAlarmBeep();
        lastKitchenAlarmTime = now;
    }

    if (activeBatches.length === 0) {
        container.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; padding: 3rem; color: var(--text-secondary);">
                <h3>No hay comandas pendientes</h3>
            </div>
        `;
        return;
    }

    activeBatches.forEach(batch => {
        const elapsedSecs = Math.floor((now - batch.sentAt) / 1000);
        const remainingSecs = limitSeconds - elapsedSecs;
        const isExpired = remainingSecs <= 0;
        const absRemaining = Math.abs(remainingSecs);
        const remMins = Math.floor(absRemaining / 60);
        const remSecs = absRemaining % 60;
        const timeFormatted = `${isExpired ? '-' : ''}${remMins}:${remSecs < 10 ? '0' : ''}${remSecs}`;

        let cardBg = '#dcfce7';
        let borderColor = '#22c55e';
        let textColor = '#15803d';

        if (remainingSecs <= redThresholdSeconds) {
            cardBg = '#fee2e2';
            borderColor = '#ef4444';
            textColor = '#b91c1c';
        } else if (remainingSecs <= yellowThresholdSeconds) {
            cardBg = '#fef9c3';
            borderColor = '#eab308';
            textColor = '#854d0e';
        }

        const card = document.createElement('div');
        card.style.cssText = `background: ${cardBg}; border: 2px solid ${borderColor}; border-radius: 12px; padding: 1rem; display: flex; flex-direction: column; justify-content: space-between;`;

        let itemsHtml = '';
        batch.items.forEach(item => {
            itemsHtml += `
                <div style="border-bottom: 1px dashed rgba(0,0,0,0.15); padding: 0.4rem 0;">
                    <strong>• ${item.name}</strong>
                    ${item.observation ? `<div style="font-size:0.8rem; color:#2563eb;">Nota: ${item.observation}</div>` : ''}
                </div>
            `;
        });

        card.innerHTML = `
            <div>
                <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid ${borderColor}; padding-bottom: 0.5rem; margin-bottom: 0.5rem;">
                    <h3 style="margin: 0; font-size: 1.1rem;">${batch.tableName} <span style="font-size:0.75rem; color:var(--text-secondary);">(Lote #${new Date(batch.batchId).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })})</span></h3>
                    <span style="font-size: 0.85rem; background: #fff; color: ${textColor}; padding: 0.2rem 0.5rem; border-radius: 6px; font-weight: bold;">⏱️ ${timeFormatted}</span>
                </div>
                <div>${itemsHtml}</div>
            </div>
            <button class="btn btn-secondary" style="margin-top: 1rem; padding: 0.4rem; background: ${borderColor}; color: white;" onclick="markBatchServed(${batch.tableId}, ${batch.batchId})">✅ Marcar Lote Servido</button>
        `;
        container.appendChild(card);
    });
}



/**
 * ==========================================================
 * MARCAR LOTE COMO SERVIDO
 * Actualiza el estado de los platos preparados directamente
 * en Firebase Firestore.
 * ==========================================================
 */
async function markBatchServed(tableId, batchId) {

    // Buscar la mesa correspondiente al lote seleccionado.
    const table = tables.find(
        t => Number(t.id) === Number(tableId)
    );

    // Detener la operación si la mesa no existe.
    if (!table) return;

    // Comprobar que exista conexión a internet.
    if (!navigator.onLine) {
        showCustomAlert(
            'No hay conexión a internet. No se puede atender la comanda.'
        );
        return;
    }

    // Crear la ventana personalizada de confirmación.
    let modal = document.getElementById('serveBatchModal');

    if (!modal) {

        // Crear el contenedor del popup.
        modal = document.createElement('div');
        modal.id = 'serveBatchModal';

        modal.style.cssText = `
            position:fixed;
            inset:0;
            background:rgba(0,0,0,0.6);
            display:flex;
            align-items:center;
            justify-content:center;
            z-index:10002;
            padding:1rem;
        `;

        // Construir el contenido y los botones del popup.
        modal.innerHTML = `
            <div style="
                background:#fff;
                color:#1e293b;
                padding:1.5rem;
                border-radius:12px;
                width:100%;
                max-width:320px;
                text-align:center;
                box-shadow:0 10px 30px rgba(0,0,0,0.2);
            ">
                <h3 style="margin-top:0;">Atender comanda</h3>

                <p id="serveBatchMessage"
                   style="font-size:0.9rem;">
                </p>

                <div style="
                    display:flex;
                    gap:0.6rem;
                    margin-top:1.2rem;
                ">
                    <button id="serveBatchCancel"
                        class="btn"
                        style="
                            flex:1;
                            background:#e2e8f0;
                            color:#1e293b;
                        ">
                        Cancelar
                    </button>

                    <button id="serveBatchConfirm"
                        class="btn btn-success"
                        style="flex:1;">
                        Sí, atender
                    </button>
                </div>
            </div>
        `;

        // Incorporar el popup al documento.
        document.body.appendChild(modal);
    }

    // Mostrar el nombre de la mesa en el mensaje.
    document.getElementById('serveBatchMessage').textContent =
        `¿Marcar este lote de la ${table.name} como servido?`;

    // Obtener las referencias de los botones.
    const confirmButton =
        document.getElementById('serveBatchConfirm');

    const cancelButton =
        document.getElementById('serveBatchCancel');

    // Mostrar la ventana de confirmación.
    modal.style.display = 'flex';

    // Configurar la cancelación de la operación.
    cancelButton.onclick = () => {
        modal.style.display = 'none';
    };

    // Configurar la confirmación y actualización del lote.
    confirmButton.onclick = async () => {

        // Evitar múltiples envíos mientras se procesa la operación.
        confirmButton.disabled = true;
        confirmButton.textContent = 'Procesando...';

        try {

            // Crear una copia de los platos con el estado actualizado.
            const updatedItems = table.items.map(item => {

                // Identificar únicamente los platos del lote seleccionado.
                if (
                    item.sentToKitchen &&
                    item.sentAt === batchId
                ) {

                    // Marcar el plato como servido.
                    return {
                        ...item,
                        served: true,
                        pickedUp: false
                    };
                }

                // Conservar sin cambios los demás platos.
                return item;
            });

            // Obtener el identificador del documento de Firestore.
            const documentId = table._docId || `mesa_${table.id}`;

            // Guardar los estados actualizados directamente en Firebase.
            await window.RestoposDB.update(
                'mesas',
                documentId,
                {
                    items: updatedItems
                }
            );

            // Actualizar los datos locales después del guardado exitoso.
            table.items = updatedItems;

            // Actualizar la fecha de modificación local.
            appConfig.lastUpdated = Date.now();

            // Guardar los cambios en el almacenamiento local.
            saveData();

            // Actualizar visualmente las comandas de cocina.
            renderKitchenOrders();

            // Cerrar la ventana de confirmación.
            modal.style.display = 'none';

            // Informar que la comanda fue atendida correctamente.
            showCustomAlert(
                'Comanda atendida correctamente.'
            );

        } catch (error) {

            // Registrar los detalles del error.
            console.error(
                'RESTOPOS: Error atendiendo comanda en Firebase:',
                error.code,
                error.message
            );

            // Cerrar el popup después del error.
            modal.style.display = 'none';

            // Informar que no se pudo actualizar el lote.
            showCustomAlert(
                'No se pudo actualizar la comanda en Firebase. Verifique la conexión.'
            );

        } finally {

            // Restaurar el botón para futuras operaciones.
            confirmButton.disabled = false;
            confirmButton.textContent = 'Sí, atender';
        }
    };
}




/* ========================================================== */
/* 7. CUENTAS Y FACTURACIÓN                                   */
/* ========================================================== */



function openBillSection() {
    const table = tables.find(t => t.id === currentTableId);

    if (!table || table.items.length === 0) {
        showCustomAlert('Esta mesa no tiene pedidos activos.');
        return;
    }

    if (!table.receipts) table.receipts = [];

    document.getElementById('bill-title').innerText =
        `Cuenta - ${table.name}`;

    const list = document.getElementById('billItemsList');
    if (!list) return;

    list.innerHTML = '';

    table.items.forEach((item, index) => {
        const isBilled = item.billed === true;

        const div = document.createElement('div');
        div.className = 'order-item';

        if (isBilled) {
            div.style.opacity = '0.55';
            div.style.background = '#e2e8f0';
        }

        div.innerHTML = `
            <label class="checkbox-label" style="flex: 1; min-width: 0;">
                <input
                    type="checkbox"
                    class="bill-item-chk"
                    value="${index}"
                    data-price="${item.finalPrice}"
                    onchange="calculatePartialTotal()"
                    ${isBilled ? 'disabled' : ''}
                >

                <span style="display:flex; align-items:center; flex-wrap:wrap; gap:6px;">
                    <strong>${item.name}</strong>

                    ${isBilled
                ? '<span style="color:#dc2626; font-size:0.72rem; font-weight:bold; white-space:nowrap;">✓ FACTURADO</span>'
                : ''}
                </span>
            </label>

            <strong style="white-space:nowrap;">
                $${Number(item.finalPrice).toLocaleString('es-CO')}
            </strong>
        `;

        list.appendChild(div);
    });

    calculatePartialTotal();
    renderReceiptsManager();

    document.getElementById('order-section').classList.add('hidden');
    document.getElementById('bill-section').classList.remove('hidden');
}



function calculatePartialTotal() {
    let partialTotal = 0;
    document.querySelectorAll('.bill-item-chk:checked').forEach(chk => {
        partialTotal += parseFloat(chk.getAttribute('data-price')) || 0;
    });
    const selectedTotalEl = document.getElementById('selectedPartialTotal');
    if (selectedTotalEl) selectedTotalEl.innerText = `$ ${Math.round(partialTotal).toLocaleString()}`;
}



/**
 * ==========================================================
 * GENERAR RECIBO
 * Marca los productos seleccionados como facturados
 * y registra el recibo directamente en Firebase Firestore.
 * ==========================================================
 */
async function generateReceipt() {

    // Buscar la mesa que se está facturando.
    const table = tables.find(
        t => Number(t.id) === Number(currentTableId)
    );

    // Verificar que la mesa exista.
    if (!table) {
        showCustomAlert('No se encontró la mesa.');
        return;
    }

    // Comprobar que los arreglos de la mesa sean válidos.
    if (!Array.isArray(table.items)) {
        showCustomAlert('No se encontraron productos en esta mesa.');
        return;
    }

    // Comprobar que exista conexión a internet.
    if (!navigator.onLine) {
        showCustomAlert(
            'No hay conexión a internet. No se puede generar el recibo.'
        );
        return;
    }

    // Obtener los productos seleccionados para facturar.
    const selectedCheckboxes = Array.from(
        document.querySelectorAll('.bill-item-chk:checked')
    );

    // Exigir que se seleccione al menos un producto.
    if (selectedCheckboxes.length === 0) {
        showCustomAlert('Seleccione al menos un ítem.');
        return;
    }

    // Obtener los índices de los productos seleccionados.
    const selectedIndexes = selectedCheckboxes.map(chk =>
        parseInt(chk.value, 10)
    );

    // Validar que los productos existan y no estén facturados.
    const validIndexes = selectedIndexes.filter(index =>
        Number.isInteger(index) &&
        table.items[index] &&
        table.items[index].billed !== true
    );

    // Impedir facturar productos que ya fueron facturados.
    if (validIndexes.length !== selectedIndexes.length) {
        showCustomAlert(
            'Uno o más productos ya fueron facturados. Actualice la cuenta.'
        );

        openBillSection();
        return;
    }

    // Obtener el botón para evitar operaciones simultáneas.
    const generateButton = document.querySelector(
        '#bill-section button[onclick="generateReceipt()"]'
    );

    // Deshabilitar el botón mientras se procesa el recibo.
    if (generateButton) {
        if (generateButton.disabled) return;

        generateButton.disabled = true;
        generateButton.textContent = 'Procesando recibo...';
    }

    try {

        // Crear un identificador único para el recibo.
        const receiptId = Date.now();

        // Inicializar el total y las listas del recibo.
        let partialTotal = 0;
        const receiptItems = [];
        const receiptItemUids = [];

        // Crear una copia de los productos y marcarlos como facturados.
        const updatedItems = table.items.map((item, index) => {

            // Mantener sin cambios los productos no seleccionados.
            if (!validIndexes.includes(index)) {
                return item;
            }

            // Calcular el valor del producto seleccionado.
            partialTotal += Number(item.finalPrice) || 0;

            // Registrar el UID del producto en el recibo.
            receiptItemUids.push(item.uid);

            // Crear la copia facturada del producto.
            const billedItem = {
                ...item,
                billed: true
            };

            // Agregar el producto al contenido del recibo.
            receiptItems.push({ ...billedItem });

            return billedItem;
        });

        // Construir el recibo conservando su estructura actual.
        const newReceipt = {
            id: receiptId,
            items: receiptItems,
            itemUids: receiptItemUids,
            total: Math.round(partialTotal),
            date: new Date().toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit'
            })
        };

        // Preparar la lista actual de recibos de la mesa.
        const currentReceipts = Array.isArray(table.receipts)
            ? table.receipts
            : [];

        // Agregar el nuevo recibo sin modificar todavía los datos locales.
        const updatedReceipts = [
            ...currentReceipts,
            newReceipt
        ];

        // Obtener el identificador real del documento de Firestore.
        const documentId = table._docId || `mesa_${table.id}`;

        // Guardar los productos facturados y el recibo en una sola actualización.
        await window.RestoposDB.update(
            'mesas',
            documentId,
            {
                items: updatedItems,
                receipts: updatedReceipts
            }
        );

        // Actualizar los datos locales después de confirmar el guardado.
        table.items = updatedItems;
        table.receipts = updatedReceipts;

        // Actualizar la fecha de modificación local.
        appConfig.lastUpdated = Date.now();

        // Guardar el estado actualizado en el almacenamiento local.
        saveData();

        // Informar que el recibo fue generado correctamente.
        showCustomAlert('Recibo generado correctamente.');

        // Actualizar la pantalla de facturación.
        openBillSection();

    } catch (error) {

        // Registrar el error para facilitar su diagnóstico.
        console.error(
            'RESTOPOS: Error generando recibo en Firebase:',
            error.code,
            error.message
        );

        // Informar que no se pudo confirmar el recibo.
        showCustomAlert(
            'No se pudo confirmar el recibo en Firebase. ' +
            'Verifique su conexión e inténtelo nuevamente.'
        );

        // Actualizar la pantalla de facturación.
        openBillSection();

    } finally {

        // Habilitar nuevamente el botón de generación.
        if (generateButton) {
            generateButton.disabled = false;
            generateButton.textContent =
                '📄 Generar Recibo (Bloquear Ítems)';
        }
    }
}




function renderReceiptsManager() {
    const table = tables.find(t => t.id === currentTableId);
    if (!table) return;

    let container = document.getElementById('receiptsManagerContainer');

    if (!container) {
        container = document.createElement('div');
        container.id = 'receiptsManagerContainer';
        container.style.cssText =
            "margin-top:1rem;border-top:2px dashed var(--border);padding-top:0.75rem;";

        const billItemsList = document.getElementById('billItemsList');

        if (billItemsList) {
            billItemsList.insertAdjacentElement('afterend', container);
        }
    }

    if (!table.receipts || table.receipts.length === 0) {
        container.innerHTML =
            '<p style="font-size:0.85rem;color:var(--text-secondary);text-align:center;">No hay recibos.</p>';
        return;
    }

    let html = '<h4>Recibos Generados:</h4>';

    table.receipts.forEach((rc, rIdx) => {
        html += `
            <div style="
                background:#f1f5f9;
                padding:0.6rem;
                border-radius:6px;
                margin-bottom:0.5rem;
                display:flex;
                flex-wrap:wrap;
                justify-content:space-between;
                align-items:center;
                gap:0.5rem;
                font-size:0.85rem;
            ">
                <div>
                    <strong>Recibo #${rIdx + 1}</strong>
                    - $${Number(rc.total || 0).toLocaleString('es-CO')}
                </div>

                <div style="display:flex;flex-wrap:wrap;gap:0.3rem;">
                    <button
                        class="btn"
                        style="padding:0.25rem 0.45rem;font-size:0.75rem;width:auto;"
                        onclick="printReceipt(${Number(rc.id)})">
                        🖨️ Imprimir
                    </button>

                    <button
                        class="btn btn-success"
                        style="padding:0.25rem 0.45rem;font-size:0.75rem;width:auto;"
                        onclick="confirmPayReceipt(${Number(rc.id)})">
                        Pagar
                    </button>

                    <button
                        class="btn btn-danger"
                        style="padding:0.25rem 0.45rem;font-size:0.75rem;width:auto;"
                        onclick="cancelReceipt(${Number(rc.id)})">
                        Anular
                    </button>
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
}

/*Funcion de impresion
La impresión muestra un producto por renglón, su precio y el total. 
No utiliza observation ni modifications.
*/


function printReceipt(receiptId) {
    const table = tables.find(t => t.id === currentTableId);

    if (!table || !table.receipts) {
        showCustomAlert('No se encontró la cuenta.');
        return;
    }

    const receipt = table.receipts.find(
        r => Number(r.id) === Number(receiptId)
    );

    if (!receipt) {
        showCustomAlert('No se encontró el recibo.');
        return;
    }

    const printWindow = window.open('', '_blank');

    if (!printWindow) {
        showCustomAlert(
            'El navegador bloqueó la impresión. Permite las ventanas emergentes para esta aplicación.'
        );
        return;
    }

    const formatMoney = value =>
        '$ ' + Number(value || 0).toLocaleString('es-CO');

    const escapeHTML = value =>
        String(value ?? '').replace(/[&<>"']/g, char => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        }[char]));

    const productsHTML = (receipt.items || []).map(item => `
        <tr>
            <td>${escapeHTML(item.name)}</td>
            <td class="price">${formatMoney(item.finalPrice)}</td>
        </tr>
    `).join('');

    const receiptDate = receipt.date || new Date().toLocaleString('es-CO');

    printWindow.document.write(`
        <!DOCTYPE html>
        <html lang="es">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <title>Recibo ${receipt.id}</title>

            <style>
                * {
                    box-sizing: border-box;
                }

                body {
                    font-family: Arial, sans-serif;
                    color: #111;
                    width: 100%;
                    max-width: 380px;
                    margin: 0 auto;
                    padding: 18px;
                }

                .header {
                    text-align: center;
                    border-bottom: 1px dashed #333;
                    padding-bottom: 12px;
                    margin-bottom: 12px;
                }

                h2 {
                    margin: 0 0 5px;
                }

                p {
                    margin: 5px 0;
                    font-size: 13px;
                }

                table {
                    width: 100%;
                    border-collapse: collapse;
                    margin-top: 15px;
                }

                td {
                    padding: 9px 2px;
                    border-bottom: 1px dashed #ccc;
                    font-size: 13px;
                }

                .price {
                    text-align: right;
                    white-space: nowrap;
                }

                .total {
                    display: flex;
                    justify-content: space-between;
                    font-size: 18px;
                    font-weight: bold;
                    border-top: 2px solid #111;
                    padding-top: 12px;
                    margin-top: 12px;
                }

                .footer {
                    text-align: center;
                    margin-top: 25px;
                    font-size: 12px;
                }

                @media print {
                    body {
                        max-width: 100%;
                        padding: 5px;
                    }
                }
            </style>
        </head>

        <body>
            <div class="header">
                <h2>RICO SAZÓN</h2>
                <p>Recibo de pago</p>
                <p><strong>${escapeHTML(table.name)}</strong></p>
                <p>Recibo #${escapeHTML(receipt.id)}</p>
                <p>${escapeHTML(receiptDate)}</p>
            </div>

            <table>
                <tbody>
                    ${productsHTML}
                </tbody>
            </table>

            <div class="total">
                <span>TOTAL</span>
                <span>${formatMoney(receipt.total)}</span>
            </div>

            <div class="footer">
                <p>¡Gracias por su compra!</p>
            </div>

            <script>
                window.onload = function() {
                    window.focus();
                    window.print();
                };
            <\/script>
        </body>
        </html>
    `);

    printWindow.document.close();
}

/**
 * ==========================================================
 * CONFIRMAR PAGO DE RECIBO
 * Registra las ventas en Firebase Firestore y actualiza
 * la mesa mediante una transacción atómica.
 * ==========================================================
 */
async function confirmPayReceipt(receiptId) {

    // Buscar la mesa seleccionada.
    const table = tables.find(
        t => String(t.id) === String(currentTableId)
    );

    if (!table || !Array.isArray(table.receipts)) return;

    // Buscar el recibo que se desea cobrar.
    const receipt = table.receipts.find(
        r => Number(r.id) === Number(receiptId)
    );

    if (!receipt) return;

    const total = Math.round(Number(receipt.total) || 0);

    // Crear ventana de cobro.
    let modal = document.getElementById('payReceiptModal');

    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'payReceiptModal';

        modal.style.cssText = `
            position:fixed;
            inset:0;
            background:rgba(0,0,0,0.6);
            display:flex;
            align-items:center;
            justify-content:center;
            z-index:10002;
            padding:1rem;
        `;

        modal.innerHTML = `
            <div style="
                background:#fff;
                color:#1e293b;
                padding:1.5rem;
                border-radius:12px;
                width:100%;
                max-width:350px;
                text-align:center;
                box-shadow:0 10px 30px rgba(0,0,0,0.2);
            ">

                <h3 style="margin-top:0;">Cobrar recibo</h3>

                <p style="font-size:0.9rem;color:#64748b;">
                    Total de la factura
                </p>

                <h2 id="payReceiptTotal"
                    style="margin:5px 0 20px;color:#0f172a;">
                </h2>

                <label style="
                    display:block;
                    text-align:left;
                    font-weight:bold;
                    margin-bottom:7px;
                ">
                    Dinero recibido
                </label>

                <input
                    id="payReceiptAmount"
                    type="number"
                    inputmode="numeric"
                    min="0"
                    step="1"
                    placeholder="Ingrese el monto"
                    style="
                        width:100%;
                        padding:13px;
                        border:1px solid #cbd5e1;
                        border-radius:8px;
                        font-size:1.2rem;
                        box-sizing:border-box;
                        color:#1e293b;
                        background:#fff;
                    "
                >

                <div style="
                    background:#f1f5f9;
                    border-radius:8px;
                    padding:12px;
                    margin-top:15px;
                ">
                    <p style="margin:0;color:#64748b;font-size:0.85rem;">
                        CAMBIO PARA EL CLIENTE
                    </p>

                    <h2 id="payReceiptChange"
                        style="margin:7px 0;color:#16a34a;">
                        $0
                    </h2>
                </div>

                <p id="payReceiptError"
                    style="
                        color:#dc2626;
                        font-size:0.85rem;
                        min-height:18px;
                    ">
                </p>

                <div style="
                    display:flex;
                    gap:8px;
                    margin-top:15px;
                ">
                    <button id="payReceiptCancel"
                        class="btn"
                        style="
                            flex:1;
                            background:#e2e8f0;
                            color:#1e293b;
                        ">
                        Cancelar
                    </button>

                    <button id="payReceiptConfirm"
                        class="btn btn-success"
                        style="flex:1;">
                        Confirmar pago
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
    }

    const amountInput = document.getElementById('payReceiptAmount');
    const changeDisplay = document.getElementById('payReceiptChange');
    const errorDisplay = document.getElementById('payReceiptError');
    const confirmButton = document.getElementById('payReceiptConfirm');

    const formatMoney = value =>
        '$ ' + Number(value || 0).toLocaleString('es-CO');

    document.getElementById('payReceiptTotal').textContent =
        formatMoney(total);

    amountInput.value = '';
    changeDisplay.textContent = formatMoney(0);
    errorDisplay.textContent = '';
    confirmButton.disabled = false;
    confirmButton.textContent = 'Confirmar pago';

    modal.style.display = 'flex';

    // Calcular el cambio automáticamente.
    amountInput.oninput = () => {

        const received = Math.floor(Number(amountInput.value) || 0);
        const change = Math.max(0, received - total);

        changeDisplay.textContent = formatMoney(change);

        if (received < total) {
            errorDisplay.textContent =
                'El dinero recibido no alcanza para cubrir la factura.';
        } else {
            errorDisplay.textContent = '';
        }
    };

    // Cancelar el cobro.
    document.getElementById('payReceiptCancel').onclick = () => {
        modal.style.display = 'none';
    };

    // Confirmar y registrar el pago.
    confirmButton.onclick = async () => {

        const received = Math.floor(Number(amountInput.value) || 0);

        // Validar el dinero recibido.
        if (!Number.isSafeInteger(received) || received < total) {
            errorDisplay.textContent =
                'Ingrese un monto igual o superior al total.';
            amountInput.focus();
            return;
        }

        if (total <= 0) {
            errorDisplay.textContent =
                'El total del recibo no es válido.';
            return;
        }

        // Verificar conexión a internet.
        if (!navigator.onLine) {
            errorDisplay.textContent =
                'No hay conexión a internet.';
            return;
        }

        // Evitar múltiples confirmaciones.
        if (confirmButton.disabled) return;

        confirmButton.disabled = true;
        confirmButton.textContent = 'Procesando...';

        try {

            // Identificar el documento de la mesa en Firestore.
            const documentId =
                table._docId || `mesa_${table.id}`;

            const tableRef = window.db
                .collection('mesas')
                .doc(documentId);

            // Preparar identificadores únicos y estables del pago.
            const paymentId =
                `pago_${table.id}_${receipt.id}`;

            const nowFull = new Date();

            // Generar número de factura.
            const facNumero =
                `FAC-${nowFull.getFullYear()}` +
                `${String(nowFull.getMonth() + 1).padStart(2, '0')}` +
                `${String(nowFull.getDate()).padStart(2, '0')}` +
                `${String(nowFull.getHours()).padStart(2, '0')}` +
                `${String(nowFull.getMinutes()).padStart(2, '0')}` +
                `${String(nowFull.getSeconds()).padStart(2, '0')}`;

            const fecha = nowFull.toLocaleDateString();
            const hora = nowFull.toLocaleTimeString();

            const usuario =
                localStorage.getItem('restopos_current_user') || 'admin';

            const cambio = received - total;

            // Ejecutar el registro del pago y la actualización
            // de la mesa dentro de una sola transacción.
            const result = await window.RestoposDB.runTransaction(
                async (transaction) => {

                    // Leer la versión actual de la mesa en Firebase.
                    const tableSnapshot = await transaction.get(tableRef);

                    if (!tableSnapshot.exists) {
                        throw new Error(
                            'La mesa no existe en Firebase.'
                        );
                    }

                    const cloudTable = tableSnapshot.data();

                    const cloudItems = Array.isArray(cloudTable.items)
                        ? cloudTable.items
                        : [];

                    const cloudReceipts = Array.isArray(cloudTable.receipts)
                        ? cloudTable.receipts
                        : [];

                    // Comprobar que el recibo todavía esté pendiente.
                    const receiptIndex = cloudReceipts.findIndex(
                        r => Number(r.id) === Number(receiptId)
                    );

                    if (receiptIndex === -1) {
                        throw new Error(
                            'El recibo ya fue cobrado o anulado.'
                        );
                    }

                    const currentReceipt = cloudReceipts[receiptIndex];

                    const receiptItems = Array.isArray(currentReceipt.items)
                        ? currentReceipt.items
                        : [];

                    if (receiptItems.length === 0) {
                        throw new Error(
                            'El recibo no contiene productos.'
                        );
                    }

                    // Obtener los UID de los productos cobrados.
                    const itemUids = currentReceipt.itemUids?.length
                        ? currentReceipt.itemUids
                        : receiptItems
                            .map(item => item.uid)
                            .filter(Boolean);

                    if (itemUids.length === 0) {
                        throw new Error(
                            'No se encontraron los identificadores de los productos.'
                        );
                    }

                    // Preparar los documentos de venta.
                    const newSalesBatch = receiptItems.map(
                        (item, index) => {

                            const saleId =
                                `${paymentId}_${index + 1}`;

                            return {
                                id: saleId,
                                facnumero: facNumero,
                                mesa: cloudTable.name || table.name,
                                plato: item.name || 'Producto',
                                detallesmodificaciones:
                                    item.observation || 'Ninguna',
                                valorpagado:
                                    Math.round(Number(item.finalPrice) || 0),
                                fecha,
                                hora,
                                usuario,

                                // Datos adicionales para relacionar
                                // cada producto con su pago.
                                receiptId: String(currentReceipt.id),
                                tableId: Number(cloudTable.id),
                                paymentId,
                                createdAt: nowFull.getTime(),
                                totalFactura: total,
                                dineroRecibido: received,
                                cambio
                            };
                        }
                    );

                    // Preparar los documentos de Firestore.
                    // Los identificadores deterministas evitan
                    // duplicar ventas si se reintenta la operación.
                    const salesRefs = newSalesBatch.map(
                        sale => window.db
                            .collection('ventas')
                            .doc(sale.id)
                    );

                    // Preparar la mesa sin el recibo cobrado.
                    const updatedReceipts = cloudReceipts.filter(
                        r => Number(r.id) !== Number(receiptId)
                    );

                    // Retirar únicamente los productos cobrados.
                    const updatedItems = cloudItems.filter(
                        item => !itemUids.includes(item.uid)
                    );

                    // Liberar la mesa solo si ya no tiene productos
                    // ni recibos pendientes.
                    const updatedStatus =
                        updatedItems.length === 0 &&
                            updatedReceipts.length === 0
                            ? 'libre'
                            : 'ocupada';

                    // Registrar cada producto vendido.
                    salesRefs.forEach((saleRef, index) => {
                        transaction.set(
                            saleRef,
                            newSalesBatch[index]
                        );
                    });

                    // Actualizar la mesa en la misma transacción.
                    transaction.update(tableRef, {
                        items: updatedItems,
                        receipts: updatedReceipts,
                        status: updatedStatus
                    });

                    return {
                        newSalesBatch,
                        updatedItems,
                        updatedReceipts,
                        updatedStatus
                    };
                }
            );

            // Actualizar el estado local después del éxito
            // confirmado por Firestore.
            table.items = result.updatedItems;
            table.receipts = result.updatedReceipts;
            table.status = result.updatedStatus;

            salesHistory.push(...result.newSalesBatch);

            appConfig.lastUpdated = Date.now();

            saveData();

            // Cerrar la ventana de cobro.
            modal.style.display = 'none';

            // Informar el resultado.
            if (
                table.items.length === 0 &&
                table.receipts.length === 0
            ) {

                showCustomAlert(
                    `¡Pago registrado correctamente! Cambio: ${formatMoney(cambio)}`,
                    () => showSection('tables-section')
                );

            } else {

                showCustomAlert(
                    `¡Pago registrado correctamente! Cambio: ${formatMoney(cambio)}`
                );

                openBillSection();
            }

        } catch (error) {

            console.error(
                'RESTOPOS: Error registrando pago en Firebase:',
                error.code,
                error.message
            );

            modal.style.display = 'none';

            showCustomAlert(
                'No se pudo registrar el pago en Firebase. ' +
                'La transacción no se completó y la mesa conserva sus datos. ' +
                'Verifique la conexión y los permisos antes de reintentar.'
            );

        } finally {

            // Restaurar el botón para futuros cobros.
            confirmButton.disabled = false;
            confirmButton.textContent = 'Confirmar pago';
        }
    };

    amountInput.focus();
}

/**
 * ==========================================================
 * ANULAR RECIBO
 * Elimina el recibo de Firestore y devuelve los productos
 * asociados al estado disponible para facturación.
 * ==========================================================
 */
async function cancelReceipt(receiptId) {

    // Buscar la mesa que tiene abierta el usuario.
    const table = tables.find(
        t => Number(t.id) === Number(currentTableId)
    );

    // Verificar que la mesa y sus recibos existan.
    if (!table || !Array.isArray(table.receipts)) return;

    // Comprobar que exista conexión a internet.
    if (!navigator.onLine) {
        showCustomAlert(
            'No hay conexión a internet. No se puede anular el recibo.'
        );
        return;
    }

    // Buscar el recibo que se desea anular.
    const receiptIndex = table.receipts.findIndex(
        receipt => Number(receipt.id) === Number(receiptId)
    );

    // Detener la operación si el recibo no existe.
    if (receiptIndex === -1) {
        showCustomAlert('No se encontró el recibo.');
        return;
    }

    // Crear la ventana personalizada de confirmación.
    let modal = document.getElementById('cancelReceiptModal');

    if (!modal) {

        // Crear el contenedor del popup.
        modal = document.createElement('div');
        modal.id = 'cancelReceiptModal';

        modal.style.cssText = `
            position:fixed;
            inset:0;
            background:rgba(0,0,0,0.6);
            display:flex;
            align-items:center;
            justify-content:center;
            z-index:10002;
            padding:1rem;
        `;

        // Construir el contenido y los botones.
        modal.innerHTML = `
            <div style="
                background:#fff;
                color:#1e293b;
                padding:1.5rem;
                border-radius:12px;
                width:100%;
                max-width:320px;
                text-align:center;
            ">
                <h3 style="margin-top:0;">Anular recibo</h3>

                <p style="font-size:0.9rem;">
                    ¿Desea anular este recibo?
                    Los productos volverán a estar disponibles
                    para facturar.
                </p>

                <div style="
                    display:flex;
                    gap:0.6rem;
                    margin-top:1.2rem;
                ">
                    <button id="cancelReceiptNo"
                        class="btn"
                        style="
                            flex:1;
                            background:#e2e8f0;
                            color:#1e293b;
                        ">
                        Cancelar
                    </button>

                    <button id="cancelReceiptYes"
                        class="btn btn-danger"
                        style="flex:1;">
                        Sí, anular
                    </button>
                </div>
            </div>
        `;

        // Incorporar el popup al documento.
        document.body.appendChild(modal);
    }

    // Obtener las referencias de los botones.
    const cancelButton = document.getElementById('cancelReceiptNo');
    const confirmButton = document.getElementById('cancelReceiptYes');

    // Mostrar el popup.
    modal.style.display = 'flex';

    // Configurar la cancelación de la operación.
    cancelButton.onclick = () => {
        modal.style.display = 'none';
    };

    // Configurar la confirmación de anulación.
    confirmButton.onclick = async () => {

        // Evitar múltiples operaciones simultáneas.
        if (confirmButton.disabled) return;

        confirmButton.disabled = true;
        confirmButton.textContent = 'Procesando...';

        try {

            // Obtener nuevamente el recibo seleccionado.
            const currentReceiptIndex = table.receipts.findIndex(
                receipt => Number(receipt.id) === Number(receiptId)
            );

            // Verificar que el recibo siga existiendo.
            if (currentReceiptIndex === -1) {
                throw new Error('El recibo ya no está disponible.');
            }

            const receipt = table.receipts[currentReceiptIndex];

            // Obtener los UID de los productos asociados al recibo.
            const itemUids = receipt.itemUids?.length
                ? receipt.itemUids
                : (receipt.items || [])
                    .map(item => item.uid)
                    .filter(Boolean);

            // Preparar los productos con su estado de facturación restaurado.
            const updatedItems = table.items.map(item => {

                // Restaurar únicamente los productos de este recibo.
                if (itemUids.includes(item.uid)) {
                    return {
                        ...item,
                        billed: false
                    };
                }

                // Conservar los demás productos sin cambios.
                return item;
            });

            // Preparar la lista de recibos sin el recibo anulado.
            const updatedReceipts = table.receipts.filter(
                (currentReceipt, index) =>
                    index !== currentReceiptIndex
            );

            // Obtener el identificador real del documento de Firestore.
            const documentId = table._docId || `mesa_${table.id}`;

            // Guardar la anulación y restaurar los productos en una sola operación.
            await window.RestoposDB.update(
                'mesas',
                documentId,
                {
                    items: updatedItems,
                    receipts: updatedReceipts
                }
            );

            // Actualizar los datos locales después de confirmar el guardado.
            table.items = updatedItems;
            table.receipts = updatedReceipts;

            // Actualizar la fecha de modificación local.
            appConfig.lastUpdated = Date.now();

            // Guardar los cambios en el almacenamiento local.
            saveData();

            // Cerrar el popup de confirmación.
            modal.style.display = 'none';

            // Informar que el recibo fue anulado correctamente.
            showCustomAlert(
                'Recibo anulado correctamente. Los productos están disponibles nuevamente.'
            );

            // Actualizar la pantalla de facturación.
            openBillSection();

        } catch (error) {

            // Registrar el error para facilitar su diagnóstico.
            console.error(
                'RESTOPOS: Error anulando recibo en Firebase:',
                error.code,
                error.message
            );

            // Cerrar el popup.
            modal.style.display = 'none';

            // Informar que no se pudo completar la operación.
            showCustomAlert(
                'No se pudo anular el recibo. Verifique la conexión e inténtelo nuevamente.'
            );

        } finally {

            // Restaurar el botón para futuras operaciones.
            confirmButton.disabled = false;
            confirmButton.textContent = 'Sí, anular';
        }
    };
}




function backToOrderSection() {
    document.getElementById('bill-section').classList.add('hidden');
    document.getElementById('order-section').classList.remove('hidden');
}


/* ========================================================== */
/* 9. CATÁLOGOS (PLATOS, BEBIDAS, ADICIONALES)               */
/* ========================================================== */

function renderRecipeCheckboxes() {
    const container = document.getElementById('recipeComponentsSelector');
    if (!container) return;
    container.innerHTML = '';
    addons.forEach(ad => {
        const div = document.createElement('div');
        div.innerHTML = `<span>${ad.name}</span> <input type="checkbox" class="recipe-comp-chk" value="${ad.id}">`;
        container.appendChild(div);
    });
}

function formatProductPriceInput(input) {
    const rawValue = input.value.replace(/\D/g, '');
    if (!rawValue) {
        input.value = '';
        return;
    }
    const numericValue = parseInt(rawValue, 10);
    input.value = `$ ${numericValue.toLocaleString('es-CO')}`;
}

function getCleanPriceValue(formattedString) {
    if (!formattedString) return 0;
    const cleanStr = String(formattedString).replace(/\D/g, '');
    return parseInt(cleanStr, 10) || 0;
}

function renderProducts() {
    const list = document.getElementById('productList');
    if (!list) return;
    list.innerHTML = '';

    if (!Array.isArray(products) || products.length === 0) {
        list.innerHTML = '<p style="font-size: 0.85rem; color: var(--text-secondary); text-align: center; padding: 1rem;">No hay platos registrados.</p>';
        return;
    }

    const categoryLabels = {
        principales: 'Plato Principal',
        sopas: 'Sopas y Entradas',
        bebidas: 'Bebida',
        adicionales: 'Adicional'
    };

    products.forEach(p => {
        const item = document.createElement('div');
        item.style.cssText = "display: flex; justify-content: space-between; align-items: center; padding: 0.6rem 0.4rem; border-bottom: 1px solid var(--border); font-size: 0.85rem;";

        const catName = categoryLabels[p.category] || 'Plato Principal';
        const activeBadge = p.active !== false
            ? `<span style="font-size: 0.65rem; background: #dcfce7; color: #15803d; padding: 0.1rem 0.35rem; border-radius: 4px; font-weight: bold; margin-left: 6px;">Activo</span>`
            : `<span style="font-size: 0.65rem; background: #f1f5f9; color: #64748b; padding: 0.1rem 0.35rem; border-radius: 4px; font-weight: bold; margin-left: 6px;">Inactivo</span>`;

        item.innerHTML = `
            <div style="flex: 1; padding-right: 0.5rem; overflow: hidden;">
                <div style="display: flex; align-items: center; flex-wrap: wrap;">
                    <strong style="color: var(--text); font-size: 0.9rem;">${p.name}</strong>
                    ${activeBadge}
                </div>
                <div style="display: flex; gap: 0.5rem; align-items: center; margin-top: 2px;">
                    <span style="font-size: 0.8rem; color: var(--primary); font-weight: bold;">$${(p.price || 0).toLocaleString('es-CO')}</span>
                    <span style="font-size: 0.7rem; color: var(--text-secondary);">• ${catName}</span>
                </div>
            </div>
            <div style="display: flex; gap: 0.4rem; align-items: center;">
                <button onclick="editProduct(${p.id})" class="action-btn" title="Editar" style="background:none; border:none; cursor:pointer; font-size:1.1rem;">✏️</button>
                <button onclick="deleteProduct(${p.id})" class="action-btn" title="Eliminar" style="background:none; border:none; cursor:pointer; font-size:1.1rem; color:#ef4444;">🗑️</button>
            </div>
        `;
        list.appendChild(item);
    });

    const activeToggle = document.getElementById('newProdActive');
    const statusLabel = document.getElementById('prodActiveStatusLabel');
    if (activeToggle && statusLabel) {
        activeToggle.onchange = function() {
            statusLabel.innerText = this.checked ? 'Activo' : 'Inactivo';
            statusLabel.style.color = this.checked ? '#16a34a' : '#64748b';
        };
    }
}


async function saveProduct() {
    const nameInput = document.getElementById('newProdName');
    const priceInput = document.getElementById('newProdPrice');
    const categorySelect = document.getElementById('newProdCategory');
    const activeToggle = document.getElementById('newProdActive');

    const name = nameInput.value.trim();
    const price = getCleanPriceValue(priceInput.value);
    const category = categorySelect.value;
    const active = activeToggle.checked;

    if (!name || price <= 0) {
        showCustomAlert('Por favor ingrese el nombre del plato y un precio válido.');
        return;
    }

    try {
        let productId;
        let documentId;

        if (editingProductId !== null) {
            // EDITAR PRODUCTO EXISTENTE
            const prod = products.find(p => p.id === editingProductId);

            if (!prod) {
                showCustomAlert('No se encontró el producto que desea editar.');
                return;
            }

            productId = prod.id;
            documentId = prod._docId || `producto_${productId}`;

        } else {
            // CREAR PRODUCTO NUEVO
            const numericIds = products.map(p => Number(p.id) || 0);

            productId = numericIds.length > 0
                ? Math.max(...numericIds) + 1
                : 1;

            documentId = `producto_${productId}`;
        }

        const productData = {
            id: productId,
            name: name,
            price: price,
            category: category,
            active: active
        };

        // Guardar directamente en Firestore
        await window.RestoposDB.set(
            'productos',
            documentId,
            productData
        );

        // Actualizar estado local después de confirmar el guardado
        if (editingProductId !== null) {
            const prod = products.find(p => p.id === editingProductId);

            Object.assign(prod, productData, {
                _docId: documentId
            });

        } else {
            products.push({
                ...productData,
                _docId: documentId
            });
        }

        // Actualizar listas de categorías
        drinks = products.filter(product =>
            String(product.category || '').toLowerCase() === 'bebidas'
        );

        addons = products.filter(product =>
            String(product.category || '').toLowerCase() === 'adicionales'
        );

        appConfig.lastUpdated = Date.now();

        saveData();

        cancelEditProduct();
        renderProducts();

        showCustomAlert(
            editingProductId !== null
                ? 'Producto actualizado correctamente en Firebase.'
                : 'Producto creado correctamente en Firebase.'
        );

    } catch (error) {
        console.error(
            'RESTOPOS: Error guardando producto en Firebase:',
            error.code,
            error.message
        );

        showCustomAlert(
            'No se pudo guardar el producto en Firebase. Verifique su conexión e inténtelo nuevamente.'
        );
    }
}


function editProduct(id) {
    const prod = products.find(p => p.id === id);
    if (prod) {
        editingProductId = id;
        document.getElementById('newProdName').value = prod.name;
        document.getElementById('newProdPrice').value = `$ ${prod.price.toLocaleString('es-CO')}`;
        document.getElementById('newProdCategory').value = prod.category || 'principales';

        const activeToggle = document.getElementById('newProdActive');
        const statusLabel = document.getElementById('prodActiveStatusLabel');
        activeToggle.checked = prod.active !== false;
        statusLabel.innerText = activeToggle.checked ? 'Activo' : 'Inactivo';
        statusLabel.style.color = activeToggle.checked ? '#16a34a' : '#64748b';

        document.getElementById('formProductTitle').innerText = 'Editar Plato';
        document.getElementById('btnSaveProduct').innerText = 'Guardar Cambios (Online)';
        document.getElementById('btnCancelEdit').classList.remove('hidden');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
}

function cancelEditProduct() {
    editingProductId = null;
    document.getElementById('newProdName').value = '';
    document.getElementById('newProdPrice').value = '';
    document.getElementById('newProdCategory').value = 'principales';

    const activeToggle = document.getElementById('newProdActive');
    const statusLabel = document.getElementById('prodActiveStatusLabel');
    activeToggle.checked = true;
    statusLabel.innerText = 'Activo';
    statusLabel.style.color = '#16a34a';

    document.getElementById('formProductTitle').innerText = 'Registro de Nuevo Plato';
    document.getElementById('btnSaveProduct').innerText = 'Guardar Plato';
    document.getElementById('btnCancelEdit').classList.add('hidden');
}



/**
 * ==========================================================
 * ELIMINAR PRODUCTO
 * Solicita confirmación mediante el popup personalizado
 * y elimina definitivamente el documento de Firestore.
 * ==========================================================
 */
async function deleteProduct(id) {

    // Buscar el producto en el catálogo local.
    const prod = products.find(p => p.id === id);

    // Detener la operación si el producto no existe.
    if (!prod) return;

    // Mostrar confirmación personalizada.
    const confirmed = await showCustomConfirm(
        `¿Desea eliminar el plato "${prod.name}"?`
    );

    // Cancelar la operación si el usuario no confirma.
    if (!confirmed) return;

    try {

        // Obtener el identificador real del documento de Firestore.
        const documentId = prod._docId || `producto_${prod.id}`;

        // Eliminar definitivamente el documento de Firestore.
        await window.RestoposDB.remove(
            'productos',
            documentId
        );

        // Retirar el producto de la lista local.
        products = products.filter(p => p.id !== id);

        // Actualizar las listas de bebidas y adicionales.
        drinks = products.filter(product =>
            String(product.category || '').toLowerCase() === 'bebidas'
        );

        addons = products.filter(product =>
            String(product.category || '').toLowerCase() === 'adicionales'
        );

        // Cancelar la edición si el producto eliminado estaba seleccionado.
        if (editingProductId === id) {
            cancelEditProduct();
        }

        // Guardar los cambios locales.
        appConfig.lastUpdated = Date.now();
        saveData();

        // Actualizar visualmente el catálogo.
        renderProducts();

        // Informar que la eliminación fue exitosa.
        showCustomAlert('Producto eliminado definitivamente de Firebase.');

    } catch (error) {

        // Registrar el error para facilitar el diagnóstico.
        console.error(
            'RESTOPOS: Error eliminando producto de Firebase:',
            error.code,
            error.message
        );

        // Informar al usuario que no se pudo completar la operación.
        showCustomAlert(
            'No se pudo eliminar el producto. Verifique su conexión e inténtelo nuevamente.'
        );
    }
}


function renderDrinks() {
    const list = document.getElementById('drinksList');
    if (!list) return;
    list.innerHTML = '';
    drinks.forEach(d => {
        const item = document.createElement('div');
        item.className = 'product-row';
        item.innerHTML = `<span>${d.name} - $${d.price}</span>`;
        list.appendChild(item);
    });
}

function renderAddons() {
    const list = document.getElementById('addonsList');
    if (!list) return;
    list.innerHTML = '';
    addons.forEach(a => {
        const item = document.createElement('div');
        item.className = 'product-row';
        item.innerHTML = `<span>${a.name} - $${a.price}</span>`;
        list.appendChild(item);
    });
}

function cancelEditDrink() {
    editingDrinkId = null;
}

function cancelEditAddon() {
    editingAddonId = null;
}


/* ========================================================== */
/* 11. MÓDULO DE DASHBOARD ANALÍTICO DE VENTAS                */
/* ========================================================== */

/**
 * Renderiza el módulo de Dashboard de Ventas con filtros manuales por fecha.
 * Cómo lo realiza: Calcula automáticamente la fecha de hoy (Sistema) y la fecha de hace 8 días,
 * colocándolas por defecto en los inputs sin realizar consultas automáticas hasta presionar "Aplicar Filtro".
 */
async function renderSalesDashboard() {
    const container = document.getElementById('dashboardAnalyticsContainer');
    if (!container) return;

    let filterBar = document.getElementById('dashboardDateFilterBar');
    if (!filterBar) {
        filterBar = document.createElement('div');
        filterBar.id = 'dashboardDateFilterBar';
        filterBar.style.cssText = "display: flex; gap: 0.5rem; align-items: center; margin-bottom: 1rem; flex-wrap: wrap; background: #fff; padding: 0.75rem; border: 1px solid var(--border); border-radius: 8px;";

        // Obtener la fecha actual del sistema en formato YYYY-MM-DD
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        const todayIso = `${yyyy}-${mm}-${dd}`;

        // Calcular 8 días antes de hoy basándose en la fecha del sistema
        const startDateObj = new Date();
        startDateObj.setDate(today.getDate() - 8);
        const startYyyy = startDateObj.getFullYear();
        const startMm = String(startDateObj.getMonth() + 1).padStart(2, '0');
        const startDd = String(startDateObj.getDate()).padStart(2, '0');
        const startDateIso = `${startYyyy}-${startMm}-${startDd}`;

        filterBar.innerHTML = `
            <div style="font-size: 0.8rem; font-weight: bold; width: 90%;">Filtrar por Rango de Fechas:</div>
            <div style="flex: 1; min-width: 120px;">
                <label style="font-size: 0.7rem; color: var(--text-secondary); display:block;">Desde:</label>
                <input type="date" id="dashStartDate" value="${startDateIso}" style="width: 90%; padding: 0.3rem; font-size: 0.8rem; border: 1px solid var(--border); border-radius: 4px;">
            </div>
            <div style="flex: 1; min-width: 120px;">
                <label style="font-size: 0.7rem; color: var(--text-secondary); display:block;">Hasta:</label>
                <input type="date" id="dashEndDate" value="${todayIso}" style="width: 90%; padding: 0.3rem; font-size: 0.8rem; border: 1px solid var(--border); border-radius: 4px;">
            </div>
            <div style="align-self: flex-end;">
                <button class="btn btn-success" onclick="fetchAndRenderSalesData()" style="padding: 0.35rem 0.75rem; font-size: 0.80rem; background: var(--primary); color: #fff; border:none; border-radius:4px; cursor:pointer;">Aplicar Filtro</button>
            </div>
        `;
        container.parentNode.insertBefore(filterBar, container);
    }

    // Panel en espera limpio sin llamadas automáticas a la nube
    container.innerHTML = `
        <div style="background: #ffffff; border: 1px solid var(--border); padding: 2.5rem; border-radius: 12px; text-align: center; color: var(--text-secondary);">
            <h3 style="font-size: 1rem; margin-bottom: 0.5rem; color: var(--text);">Panel de Analíticas en Espera</h3>
            <p style="font-size: 0.85rem;">El rango inicial está configurado a 8 días. Presione <strong>"Aplicar Filtro"</strong> para consultar las ventas.</p>
        </div>
    `;
}

/**
 * ==========================================================
 * CONSULTA Y RENDERIZADO DE ESTADÍSTICAS DE VENTAS
 * ==========================================================
 *
 * Obtiene el historial de ventas directamente desde Firebase
 * Firestore, aplica filtros por rango de fechas y genera
 * los indicadores estadísticos del Dashboard.
 *
 * Indicadores:
 * - Venta total.
 * - Ticket promedio.
 * - Total de facturas.
 * - Gráfica de ventas.
 * - Top 5 de productos más vendidos.
 *
 * Fuente de datos: colección Firestore "ventas".
 * Campo de fecha: createdAt (milisegundos Unix).
 *
 * ==========================================================
 */


async function fetchAndRenderSalesData() {
    const container = document.getElementById('dashboardAnalyticsContainer');
    if (!container) return;

    const startDate = document.getElementById('dashStartDate')?.value || "";
    const endDate = document.getElementById('dashEndDate')?.value || "";

    container.innerHTML = `
        <div style="text-align:center;padding:2rem;color:var(--text-secondary);">
            <p>🔄 Consultando ventas en Firebase...</p>
        </div>
    `;

    // Variables de fecha disponibles en toda la función.
    let startTimestamp = null;
    let endTimestamp = null;

    try {
        // Consultar las ventas directamente desde Firestore.
        const allSales = await window.RestoposDB.getAll('ventas');

        // Convertir las fechas seleccionadas en límites de tiempo.

        if (startDate) {
            const [year, month, day] = startDate.split('-').map(Number);
            startTimestamp = new Date(year, month - 1, day).getTime();
        }

        if (endDate) {
            const [year, month, day] = endDate.split('-').map(Number);
            endTimestamp = new Date(
                year, month - 1, day, 23, 59, 59, 999
            ).getTime();
        }

        // Filtrar las ventas según el rango seleccionado.
        salesHistory = allSales.filter(sale => {
            const timestamp = Number(sale.createdAt);

            if (!Number.isFinite(timestamp)) return false;

            if (startTimestamp !== null && timestamp < startTimestamp) {
                return false;
            }

            if (endTimestamp !== null && timestamp > endTimestamp) {
                return false;
            }

            return true;
        });

        // Mantener una copia local de las ventas consultadas.
        localStorage.setItem(
            'restopos_sales_history',
            JSON.stringify(salesHistory)
        );

    } catch (error) {
        console.error(
            'RESTOPOS: Error consultando ventas en Firestore:',
            error.code,
            error.message
        );

        container.innerHTML = `
            <div style="padding:2rem;text-align:center;color:#dc2626;">
                <h3>No fue posible consultar las ventas</h3>
                <p>Comprueba tu conexión y los permisos de Firebase.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = '';

    if (!Array.isArray(salesHistory) || salesHistory.length === 0) {
        container.innerHTML = `
            <div style="background:#ffffff;border:1px solid var(--border);padding:2rem;border-radius:12px;text-align:center;color:var(--text-secondary);">
                <h3 style="font-size:1rem;margin-bottom:0.5rem;color:var(--text);">
                    Sin datos de ventas en este rango
                </h3>
                <p style="font-size:0.85rem;">
                    No se encontraron facturas entre
                    ${startDate || 'el inicio'} y ${endDate || 'la fecha actual'}.
                </p>
            </div>
        `;
        return;
    }

    let totalRevenue = 0;
    const totalInvoicesSet = new Set();
    const productCounts = {};

    salesHistory.forEach(sale => {
        const price = Number(sale.valorpagado) || 0;
        totalRevenue += price;

        if (sale.facnumero) {
            totalInvoicesSet.add(sale.facnumero);
        }

        const plato = sale.plato || 'Producto General';
        productCounts[plato] = (productCounts[plato] || 0) + 1;
    });

    const totalInvoices = totalInvoicesSet.size;

    const averageTicket = totalInvoices > 0
        ? totalRevenue / totalInvoices
        : 0;

    const sortedProducts = Object.entries(productCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

    let topProductsHtml = '';

    sortedProducts.forEach(([prod, count]) => {
        topProductsHtml += `
            <div style="display:flex;justify-content:space-between;padding:0.5rem 0;border-bottom:1px dashed var(--border);font-size:0.85rem;">
                <span>${prod}</span>
                <strong>${count} vendidos</strong>
            </div>
        `;
    });

    // Determinar el tipo de gráfica según el rango seleccionado.
    const diffTime = startTimestamp !== null && endTimestamp !== null
        ? Math.abs(endTimestamp - startTimestamp)
        : 0;

    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    const chartViewType = diffDays > 10 ? 'month' : 'week';

    const salesChartHtml = renderSalesChart(
        salesHistory,
        chartViewType
    );

    container.innerHTML = `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:0.75rem;margin-bottom:1rem;">
            <div style="background:#f8fafc;border:1px solid var(--border);padding:0.75rem;border-radius:8px;text-align:center;">
                <span style="font-size:0.75rem;color:var(--text-secondary);display:block;">VENTA TOTAL</span>
                <strong style="font-size:1.1rem;color:var(--primary);">
                    $${Math.round(totalRevenue).toLocaleString('es-CO')}
                </strong>
            </div>

            <div style="background:#f8fafc;border:1px solid var(--border);padding:0.75rem;border-radius:8px;text-align:center;">
                <span style="font-size:0.75rem;color:var(--text-secondary);display:block;">TICKET PROMEDIO</span>
                <strong style="font-size:1.1rem;color:var(--success);">
                    $${Math.round(averageTicket).toLocaleString('es-CO')}
                </strong>
            </div>

            <div style="background:#f8fafc;border:1px solid var(--border);padding:0.75rem;border-radius:8px;text-align:center;">
                <span style="font-size:0.75rem;color:var(--text-secondary);display:block;">TOTAL FACTURAS</span>
                <strong style="font-size:1.1rem;color:var(--text);">
                    ${totalInvoices}
                </strong>
            </div>
        </div>

        ${salesChartHtml}

        <div style="background:#ffffff;border:1px solid var(--border);padding:0.75rem;border-radius:8px;margin-bottom:1rem;">
            <h4 style="font-size:0.95rem;margin-bottom:0.5rem;color:var(--text);">
                🏆 Top Productos Más Vendidos
            </h4>
            ${topProductsHtml}
        </div>
    `;
}

/**
 * Renderiza el gráfico de analíticas de ventas diarias en formato de barras.
 */
function renderSalesChart(salesData) {
    if (!Array.isArray(salesData)) salesData = [];
    return generateDailySalesChartHtml(salesData);
}


/**
 * Genera la gráfica de Ventas de la Semana (Lunes a Domingo).
 */
function generateWeeklyChartHtml(sales) {
    const days = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
    const currentWeekTotals = [0, 0, 0, 0, 0, 0, 0];

    sales.forEach(s => {
        if (!s.fecha) return;
        let dateObj;
        if (String(s.fecha).includes('/')) {
            const parts = String(s.fecha).split('/');
            dateObj = new Date(parts[2], parts[1] - 1, parts[0]);
        } else {
            dateObj = new Date(s.fecha);
        }
        if (isNaN(dateObj)) return;

        let dayIndex = dateObj.getDay() - 1;
        if (dayIndex === -1) dayIndex = 6; // Domingo

        currentWeekTotals[dayIndex] += parseFloat(s.valorpagado) || 0;
    });

    const maxVal = Math.max(...currentWeekTotals, 100000);
    const chartHeight = 140;
    const chartWidth = 600;
    const stepX = chartWidth / (days.length - 1);

    let points = '';
    let polylineArea = `0,${chartHeight} `;
    let pointsCirclesHtml = '';
    let xLabelsHtml = '';

    currentWeekTotals.forEach((val, i) => {
        const x = i * stepX;
        const y = chartHeight - (val / maxVal) * (chartHeight - 20);
        points += `${x},${y} `;
        polylineArea += `${x},${y} `;
        pointsCirclesHtml += `<circle cx="${x}" cy="${y}" r="4" fill="#ea580c" stroke="#fff" stroke-width="2"/>`;
        xLabelsHtml += `<text x="${x}" y="${chartHeight + 20}" font-size="11" fill="#64748b" text-anchor="middle">${days[i]}</text>`;
    });
    polylineArea += `${chartWidth},${chartHeight}`;

    return `
        <div style="background: #ffffff; border: 1px solid var(--border); padding: 1.25rem; border-radius: 12px; margin-bottom: 1rem;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; flex-wrap: wrap; gap: 0.5rem;">
                <div style="display: flex; align-items: center; gap: 0.5rem;">
                    <span style="font-size: 1.1rem;">📊</span>
                    <h3 style="font-size: 1rem; font-weight: bold; color: var(--text); margin: 0;">Ventas de la semana</h3>
                </div>
                <div style="background: #d1fae5; color: #065f46; padding: 0.25rem 0.6rem; border-radius: 20px; font-size: 0.75rem; font-weight: bold;">
                    Lun - Dom
                </div>
            </div>

            <div style="position: relative; width: 100%; overflow-x: auto;">
                <svg viewBox="0 -15 ${chartWidth} ${chartHeight + 35}" style="width: 100%; height: auto; overflow: visible;">
                    <defs>
                        <linearGradient id="orangeGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stop-color="#fdba74" stop-opacity="0.4"/>
                            <stop offset="100%" stop-color="#fdba74" stop-opacity="0.0"/>
                        </linearGradient>
                    </defs>
                    <line x1="0" y1="0" x2="${chartWidth}" y2="0" stroke="#f1f5f9" stroke-width="1"/>
                    <line x1="0" y1="${chartHeight / 2}" x2="${chartWidth}" y2="${chartHeight / 2}" stroke="#f1f5f9" stroke-width="1"/>
                    <line x1="0" y1="${chartHeight}" x2="${chartWidth}" y2="${chartHeight}" stroke="#e2e8f0" stroke-width="1"/>
                    <polygon points="${polylineArea}" fill="url(#orangeGradient)" />
                    <polyline fill="none" stroke="#ea580c" stroke-width="2.5" points="${points}" stroke-linecap="round" stroke-linejoin="round"/>
                    ${pointsCirclesHtml}
                    ${xLabelsHtml}
                </svg>
            </div>
        </div>
    `;
}

/**
 * Genera la gráfica de "Ventas de la semana" (Lunes a Domingo) en formato de barras.
 */
/**
 * Genera la gráfica de evolución diaria de ventas en formato de barras,
 * filtrando exactamente por los días del rango de fechas seleccionado.
 */
/**
 * Genera la gráfica de barras de ventas diarias con el estilo exacto de la gráfica 2.
 */
function generateDailySalesChartHtml(sales) {
    const dailyDataMap = {};

    sales.forEach(s => {
        if (!s.fecha) return;
        let dateObj;
        if (String(s.fecha).includes('/')) {
            const parts = String(s.fecha).split('/');
            dateObj = new Date(parts[2], parts[1] - 1, parts[0]);
        } else {
            dateObj = new Date(s.fecha);
        }
        if (isNaN(dateObj)) return;

        const year = dateObj.getFullYear();
        const month = String(dateObj.getMonth() + 1).padStart(2, '0');
        const day = String(dateObj.getDate()).padStart(2, '0');
        const dateKey = `${year}-${month}-${day}`;

        const labelFormatted = `${day} ${['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'][dateObj.getMonth()]}`;

        if (!dailyDataMap[dateKey]) {
            dailyDataMap[dateKey] = { label: labelFormatted, total: 0 };
        }
        dailyDataMap[dateKey].total += parseFloat(s.valorpagado) || 0;
    });

    const sortedKeys = Object.keys(dailyDataMap).sort();
    const chartLabels = sortedKeys.map(k => dailyDataMap[k].label);
    const chartValues = sortedKeys.map(k => dailyDataMap[k].total);

    if (chartValues.length === 0) {
        return `
            <div style="background: #ffffff; border: 1px solid var(--border); padding: 1.25rem; border-radius: 12px; margin-bottom: 1rem; text-align: center; color: var(--text-secondary); font-size: 0.85rem;">
                📊 <strong>Ventas Diarias</strong><br>No hay registros en el rango de fechas seleccionado.
            </div>
        `;
    }

    const maxDataVal = Math.max(...chartValues, 100000);
    const topVal = Math.ceil(maxDataVal / 250000) * 250000 || 1000000;

    const chartHeight = 160;
    const chartWidth = Math.max(650, chartLabels.length * 55);
    const paddingLeft = 100; // 👈 Aumentado para dar espacio a los números y al texto vertical
    const paddingBottom = 60;
    const paddingRight = 20;
    const usableWidth = chartWidth - paddingLeft - paddingRight;
    const slotWidth = chartLabels.length > 0 ? usableWidth / chartLabels.length : usableWidth;
    const barWidth = Math.max(12, Math.min(slotWidth * 0.6, 32));

    let barsHtml = '';
    let xLabelsHtml = '';

    chartValues.forEach((val, i) => {
        const xCenter = paddingLeft + (i * slotWidth) + (slotWidth / 2);
        const x = xCenter - (barWidth / 2);
        const barHeight = (val / topVal) * chartHeight;
        const y = chartHeight - barHeight;

        barsHtml += `<rect x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" fill="#1e40af" rx="2" ry="2"/>`;

        xLabelsHtml += `
            <text x="${xCenter}" y="${chartHeight + 15}" font-size="10" fill="#334155" font-weight="500" text-anchor="end" transform="rotate(-35, ${xCenter}, ${chartHeight + 15})">
                ${chartLabels[i]}
            </text>
        `;
    });

    let yAxisLabelsHtml = '';
    const steps = 4;
    for (let i = 0; i <= steps; i++) {
        const yCoord = (chartHeight / steps) * i;
        const valLabel = topVal - (topVal / steps) * i;

        let formattedVal = Math.round(valLabel).toLocaleString();

        if (i < steps) {
            yAxisLabelsHtml += `<line x1="${paddingLeft}" y1="${yCoord}" x2="${chartWidth - paddingRight}" y2="${yCoord}" stroke="#e2e8f0" stroke-width="1"/>`;
        }
        // Alineado a la izquierda del área de dibujo
        yAxisLabelsHtml += `<text x="${paddingLeft - 12}" y="${yCoord + 4}" font-size="10" fill="#64748b" text-anchor="end">${formattedVal}</text>`;
    }

    return `
        <div style="background: #ffffff; border: 1px solid var(--border); padding: 1.25rem; border-radius: 12px; margin-bottom: 1rem;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; flex-wrap: wrap; gap: 0.5rem;">
                <div style="display: flex; align-items: center; gap: 0.5rem;">
                    <span style="font-size: 1.1rem;">📊</span>
                    <h3 style="font-size: 1rem; font-weight: bold; color: var(--text); margin: 0;">Ventas Diarias</h3>
                </div>
                <div style="background: #dbeafe; color: #1e40af; padding: 0.25rem 0.6rem; border-radius: 20px; font-size: 0.75rem; font-weight: bold;">
                    Día a Día
                </div>
            </div>

            <div style="position: relative; width: 100%; overflow-x: auto;">
                <svg viewBox="0 -15 ${chartWidth} ${chartHeight + paddingBottom}" style="width: 100%; height: auto; overflow: visible;">
                    ${yAxisLabelsHtml}

                    <line x1="${paddingLeft}" y1="${chartHeight}" x2="${chartWidth - paddingRight}" y2="${chartHeight}" stroke="#94a3b8" stroke-width="1.5"/>
                    
                    ${barsHtml}
                    ${xLabelsHtml}      
                    
                    <!-- Etiqueta lateral centrada de forma segura -->
                    <text x="22" y="${chartHeight / 2}" font-size="11" fill="#475569" font-weight="bold" text-anchor="middle" transform="rotate(-90, 22, ${chartHeight / 2})">Ingresos Totales ($)</text>
                </svg>
            </div>
        </div>
    `;
}
