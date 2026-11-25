/**
 * ==========================================================
 * ALERTA PERSONALIZADA
 * Muestra un popup con un mensaje y un botón para aceptar.
 * Permite ejecutar una función callback al cerrar la alerta.
 * ==========================================================
 */

function showCustomAlert(message, callback) {
    let alertOverlay = document.getElementById('customAlertModal');
    if (!alertOverlay) {
        alertOverlay = document.createElement('div');
        alertOverlay.id = 'customAlertModal';
        alertOverlay.style.cssText = "position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; z-index: 10001; padding: 1rem;";
        alertOverlay.innerHTML = `
            <div style="background: #fff; padding: 1.5rem; border-radius: 12px; width: 100%; max-width: 320px; text-align: center;">
                <h3>Aviso</h3>
                <p id="customAlertMessage" style="font-size: 0.9rem; margin-bottom: 1.2rem;"></p>
                <button type="button" id="customAlertOkBtn" class="btn btn-success" style="padding: 0.5rem 1.5rem; width: auto; background: #10b981; color: #fff; border: none; border-radius: 6px;">Aceptar</button>
            </div>
        `;
        document.body.appendChild(alertOverlay);
    }
    document.getElementById('customAlertMessage').innerText = message;
    alertOverlay.style.display = 'flex';
    document.getElementById('customAlertOkBtn').onclick = () => {
        alertOverlay.style.display = 'none';
        if (typeof callback === 'function') callback();
    };
}

/**
 * ==========================================================
 * CONFIRMACIÓN PERSONALIZADA
 * Muestra un popup blanco con botones Cancelar y Eliminar.
 * Devuelve true si el usuario confirma y false si cancela.
 * ==========================================================
 */
function showCustomConfirm(message) {

    // Buscar el modal existente para evitar crear duplicados.
    let confirmOverlay = document.getElementById('customConfirmModal');

    // Crear el modal si todavía no existe.
    if (!confirmOverlay) {

        confirmOverlay = document.createElement('div');
        confirmOverlay.id = 'customConfirmModal';

        // Aplicar el mismo estilo visual de showCustomAlert.
        confirmOverlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.6);
            display: none;
            align-items: center;
            justify-content: center;
            z-index: 10002;
            padding: 1rem;
        `;

        // Construir el contenido del popup.
        confirmOverlay.innerHTML = `
            <div style="
                background: #fff;
                padding: 1.5rem;
                border-radius: 12px;
                width: 100%;
                max-width: 320px;
                text-align: center;
                box-shadow: 0 10px 30px rgba(0,0,0,0.2);
            ">
                <h3 style="color: #1f2937; margin-top: 0;">
                    Confirmar eliminación
                </h3>

                <p id="customConfirmMessage"
                   style="font-size: 0.9rem; color: #374151; margin-bottom: 1.2rem;">
                </p>

                <div style="
                    display: flex;
                    justify-content: center;
                    gap: 0.7rem;
                ">
                    <button
                        type="button"
                        id="customConfirmCancelBtn"
                        style="
                            padding: 0.5rem 1rem;
                            background: #e5e7eb;
                            color: #374151;
                            border: none;
                            border-radius: 6px;
                        ">
                        Cancelar
                    </button>

                    <button
                        type="button"
                        id="customConfirmDeleteBtn"
                        style="
                            padding: 0.5rem 1rem;
                            background: #dc2626;
                            color: #fff;
                            border: none;
                            border-radius: 6px;
                        ">
                        Eliminar
                    </button>
                </div>
            </div>
        `;

        // Incorporar el modal al documento.
        document.body.appendChild(confirmOverlay);
    }

    // Mostrar el mensaje de forma segura como texto.
    document.getElementById('customConfirmMessage').innerText = message;

    // Mostrar el popup.
    confirmOverlay.style.display = 'flex';

    // Esperar la decisión del usuario.
    return new Promise(resolve => {

        // Obtener los botones del popup.
        const cancelBtn = document.getElementById('customConfirmCancelBtn');
        const deleteBtn = document.getElementById('customConfirmDeleteBtn');

        // Función común para cerrar el popup y devolver la decisión.
        const finishConfirmation = (confirmed) => {
            confirmOverlay.style.display = 'none';

            // Retirar los eventos para evitar ejecuciones duplicadas.
            cancelBtn.onclick = null;
            deleteBtn.onclick = null;

            resolve(confirmed);
        };

        // Cancelar la operación.
        cancelBtn.onclick = () => finishConfirmation(false);

        // Confirmar la operación.
        deleteBtn.onclick = () => finishConfirmation(true);
    });
}
