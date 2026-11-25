/**
 * ==========================================================
 * SISTEMA RESTOPOS - GESTIÓN Y ADMINISTRACIÓN DE MESAS
 * MÓDULO: tables.js
 * ==========================================================
 */

/**
 * Renderiza la lista administrativa de mesas.
 */
function renderTablesAdmin() {
    const list = document.getElementById('tablesAdminList');
    if (!list) return;
    list.innerHTML = '';

    tables.forEach(t => {
        const item = document.createElement('div');
        item.className = 'product-row';
        item.innerHTML = `
            <div class="product-info">
                <span><strong>${t.name}</strong></span>
                <span style="font-size:0.75rem; color: var(--text-secondary); display:block; text-transform:uppercase;">Estado: ${t.status}</span>
            </div>
            <div class="product-actions">
                <button onclick="editTable(${t.id})" class="action-btn" title="Editar">✏️</button>
                <button onclick="deleteTable(${t.id})" class="action-btn" title="Eliminar">🗑️</button>
            </div>
        `;
        list.appendChild(item);
    });
}


/**
 * ==========================================================
 * GUARDAR MESA
 * Crea una mesa nueva o actualiza el nombre de una existente
 * directamente en Firebase Firestore.
 * ==========================================================
 */
async function saveNewTable() {

    // Comprobar que el dispositivo tenga conexión a internet.
    if (!navigator.onLine) {
        showCustomAlert(
            '❌ Acción bloqueada: Debe estar conectado a internet para crear o modificar mesas.'
        );
        return;
    }

    // Obtener y validar el nombre ingresado.
    const nameInput = document.getElementById('newTableName');
    const name = nameInput.value.trim();

    if (!name) {
        showCustomAlert('Ingrese el nombre de la mesa.');
        return;
    }

    // Determinar si se está editando una mesa existente.
    const wasEditing = editingTableId !== null;

    try {

        if (wasEditing) {

            // Buscar la mesa que se desea modificar.
            const table = tables.find(
                t => Number(t.id) === Number(editingTableId)
            );

            if (!table) {
                showCustomAlert('No se encontró la mesa que desea editar.');
                return;
            }

            // Obtener el identificador del documento en Firestore.
            const documentId = table._docId || `mesa_${table.id}`;

            // Actualizar únicamente el nombre de la mesa en Firebase.
            await window.RestoposDB.update(
                'mesas',
                documentId,
                {
                    name: name
                }
            );

            // Actualizar el nombre en los datos locales.
            table.name = name;

            // Finalizar el modo de edición.
            cancelEditTable();

        } else {

            // Calcular el siguiente identificador numérico disponible.
            const newId = tables.length > 0
                ? Math.max(...tables.map(t => Number(t.id) || 0)) + 1
                : 1;

            // Construir el registro inicial de la nueva mesa.
            const newTable = {
                id: newId,
                name: name,
                status: 'libre',
                items: [],
                receipts: []
            };

            // Crear el documento de la mesa en Firestore.
            await window.RestoposDB.set(
                'mesas',
                `mesa_${newId}`,
                newTable
            );

            // Incorporar la mesa a la lista local.
            tables.push({
                ...newTable,
                _docId: `mesa_${newId}`
            });
        }

        // Actualizar la fecha de modificación local.
        appConfig.lastUpdated = Date.now();

        // Guardar el estado local de la aplicación.
        saveData();

        // Limpiar el campo del formulario.
        nameInput.value = '';

        // Actualizar la lista visual de administración de mesas.
        renderTablesAdmin();

        // Confirmar la operación realizada.
        showCustomAlert(
            wasEditing
                ? 'Mesa actualizada correctamente en Firebase.'
                : 'Mesa creada correctamente en Firebase.'
        );

    } catch (error) {

        // Registrar los detalles del error para diagnóstico.
        console.error(
            'RESTOPOS: Error guardando mesa en Firebase:',
            error.code,
            error.message
        );

        // Informar que Firebase no pudo completar la operación.
        showCustomAlert(
            'No se pudo guardar la mesa en Firebase. Verifique su conexión e inténtelo nuevamente.'
        );
    }
}


/**
 * Carga una mesa en el formulario para editarla.
 */
function editTable(id) {
    if (!navigator.onLine) {
        showCustomAlert('❌ Acción bloqueada: No hay conexión a internet para editar mesas.');
        return;
    }
    const table = tables.find(t => t.id === id);
    if (table) {
        editingTableId = id;
        document.getElementById('newTableName').value = table.name;
        document.getElementById('btnCancelTableEdit').classList.remove('hidden');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
}


/**
 * Cancela la edición de una mesa.
 */
function cancelEditTable() {
    editingTableId = null;
    document.getElementById('newTableName').value = '';
    document.getElementById('btnCancelTableEdit').classList.add('hidden');
}


/**
 * ==========================================================
 * ELIMINAR MESA
 * Elimina definitivamente el documento de la mesa en Firestore.
 * ==========================================================
 */
async function deleteTable(id) {

    // Comprobar que exista conexión a internet.
    if (!navigator.onLine) {
        showCustomAlert(
            '❌ Acción bloqueada: Debe estar conectado a internet para eliminar mesas.'
        );
        return;
    }

    // Buscar la mesa que se desea eliminar.
    const table = tables.find(
        t => Number(t.id) === Number(id)
    );

    // Detener la operación si la mesa no existe.
    if (!table) return;

    // Verificar que la mesa no tenga comandas pendientes.
    const hasItems = Array.isArray(table.items)
        && table.items.length > 0;

    // Verificar que la mesa no tenga cuentas o recibos asociados.
    const hasReceipts = Array.isArray(table.receipts)
        && table.receipts.length > 0;

    // Impedir la eliminación de mesas ocupadas o con información asociada.
    if (
        table.status === 'ocupada' ||
        hasItems ||
        hasReceipts
    ) {
        showCustomAlert(
            'No se puede eliminar esta mesa porque tiene comandas, cuentas o recibos asociados.'
        );
        return;
    }

    // Solicitar confirmación mediante el popup personalizado.
    const confirmed = await showCustomConfirm(
        `¿Desea eliminar definitivamente ${table.name}?`
    );

    // Cancelar si el usuario no confirma.
    if (!confirmed) return;

    try {

        // Obtener el identificador real del documento en Firestore.
        const documentId = table._docId || `mesa_${table.id}`;

        // Eliminar definitivamente el documento de Firebase.
        await window.RestoposDB.remove(
            'mesas',
            documentId
        );

        // Retirar la mesa de la lista local.
        tables = tables.filter(
            t => Number(t.id) !== Number(id)
        );

        // Cancelar la edición si corresponde a la mesa eliminada.
        if (Number(editingTableId) === Number(id)) {
            cancelEditTable();
        }

        // Actualizar la fecha de modificación.
        appConfig.lastUpdated = Date.now();

        // Guardar los cambios en el almacenamiento local.
        saveData();

        // Actualizar la lista visual de administración.
        renderTablesAdmin();

        // Informar que la eliminación fue exitosa.
        showCustomAlert(
            'Mesa eliminada definitivamente de Firebase.'
        );

    } catch (error) {

        // Registrar el error para facilitar su diagnóstico.
        console.error(
            'RESTOPOS: Error eliminando mesa de Firebase:',
            error.code,
            error.message
        );

        // Informar que no se pudo completar la eliminación.
        showCustomAlert(
            'No se pudo eliminar la mesa. Verifique su conexión e inténtelo nuevamente.'
        );
    }
}
