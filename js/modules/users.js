
/**
 * ==========================================================
 * MÓDULO DE GESTIÓN DE USUARIOS Y PERMISOS
 * ==========================================================
 */

/**
 * ==========================================================
 * RENDERIZAR USUARIOS REGISTRADOS EN FIRESTORE
 * ==========================================================
 */
function renderUsersAdmin() {
    const list = document.getElementById('usersList');
    if (!list) return;

    list.innerHTML = '';

    if (!Array.isArray(users) || users.length === 0) {
        list.innerHTML = `
            <p style="text-align:center;color:var(--text-secondary);padding:1rem;">
                No hay usuarios registrados.
            </p>
        `;
        return;
    }

    users.forEach(user => {
        const item = document.createElement('div');
        item.className = 'product-row';

        const userId = user._docId || user.uid;
        const role = user.rol || 'sin rol';
        const status = user.activo === true ? 'Activo' : 'Desactivado';

        item.innerHTML = `
            <div class="product-info">
                <span><strong>${user.nombre || 'Sin nombre'}</strong></span>

                <span style="font-size:0.75rem;color:var(--text-secondary);display:block;">
                    ${user.email || 'Sin correo'}
                </span>

                <span style="font-size:0.75rem;color:var(--text-secondary);display:block;text-transform:uppercase;">
                    Rol: ${role}
                </span>

                <span style="font-size:0.75rem;display:block;color:${user.activo === true ? '#16a34a' : '#dc2626'};">
                    ${status}
                </span>
            </div>

            <div class="product-actions">
                <button
                    onclick="editUser('${userId}')"
                    class="action-btn"
                    title="Editar"
                >✏️</button>

                <button
                    onclick="deleteUser('${userId}')"
                    class="action-btn"
                    title="Eliminar"
                >🗑️</button>
            </div>
        `;

        list.appendChild(item);
    });
}


/**
 * ==========================================================
 * CREAR Y ACTUALIZAR USUARIOS CON FIREBASE
 * ==========================================================
 *
 * Firebase Authentication:
 * - Crea las cuentas de los empleados.
 * - Gestiona las contraseñas.
 *
 * Firestore:
 * - Guarda nombre, correo, rol y estado.
 * - Utiliza el UID de Authentication como ID del documento.
 *
 * Se utiliza una segunda instancia de Firebase Auth para
 * conservar abierta la sesión del administrador.
 *
 * ==========================================================
 */
async function saveUser() {

    if (!navigator.onLine) {
        showCustomAlert('❌ Se necesita conexión a internet.');
        return;
    }

    const name = document.getElementById('newUserName').value.trim();
    const email = document.getElementById('newUserEmail').value.trim().toLowerCase();
    const pass = document.getElementById('newUserPass').value;
    const role = document.getElementById('newUserRole').value;
    const isActive = document.getElementById('newUserStatus').value === 'true';

    const emailInput = document.getElementById('newUserEmail');
    const btnSave = document.getElementById('btnSaveUser');

    // Validar nombre.
    if (!name) {
        showCustomAlert('Ingrese el nombre del empleado.');
        return;
    }

    // Validar correo.
    if (!email || !emailInput.checkValidity()) {
        showCustomAlert('Ingrese un correo electrónico válido.');
        return;
    }

    // Validar rol permitido.
    if (!['admin', 'mesero', 'cocinero'].includes(role)) {
        showCustomAlert('El rol seleccionado no es válido.');
        return;
    }

    const isEditing = editingUserId !== null;

    // La contraseña solo es obligatoria al crear una cuenta.
    if (!isEditing && (!pass || pass.length < 6)) {
        showCustomAlert(
            'La contraseña debe tener al menos 6 caracteres.'
        );
        return;
    }

    btnSave.disabled = true;
    btnSave.innerText = 'Guardando...';

    try {

        // ==================================================
        // 1. ACTUALIZAR USUARIO EXISTENTE EN FIRESTORE
        // ==================================================

        if (isEditing) {

            const user = users.find(
                u => (u._docId || u.uid) === editingUserId
            );

            if (!user) {
                throw new Error('No se encontró el usuario seleccionado.');
            }

            // No permitir cambiar el correo desde esta función.
            // El correo de acceso pertenece a Authentication.
            const existingEmail = String(user.email || '').trim().toLowerCase();

            if (email !== existingEmail) {
                throw new Error(
                    'No se puede cambiar el correo de acceso desde la edición. Se conserva el correo registrado en Firebase Authentication.'
                );
            }

            // No permitir desactivar la cuenta del administrador actual.
            if (
                window.auth.currentUser &&
                window.auth.currentUser.uid === editingUserId &&
                !isActive
            ) {
                throw new Error(
                    'No puedes desactivar tu propia cuenta mientras estás administrando RESTOPOS.'
                );
            }

            // Evitar que el sistema se quede sin administradores activos.
            const remainsAdmin = role === 'admin' && isActive;

            if (user.rol === 'admin' && user.activo === true && !remainsAdmin) {
                const otherActiveAdmins = users.filter(
                    u =>
                        (u._docId || u.uid) !== editingUserId &&
                        u.rol === 'admin' &&
                        u.activo === true
                );

                if (otherActiveAdmins.length === 0) {
                    throw new Error(
                        'No puedes desactivar o cambiar el rol del último administrador activo.'
                    );
                }
            }

            // Guardar los cambios en Firestore.
            await window.RestoposDB.update(
                'usuarios',
                editingUserId,
                {
                    nombre: name,
                    rol: role,
                    activo: isActive,
                    updatedAt: Date.now()
                }
            );

            // Actualizar los datos locales.
            user.nombre = name;
            user.rol = role;
            user.activo = isActive;
            user.updatedAt = Date.now();

            localStorage.setItem(
                'restopos_users',
                JSON.stringify(users)
            );

            // Actualizar la información local.
            user.nombre = name;
            user.rol = role;

            cancelEditUser();
            renderUsersAdmin();

            showCustomAlert(
                '✅ Datos del empleado actualizados correctamente en Firebase.'
            );

            return;
        }

        // ==================================================
        // 2. CREAR NUEVA CUENTA EN FIREBASE AUTHENTICATION
        // ==================================================

        const secondaryAppName = 'restoposUserCreation';

        // Reutilizar la instancia secundaria si ya existe.
        let secondaryApp = firebase.apps.find(
            app => app.name === secondaryAppName
        );

        // Crear una instancia secundaria independiente.
        if (!secondaryApp) {
            secondaryApp = firebase.initializeApp(
                window.firebaseApp.options,
                secondaryAppName
            );
        }

        const secondaryAuth = secondaryApp.auth();

        let createdAuthUser = null;
        let firestoreSaved = false;

        try {

            // Crear la cuenta sin cerrar la sesión principal.
            const credential = await secondaryAuth
                .createUserWithEmailAndPassword(email, pass);

            createdAuthUser = credential.user;

            const uid = createdAuthUser.uid;

            // ==================================================
            // 3. GUARDAR PERFIL DEL EMPLEADO EN FIRESTORE
            // ==================================================

            const userData = {
                nombre: name,
                email: email,
                rol: role,
                activo: true,
                createdAt: Date.now()
            };

            await window.RestoposDB.set(
                'usuarios',
                uid,
                userData,
                false
            );

            firestoreSaved = true;

            // Incorporar el nuevo empleado a la lista local.
            users.push({
                ...userData,
                _docId: uid
            });

            // Cerrar únicamente la sesión secundaria.
            await secondaryAuth.signOut();

            cancelEditUser();
            renderUsersAdmin();

            showCustomAlert(
                '✅ Usuario creado correctamente en Firebase Authentication y Firestore.'
            );

        } catch (error) {

            // Si Auth creó la cuenta pero Firestore falló,
            // intentar eliminar la cuenta incompleta.
            if (createdAuthUser && !firestoreSaved) {
                try {
                    await createdAuthUser.delete();
                } catch (deleteError) {
                    console.error(
                        'No se pudo revertir la cuenta incompleta:',
                        deleteError
                    );
                }
            }

            try {
                await secondaryAuth.signOut();
            } catch (signOutError) {
                console.warn(
                    'No se pudo cerrar la sesión secundaria:',
                    signOutError
                );
            }

            throw error;
        }

    } catch (error) {

        console.error(
            'RESTOPOS: Error guardando usuario:',
            error.code,
            error.message
        );

        let message = 'No fue posible guardar el usuario.';

        if (error.code === 'auth/email-already-in-use') {
            message = 'Este correo electrónico ya está registrado en Firebase Authentication.';
        } else if (error.code === 'auth/invalid-email') {
            message = 'El correo electrónico no es válido.';
        } else if (error.code === 'auth/weak-password') {
            message = 'La contraseña es demasiado débil.';
        } else if (error.code === 'permission-denied') {
            message = 'Firebase no autorizó la operación. Comprueba los permisos del administrador.';
        } else if (error.message) {
            message = error.message;
        }

        showCustomAlert('❌ ' + message);

    } finally {

        btnSave.disabled = false;

        btnSave.innerText = editingUserId !== null
            ? 'Guardar Cambios'
            : 'Crear Usuario';
    }
}


/**
 * ==========================================================
 * EDITAR USUARIO REGISTRADO EN FIRESTORE
 * ==========================================================
 */
function editUser(uid) {
    if (!navigator.onLine) {
        showCustomAlert('❌ Sin conexión a internet.');
        return;
    }

    const user = users.find(
        u => (u._docId || u.uid) === uid
    );

    if (!user) {
        showCustomAlert('No se encontró el usuario seleccionado.');
        return;
    }

    // Guardar el UID del usuario que se está editando.
    editingUserId = uid;

    // Cargar los datos actuales del empleado.
    document.getElementById('newUserName').value =
        user.nombre || '';

    document.getElementById('newUserEmail').value =
        user.email || '';
    document.getElementById('newUserEmail').readOnly = true;

    // Firebase no permite recuperar contraseñas.
    // Se deja vacío para conservar la contraseña actual.
    document.getElementById('newUserPass').value = '';

    document.getElementById('newUserRole').value =
        user.rol || 'mesero';

    document.getElementById('newUserStatus').value =
        user.activo === true ? 'true' : 'false';

    // Actualizar textos del formulario.
    document.getElementById('formUserTitle').innerText =
        'Editar empleado';

    document.getElementById('btnSaveUser').innerText =
        'Guardar Cambios';

    document.getElementById('userPasswordHelp').innerText =
        'Deja este campo vacío para conservar la contraseña actual.';

    document.getElementById('btnCancelUserEdit')
        .classList.remove('hidden');

    window.scrollTo({
        top: 0,
        behavior: 'smooth'
    });
}


/**
 * ==========================================================
 * CANCELAR EDICIÓN DE USUARIO
 * ==========================================================
 */
function cancelEditUser() {
    editingUserId = null;

    document.getElementById('newUserName').value = '';
    document.getElementById('newUserEmail').value = '';
    document.getElementById('newUserEmail').readOnly = false;
    document.getElementById('newUserPass').value = '';

    document.getElementById('newUserRole').value = 'mesero';
    document.getElementById('newUserStatus').value = 'true';

    document.getElementById('formUserTitle').innerText =
        '👥 Gestión de Usuarios y Permisos';

    document.getElementById('btnSaveUser').innerText =
        'Crear Usuario';

    document.getElementById('userPasswordHelp').innerText =
        'Obligatoria para crear una cuenta. Déjala vacía al editar.';

    document.getElementById('btnCancelUserEdit')
        .classList.add('hidden');
}


/**
 * ==========================================================
 * DESACTIVAR USUARIOS EN FIRESTORE
 * ==========================================================
 *
 * No elimina la cuenta de Firebase Authentication.
 * Cambia activo a false para impedir el acceso a Firestore.
 *
 * Conserva los registros históricos del empleado.
 * ==========================================================
 */
async function deleteUser(id) {

    if (!navigator.onLine) {
        showCustomAlert('❌ Sin conexión a internet.');
        return;
    }

    // Buscar al empleado por su UID de Firebase.
    const user = users.find(
        u => String(u._docId || u.uid) === String(id)
    );

    if (!user) {
        showCustomAlert('No se encontró el empleado seleccionado.');
        return;
    }

    const userId = user._docId || user.uid;

    // No permitir desactivar la cuenta que está administrando el sistema.
    if (
        window.auth &&
        window.auth.currentUser &&
        window.auth.currentUser.uid === userId
    ) {
        showCustomAlert(
            'No puedes desactivar tu propia cuenta de administrador.'
        );
        return;
    }

    // Evitar dejar el sistema sin administradores activos.
    if (user.rol === 'admin') {
        const activeAdmins = users.filter(
            u => u.rol === 'admin' && u.activo === true
        );

        if (activeAdmins.length <= 1) {
            showCustomAlert(
                'No puedes desactivar el último administrador activo.'
            );
            return;
        }
    }

    const employeeName = user.nombre || user.email || 'este empleado';

    const confirmed = await showCustomConfirm(
        `¿Deseas desactivar a "${employeeName}"?\n\nEl empleado perderá el acceso al sistema, pero sus registros históricos se conservarán.`
    );

    if (!confirmed) {
        return;
    }

    try {

        // Actualizar el estado directamente en Firestore.
        await window.RestoposDB.update(
            'usuarios',
            userId,
            {
                activo: false,
                updatedAt: Date.now()
            }
        );

        // Actualizar la lista local.
        user.activo = false;
        user.updatedAt = Date.now();

        // Cancelar edición si corresponde.
        if (editingUserId === userId) {
            cancelEditUser();
        }

        localStorage.setItem(
            'restopos_users',
            JSON.stringify(users)
        );

        renderUsersAdmin();

        showCustomAlert(
            '✅ Empleado desactivado correctamente en Firebase.'
        );

        console.log(
            'RESTOPOS: Usuario desactivado:',
            userId
        );

    } catch (error) {

        console.error(
            'RESTOPOS: Error desactivando usuario:',
            error.code,
            error.message
        );

        showCustomAlert(
            '❌ No fue posible desactivar el empleado en Firebase.'
        );
    }
}
