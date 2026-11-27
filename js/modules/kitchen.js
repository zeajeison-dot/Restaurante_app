
/**
 * ==========================================================
 * RESTOPOS - MÓDULO DE COCINA (KDS)
 * Gestión de envío, visualización y atención de comandas.
 * ==========================================================
 */


/**
 * ==========================================================
 * ENVIAR COMANDA A COCINA
 * Consulta primero los datos actualizados de Firestore
 * para identificar correctamente los productos seleccionados.
 * ==========================================================
 */

async function sendOrderToKitchen() {
    if (!navigator.onLine) {
        showCustomAlert('No hay conexión a Internet. No se puede enviar la comanda.');
        return;
    }

    const localTable = tables.find(
        t => Number(t.id) === Number(currentTableId)
    );

    if (!localTable) {
        showCustomAlert('No se encontró la mesa seleccionada.');
        return;
    }

    try {
        const documentId = localTable._docId || `mesa_${localTable.id}`;

        // Esperar a que terminen las actualizaciones de selección.
        if (window.kitchenCheckSaveQueue) {
            await window.kitchenCheckSaveQueue;
        }

        // Obtener la versión más reciente de la mesa.
        const cloudTable = await window.RestoposDB.getById(
            'mesas',
            documentId
        );

        if (!cloudTable) {
            showCustomAlert('No se encontró la mesa en Firebase.');
            return;
        }

        // Conservar las observaciones locales antes de sincronizar.
        const localItems = Array.isArray(localTable.items)
            ? localTable.items
            : [];

        const cloudItems = Array.isArray(cloudTable.items)
            ? cloudTable.items
            : [];

        // Recuperar los datos más recientes de Firebase
        // sin perder las observaciones que aún están en memoria.
        localTable.items = cloudItems.map(cloudItem => {

            const localItem = localItems.find(
                item => item.uid && item.uid === cloudItem.uid
            );

            if (!localItem) {
                return cloudItem;
            }

            return {
                ...cloudItem,
                observation: localItem.observation ?? cloudItem.observation ?? '',
                modifications: localItem.modifications ?? cloudItem.modifications ?? []
            };

        });

        localTable.status = cloudTable.status || 'libre';

        const itemsToSend = localTable.items.filter(
            item =>
                item.sentToKitchen !== true &&
                item.kitchenChecked === true
        );

        if (itemsToSend.length === 0) {
            saveData();
            renderPlusOrderItems();
            showCustomAlert('Seleccione al menos un producto para enviar a cocina.');
            return;
        }

        // Obtener la configuración más reciente de Firebase.
        const cloudConfig = await window.RestoposDB.getById(
            'configuracion',
            'general'
        );

        const effectiveConfig = {
            ...appConfig,
            ...(cloudConfig || {})
        };

        const entryTimer = Number(effectiveConfig.kitchenEntryTimerMinutes) || 5;
        const entryAlarm = Number(effectiveConfig.kitchenEntryAlarmPercent) || 25;
        const mainTimer = Number(effectiveConfig.kitchenMainTimerMinutes) || 15;
        const mainAlarm = Number(effectiveConfig.kitchenMainAlarmPercent) || 25;

        const now = Date.now();

        // Identificador único para los lotes de esta operación.
        const operationId =
            `${now}_${Math.random().toString(36).slice(2, 8)}`;

        const batchIds = {
            entradas: `${operationId}_entradas`,
            principales: `${operationId}_principales`
        };

        // Clasificar y marcar cada producto seleccionado.
        const updatedItems = localTable.items.map(item => {
            if (
                item.sentToKitchen === true ||
                item.kitchenChecked !== true
            ) {
                return item;
            }

            const product = products.find(
                p => Number(p.id) === Number(item.productId)
            );

            const category = normalizeCategory(product?.category);

            const group = ['sopas', 'bebidas'].includes(category)
                ? 'entradas'
                : 'principales';

            const timerMinutes = group === 'entradas'
                ? entryTimer
                : mainTimer;

            const alarmPercent = group === 'entradas'
                ? entryAlarm
                : mainAlarm;

            return {
                ...item,
                sentToKitchen: true,
                served: false,
                pickedUp: false,
                sentAt: now,
                kitchenBatchId: batchIds[group],
                kitchenGroup: group,
                kitchenTimerMinutes: timerMinutes,
                kitchenAlarmPercent: alarmPercent,
                kitchenChecked: true
            };
        });

        // Guardar los dos grupos en una sola actualización de la mesa.
        await window.RestoposDB.update(
            'mesas',
            documentId,
            {
                items: updatedItems,
                status: 'ocupada'
            }
        );

        // Actualizar el estado local.
        localTable.items = updatedItems;
        localTable.status = 'ocupada';

        // Actualizar configuración local con la versión más reciente.
        appConfig = {
            ...appConfig,
            ...(cloudConfig || {})
        };

        appConfig.lastUpdated = now;

        saveData();
        renderPlusOrderItems();

        const entryCount = updatedItems.filter(
            item => item.kitchenBatchId === batchIds.entradas
        ).length;

        const mainCount = updatedItems.filter(
            item => item.kitchenBatchId === batchIds.principales
        ).length;

        let message = 'Comanda enviada correctamente a cocina.';

        if (entryCount > 0 && mainCount > 0) {
            message += '\nSe generaron dos lotes independientes.';
        } else if (entryCount > 0) {
            message += '\nSe generó el lote de entradas, sopas y bebidas.';
        } else if (mainCount > 0) {
            message += '\nSe generó el lote de platos principales y adicionales.';
        }

        showCustomAlert(message);

        await showSection('tables-section');

    } catch (error) {
        console.error(
            'RESTOPOS: Error enviando comanda a cocina:',
            error
        );

        showCustomAlert(
            'No fue posible enviar la comanda a cocina. Verifique la conexión e inténtelo nuevamente.'
        );
    }
}






/**
 * ==========================================================
 * RENDERIZAR COMANDAS EN PANTALLA DE COCINA
 *
 * Agrupa los productos por lotes y calcula los umbrales
 * de tiempo para las alertas visuales y sonoras.
 * ==========================================================
 */

function renderKitchenOrders() {

    const container = document.getElementById('kitchenOrdersContainer');

    if (!container) return;

    container.innerHTML = '';

    const now = Date.now();
    const activeBatches = [];

    let triggerAlarm = false;


    /* ======================================================
       1. RECOPILAR LOS LOTES PENDIENTES DE TODAS LAS MESAS
    ====================================================== */

    tables.forEach(table => {

        const activeItems = (Array.isArray(table.items) ? table.items : [])
            .filter(item => item.sentToKitchen === true && !item.served);

        if (activeItems.length === 0) return;

        const batchesMap = {};

        activeItems.forEach(item => {

            // Compatibilidad con comandas antiguas.
            const batchKey = item.kitchenBatchId || `legacy_${item.sentAt || now}`;

            if (!batchesMap[batchKey]) {
                batchesMap[batchKey] = [];
            }

            batchesMap[batchKey].push(item);

        });


        /* ==================================================
           2. PROCESAR CADA LOTE
        ================================================== */

        Object.entries(batchesMap).forEach(([batchKey, batchItems]) => {

            const firstItem = batchItems[0];

            const batchTime = Number(firstItem.sentAt) || now;

            const isEntryGroup = firstItem.kitchenGroup === 'entradas';

            const timerMinutes =
                Number(firstItem.kitchenTimerMinutes) ||
                Number(appConfig.kitchenTimerMinutes) ||
                (isEntryGroup ? 5 : 15);

            const alarmPercent =
                Number(firstItem.kitchenAlarmPercent) ||
                (
                    isEntryGroup
                        ? Number(appConfig.kitchenEntryAlarmPercent) || 25
                        : Number(appConfig.kitchenMainAlarmPercent) || 25
                );

            activeBatches.push({
                tableId: table.id,
                tableName: table.name,
                batchId: batchKey,
                sentAt: batchTime,
                items: batchItems,
                kitchenGroup: firstItem.kitchenGroup || 'principales',
                timerMinutes,
                alarmPercent
            });

        });

    });


    /* ======================================================
       3. ORDENAR LOS LOTES DEL MÁS ANTIGUO AL MÁS RECIENTE
    ====================================================== */

    /* 3. ORDENAR LOS LOTES POR PRIORIDAD DE SERVICIO */
    activeBatches.sort((a, b) => {
        const deadlineA = a.sentAt + (a.timerMinutes * 60 * 1000);
        const deadlineB = b.sentAt + (b.timerMinutes * 60 * 1000);

        return deadlineA - deadlineB || a.sentAt - b.sentAt;
    });

    // Activar desplazamiento cuando existan más de cuatro comandas.
    container.classList.toggle('kitchen-many', activeBatches.length > 4);


    /* ======================================================
       4. COMPROBAR SI ALGÚN LOTE NECESITA ACTIVAR LA ALARMA
    ====================================================== */

    activeBatches.forEach(batch => {

        const limitSeconds = batch.timerMinutes * 60;

        const elapsedSeconds = Math.floor((now - batch.sentAt) / 1000);

        const remainingSeconds = limitSeconds - elapsedSeconds;

        const redThresholdSeconds = limitSeconds * (batch.alarmPercent / 100);

        if (remainingSeconds <= redThresholdSeconds) {
            triggerAlarm = true;
        }

    });


    // Reproducir alarma como máximo cada 30 segundos.
    if (triggerAlarm && (now - lastKitchenAlarmTime >= 30000)) {

        playAlarmBeep();

        lastKitchenAlarmTime = now;

    }


    /* ======================================================
       5. MOSTRAR MENSAJE CUANDO NO HAY COMANDAS PENDIENTES
    ====================================================== */

    if (activeBatches.length === 0) {

        container.innerHTML = `
            <div style="
                text-align:center;
                padding:30px;
                color:#64748b;
            ">
                <div style="font-size:40px;">🍽️</div>
                <p>No hay comandas pendientes</p>
            </div>
        `;

        return;

    }


    /* ======================================================
       6. DIBUJAR CADA LOTE CON SU PROPIO TEMPORIZADOR
    ====================================================== */

    activeBatches.forEach(batch => {

        const limitSeconds = batch.timerMinutes * 60;

        const elapsedSeconds = Math.floor((now - batch.sentAt) / 1000);

        const remainingSeconds = limitSeconds - elapsedSeconds;

        const redThresholdSeconds = limitSeconds * (batch.alarmPercent / 100);

        const yellowThresholdSeconds = limitSeconds * 0.50;

        const isExpired = remainingSeconds <= 0;

        const absRemaining = Math.abs(remainingSeconds);

        const remMins = Math.floor(absRemaining / 60);

        const remSecs = absRemaining % 60;

        const timeFormatted =
            `${isExpired ? '-' : ''}${remMins}:${remSecs < 10 ? '0' : ''}${remSecs}`;


        /* ==================================================
           7. DETERMINAR LOS COLORES SEGÚN EL TIEMPO
        ================================================== */

        let cardBg = '#dcfce7';
        let borderColor = '#22c55e';
        let textColor = '#15803d';

        if (remainingSeconds <= redThresholdSeconds) {

            cardBg = '#fee2e2';
            borderColor = '#ef4444';
            textColor = '#b91c1c';

        } else if (remainingSeconds <= yellowThresholdSeconds) {

            cardBg = '#fef9c3';
            borderColor = '#eab308';
            textColor = '#854d0e';

        }


        /* ==================================================
           8. CREAR LA TARJETA DE LA COMANDA
        ================================================== */

        const card = document.createElement('div');

        card.style.cssText = `
            background:${cardBg};
            border:2px solid ${borderColor};
            border-radius:12px;
            padding:15px;
            margin-bottom:15px;
            color:${textColor};
        `;


        /* ==================================================
           9. CONSTRUIR LA LISTA DE PRODUCTOS Y OBSERVACIONES
        ================================================== */

        let itemsHtml = '';

        batch.items.forEach(item => {

            itemsHtml += `
                <div style="
                    padding:8px 0;
                    border-bottom:1px solid rgba(0,0,0,0.1);
                ">
                    <!-- NOMBRE DEL PRODUCTO HTML-->
                    <strong style="font-size:20px;">
                    ${item.name}
                    </strong>

                    ${item.observation
                    ? `
                            <div style="
                                margin-top:6px;
                                padding:7px 9px;
                                background:#fee2e2;
                                border-left:4px solid #dc2626;
                                border-radius:5px;
                                color:#b91c1c;
                                font-size:20px;
                                font-weight:800;
                                text-transform:uppercase;
                                line-height:1.4;
                            ">
                                ⚠️ OBSERVACIÓN:
                                <div>${item.observation}</div>
                            </div>
                        `
                    : ''
                }

                </div>
            `;

        });


        /* ==================================================
           10. PREPARAR EL IDENTIFICADOR DEL LOTE
        ================================================== */

        const safeBatchId = String(batch.batchId)
            .replace(/\\/g, '\\\\')
            .replace(/'/g, "\\'");


        /* ==================================================
           11. CONSTRUIR EL CONTENIDO DE LA TARJETA
        ================================================== */

        card.innerHTML = `
            <div style="
                display:grid;
                grid-template-columns:1fr auto 1fr;
                align-items:center;
                gap:8px;
            ">

                <!-- MESA -->
                <div style="
                    font-size:40px;
                    font-weight:800;
                    text-align:left;
                ">
                    ${batch.tableName}
                </div>


                <!-- HORA DEL LOTE -->
                <div style="
                    font-size:10px;
                    font-weight:600;
                    text-align:center;
                    white-space:nowrap;
                ">
                    Lote ${new Date(batch.sentAt).toLocaleTimeString('es-CO', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        })}
                </div>


                <!-- TEMPORIZADOR -->
                <div style="text-align:right;">

                    <div style="
                        font-size:12px;
                        font-weight:600;
                    ">
                        Tiempo restante
                    </div>

                    <strong style="
                        display:block;
                        font-size:24px;
                        white-space:nowrap;
                    ">
                        ⏱️ ${timeFormatted}
                    </strong>

                    <div style="font-size:11px;">
                        Límite: ${batch.timerMinutes} min
                    </div>

                </div>

            </div>


            <!-- PRODUCTOS -->
            <div style="margin-top:20px;">
                ${itemsHtml}
            </div>


            <!-- BOTÓN DE SERVIDO -->
            <button
                style="
                    width:100%;
                    margin-top:12px;
                    padding:12px;
                    border:none;
                    border-radius:8px;
                    background:#16a34a;
                    color:white;
                    font-weight:bold;
                    cursor:pointer;
                "
                onclick="markBatchServed(${batch.tableId}, '${safeBatchId}')"
            >
                ✓ Marcar este lote como servido
            </button>
        `;


        /* ==================================================
           12. AGREGAR LA TARJETA A LA PANTALLA DE COCINA
        ================================================== */

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
    const table = tables.find(
        t => Number(t.id) === Number(tableId)
    );

    if (!table) {
        showCustomAlert('No se encontró la mesa.');
        return;
    }

    if (!navigator.onLine) {
        showCustomAlert('Se necesita conexión a Internet para marcar el lote como servido.');
        return;
    }

    let modal = document.getElementById('serveBatchModal');

    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'serveBatchModal';

        modal.style.cssText = `
            position:fixed;
            inset:0;
            background:rgba(0,0,0,0.6);
            display:none;
            align-items:center;
            justify-content:center;
            z-index:9999;
            padding:20px;
        `;

        modal.innerHTML = `
            <div style="
                background:white;
                padding:22px;
                border-radius:14px;
                width:100%;
                max-width:360px;
                text-align:center;
                box-shadow:0 10px 30px rgba(0,0,0,0.2);
            ">
                <div style="font-size:36px;">🍽️</div>

                <h3 style="margin:10px 0;">Confirmar servicio</h3>

                <p id="serveBatchMessage" style="color:#475569;"></p>

                <div style="display:flex; gap:10px; margin-top:20px;">
                    <button
                        id="serveBatchCancel"
                        style="
                            flex:1;
                            padding:12px;
                            border:none;
                            border-radius:8px;
                            background:#e2e8f0;
                            color:#334155;
                            font-weight:bold;
                        "
                    >
                        Cancelar
                    </button>

                    <button
                        id="serveBatchConfirm"
                        style="
                            flex:1;
                            padding:12px;
                            border:none;
                            border-radius:8px;
                            background:#16a34a;
                            color:white;
                            font-weight:bold;
                        "
                    >
                        Confirmar
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
    }

    const batchItems = (Array.isArray(table.items) ? table.items : [])
        .filter(item => {
            if (!item.sentToKitchen || item.served) return false;

            // Lotes nuevos: identificar por kitchenBatchId.
            if (item.kitchenBatchId) {
                return item.kitchenBatchId === batchId;
            }

            // Compatibilidad con lotes antiguos.
            return `legacy_${item.sentAt}` === batchId;
        });

    if (batchItems.length === 0) {
        showCustomAlert('Este lote ya no tiene productos pendientes.');
        return;
    }

    const groupTitle = batchItems[0].kitchenGroup === 'entradas'
        ? 'entradas, sopas y bebidas'
        : 'platos principales y adicionales';

    document.getElementById('serveBatchMessage').textContent =
        `¿Marcar el lote de ${groupTitle} de la ${table.name} como servido?`;

    const confirmButton = document.getElementById('serveBatchConfirm');
    const cancelButton = document.getElementById('serveBatchCancel');

    modal.style.display = 'flex';

    cancelButton.onclick = () => {
        modal.style.display = 'none';
    };

    // ==================================================
        // CONFIRMAR SERVICIO DEL LOTE
        // Consultar la versión más reciente de Firestore
        // para evitar sobrescribir cambios de otros usuarios.
        // ==================================================
    confirmButton.onclick = async () => {
        confirmButton.disabled = true;
        confirmButton.textContent = 'Procesando...';

        try {
            // Obtener nuevamente la mesa actualizada desde Firebase.
            const documentId = table._docId || `mesa_${table.id}`;

            const latestTable = await window.RestoposDB.getById(
                'mesas',
                documentId
            );

            if (!latestTable) {
                throw new Error('No se encontró la mesa en Firebase.');
            }

            const latestItems = Array.isArray(latestTable.items)
                ? latestTable.items
                : [];

            // Actualizar únicamente los productos del lote seleccionado.
            const updatedItems = latestItems.map(item => {
                if (!item.sentToKitchen || item.served) {
                    return item;
                }

                const belongsToBatch = item.kitchenBatchId
                    ? item.kitchenBatchId === batchId
                    : `legacy_${item.sentAt}` === batchId;

                if (!belongsToBatch) {
                    return item;
                }

                return {
                    ...item,
                    served: true,
                    pickedUp: false
                };
            });

            await window.RestoposDB.update(
                'mesas',
                documentId,
                {
                    items: updatedItems
                }
            );

            // Actualizar la mesa local más reciente.
            const currentTable = tables.find(
                t => Number(t.id) === Number(tableId)
            );

            if (currentTable) {
                currentTable.items = updatedItems;
            }

            appConfig.lastUpdated = Date.now();
            saveData();

            renderKitchenOrders();

            modal.style.display = 'none';

            showCustomAlert('Comanda atendida correctamente.');

        } catch (error) {
            console.error(
                'RESTOPOS: Error marcando lote como servido:',
                error
            );

            showCustomAlert('No fue posible actualizar el lote en Firebase.');

        } finally {
            confirmButton.disabled = false;
            confirmButton.textContent = 'Confirmar';
        }
    };
}


/* ========================================================== */
/* GUARDAR Y SINCRONIZAR EL TIEMPO LÍMITE DE COCINA           */
/* ========================================================== */

async function saveKitchenTimerConfig() {
    const entryTimerInput = document.getElementById('kitchenEntryTimerParam');
    const entryAlarmInput = document.getElementById('kitchenEntryAlarmParam');
    const mainTimerInput = document.getElementById('kitchenMainTimerParam');
    const mainAlarmInput = document.getElementById('kitchenMainAlarmParam');

    if (!entryTimerInput || !entryAlarmInput || !mainTimerInput || !mainAlarmInput) {
        console.error('RESTOPOS: No se encontraron todos los campos de configuración de cocina.');
        return;
    }

    const entryTimer = parseInt(entryTimerInput.value, 10);
    const entryAlarm = parseInt(entryAlarmInput.value, 10);
    const mainTimer = parseInt(mainTimerInput.value, 10);
    const mainAlarm = parseInt(mainAlarmInput.value, 10);

    if (
        !Number.isInteger(entryTimer) || entryTimer < 1 || entryTimer > 60 ||
        !Number.isInteger(mainTimer) || mainTimer < 1 || mainTimer > 60
    ) {
        showCustomAlert('Los tiempos deben estar entre 1 y 60 minutos.');

        entryTimerInput.value = appConfig.kitchenEntryTimerMinutes;
        mainTimerInput.value = appConfig.kitchenMainTimerMinutes;
        return;
    }

    if (
        !Number.isInteger(entryAlarm) || entryAlarm < 1 || entryAlarm > 99 ||
        !Number.isInteger(mainAlarm) || mainAlarm < 1 || mainAlarm > 99
    ) {
        showCustomAlert('Los porcentajes de alarma deben estar entre 1 y 99.');

        entryAlarmInput.value = appConfig.kitchenEntryAlarmPercent;
        mainAlarmInput.value = appConfig.kitchenMainAlarmPercent;
        return;
    }

    const updatedConfig = {
        kitchenEntryTimerMinutes: entryTimer,
        kitchenEntryAlarmPercent: entryAlarm,
        kitchenMainTimerMinutes: mainTimer,
        kitchenMainAlarmPercent: mainAlarm,
        lastUpdated: Date.now()
    };

    try {
        await window.RestoposDB.set(
            'configuracion',
            'general',
            updatedConfig,
            true
        );

        appConfig = {
            ...appConfig,
            ...updatedConfig
        };

        localStorage.setItem(
            'restopos_config',
            JSON.stringify(appConfig)
        );

        renderKitchenOrders();

        showCustomAlert(
            '✅ Configuración de tiempos y alarmas guardada correctamente.'
        );

    } catch (error) {
        console.error(
            'RESTOPOS: Error guardando la configuración de cocina:',
            error
        );

        entryTimerInput.value = appConfig.kitchenEntryTimerMinutes;
        entryAlarmInput.value = appConfig.kitchenEntryAlarmPercent;
        mainTimerInput.value = appConfig.kitchenMainTimerMinutes;
        mainAlarmInput.value = appConfig.kitchenMainAlarmPercent;

        showCustomAlert(
            '❌ No fue posible guardar la configuración en Firebase.'
        );
    }
}
