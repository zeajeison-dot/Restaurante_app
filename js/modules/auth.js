/**
 * ==========================================================
 * INICIALIZACIÓN Y RESTAURACIÓN DE SESIÓN
 * ==========================================================
 * Inicializa el proceso de autenticación cuando se carga
 * la aplicación.
 *
 * Cómo funciona:
 * - Escucha los cambios de estado de Firebase Authentication.
 * - Detecta si existe una sesión autenticada.
 * - Consulta el perfil del usuario en Firestore.
 * - Verifica que la cuenta esté activa y tenga un rol válido.
 * - Restaura la sesión y configura la interfaz según el rol.
 *
 * Dependencias:
 * - Firebase Authentication.
 * - Cloud Firestore: colección "usuarios".
 * - setupUserSession().
 * - showCustomAlert().
 */
window.onload = function() {
    auth.onAuthStateChanged(async function(firebaseUser) {

        if (!firebaseUser) {
            localStorage.removeItem('restopos_logged');
            localStorage.removeItem('restopos_current_user');
            localStorage.removeItem('restopos_current_role');

            document.getElementById('login-view').classList.remove('hidden');
            return;
        }

        try {
            const userDoc = await db
                .collection('usuarios')
                .doc(firebaseUser.uid)
                .get();

            if (!userDoc.exists) {
                await auth.signOut();
                showCustomAlert('La cuenta no tiene un perfil registrado en RESTOPOS.');
                return;
            }

            const userData = userDoc.data();
            const validRoles = ['admin', 'mesero', 'cocinero'];

            if (userData.activo !== true || !validRoles.includes(userData.rol)) {
                await auth.signOut();
                showCustomAlert('La cuenta está desactivada o no tiene un rol válido.');
                return;
            }

            localStorage.setItem('restopos_current_user', userData.nombre || userData.email);
            localStorage.setItem('restopos_current_role', userData.rol);

            setupUserSession(
                userData.nombre || userData.email,
                userData.rol,
                false
            );

        } catch (error) {
            console.error('RESTOPOS - Error al restaurar sesión:', error);

            showCustomAlert(
                'Error verificando perfil: ' +
                (error.code || 'sin código') +
                ' - ' +
                (error.message || 'Sin descripción')
            );

            await auth.signOut();
        }
    });
};


/**
 * ==========================================================
 * INICIO DE SESIÓN
 * ==========================================================
 * Autentica al usuario mediante Firebase Authentication.
 *
 * Cómo funciona:
 * - Valida que se hayan ingresado correo y contraseña.
 * - Comprueba que exista conexión a internet.
 * - Envía las credenciales a Firebase Authentication.
 * - Gestiona los posibles errores de autenticación.
 *
 * La restauración del perfil y la configuración de la
 * interfaz se realizan mediante onAuthStateChanged().
 *
 * Dependencias:
 * - Firebase Authentication.
 * - showCustomAlert().
 */

async function login() {
    const emailInput = document.getElementById('userInput').value.trim();
    const passInput = document.getElementById('passInput').value;

    if (!emailInput || !passInput) {
        showCustomAlert('Ingrese correo electrónico y contraseña.');
        return;
    }

    if (!navigator.onLine) {
        showCustomAlert('Se necesita conexión a internet para iniciar sesión.');
        return;
    }

    try {
        showCustomAlert('🔄 Verificando credenciales con Firebase...');

        await auth.signInWithEmailAndPassword(
            emailInput,
            passInput
        );

        const alertOverlay = document.getElementById('customAlertModal');
        if (alertOverlay) alertOverlay.style.display = 'none';

        // La sesión y el perfil se procesan en onAuthStateChanged.

    } catch (error) {
        console.error('RESTOPOS - Error de inicio de sesión:', error);

        const alertOverlay = document.getElementById('customAlertModal');
        if (alertOverlay) alertOverlay.style.display = 'none';

        let message = 'No fue posible iniciar sesión.';

        if (error.code === 'auth/invalid-email') {
            message = 'El correo electrónico no tiene un formato válido.';
        } else if (
            error.code === 'auth/invalid-credential' ||
            error.code === 'auth/wrong-password' ||
            error.code === 'auth/user-not-found'
        ) {
            message = 'Correo electrónico o contraseña incorrectos.';
        } else if (error.code === 'auth/too-many-requests') {
            message = 'Demasiados intentos. Espera unos minutos.';
        } else if (error.code === 'auth/network-request-failed') {
            message = 'Error de conexión. Comprueba tu internet.';
        }

        showCustomAlert(message);
    }
}


/**
 * ==========================================================
 * CONFIGURACIÓN DE SESIÓN SEGÚN EL ROL
 * ==========================================================
 * Configura la interfaz de RESTOPOS después de autenticar
 * y validar el perfil del usuario.
 *
 * Cómo funciona:
 * - Oculta la pantalla de inicio de sesión.
 * - Muestra el nombre y el rol del usuario.
 * - Carga los parámetros de configuración disponibles.
 * - Redirige al usuario a la sección correspondiente
 *   según su rol: administrador, mesero o cocinero.
 *
 * Parámetros:
 * @param {string} username - Nombre o correo del usuario.
 * @param {string} role - Rol asignado al usuario.
 * @param {boolean} isNewLogin - Indica si es un inicio
 *                               de sesión nuevo.
 *
 * Dependencias:
 * - appConfig.
 * - showSection().
 * - renderDashboardMenu().
 */

function setupUserSession(username, role, isNewLogin = false) {
    document.getElementById('login-view').classList.add('hidden');
    document.getElementById('welcome-msg').innerText = `Usuario: ${username}`;
    document.getElementById('userRoleBadge').innerText = `Rol: ${role}`;

    const alarmParamInput = document.getElementById('waiterAlarmIntervalParam');
    if (alarmParamInput) {
        alarmParamInput.value = appConfig.waiterAlarmInterval || 20;
    }

    if (isNewLogin) {
        if (role === 'cocinero') {
            showSection('kitchen-section');
            return;
        } else if (role === 'mesero') {
            showSection('tables-section');
            return;
        }
    }

    if (role === 'admin') {
        showSection('dashboard-view');
        renderDashboardMenu(role);
    } else if (role === 'cocinero') {
        showSection('kitchen-section');
    } else if (role === 'mesero') {
        showSection('tables-section');
    }
}


/**
 * ==========================================================
 * CIERRE DE SESIÓN
 * ==========================================================
 * Finaliza la sesión autenticada del usuario.
 *
 * Cómo funciona:
 * - Cierra la sesión mediante Firebase Authentication.
 * - Limpia los datos de sesión almacenados localmente.
 * - Oculta las secciones de la aplicación.
 * - Restablece la pantalla de inicio de sesión.
 * - Limpia los campos de acceso.
 *
 * Dependencias:
 * - Firebase Authentication.
 * - localStorage.
 * - Elementos de la interfaz de RESTOPOS.
 */

async function logout() {
    try {
        await auth.signOut();

        localStorage.removeItem('restopos_logged');
        localStorage.removeItem('restopos_current_user');
        localStorage.removeItem('restopos_current_role');

        const sections = [
            'dashboard-view',
            'tables-section',
            'kitchen-section',
            'users-admin-section',
            'tables-admin-section',
            'order-section',
            'bill-section',
            'catalog-section',
            'dashboard-analytics-section'
        ];

        sections.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.classList.add('hidden');
        });

        document.getElementById('login-view').classList.remove('hidden');
        document.getElementById('userInput').value = '';
        document.getElementById('passInput').value = '';

    } catch (error) {
        console.error('RESTOPOS - Error al cerrar sesión:', error);
        showCustomAlert('No fue posible cerrar la sesión. Intenta nuevamente.');
    }
}