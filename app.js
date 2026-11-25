/**
 * ==========================================================
 * SISTEMA RESTOPOS - CONTROL Y GESTIÓN DE RESTAURANTE
 * ARCHIVO PRINCIPAL DE LÓGICA DE NEGOCIO (app.js)
 * ==========================================================
 */

/* ========================================================== */
/* 1. VARIABLES GLOBALES Y ESTADO INICIAL VACÍO               */
/* ========================================================== */

/*
const WEB_APP_URL = "https://script.google.com/macros/s/AKfycbzhezTR3M0sdvL83xWy8EwUrHfIpmG841DT0kd85rzuYaCB4iauIvDNoON8xIdjW93XmA/exec";
//const WEB_APP_URL = "https://script.google.com/macros/s/TU_ID/exec?action=getLastUpdated";


// Inicializadas vacías para garantizar que toda la data provenga estrictamente de Google Sheets
let tables = [];
let users = [];
let addons = [];
let products = [];
let drinks = [];
let salesHistory = [];
let appConfig = {
    waiterAlarmInterval: 20,
    waiterCanGenerateReceipt: true,
    lastUpdated: Date.now()
};

let currentTableId = null;
let editingProductId = null;
let editingDrinkId = null;
let editingAddonId = null;
let editingTableId = null;
let editingUserId = null;
let currentPlusCategory = 'sopas';

// Controladores de intervalos en memoria
let kitchenInterval = null;
let kitchenCloudPollInterval = null;
let tablesRefreshInterval = null;
let lastKitchenAlarmTime = 0;
let lastWaiterAlarmTime = 0;

*/

/* ========================================================== */
/* 1. INICIALIZACIÓN DE SESIÓN                                */
/* ========================================================== */

/**
 * Inicializa la aplicación al cargar la ventana.
 * Cómo lo realiza: Restaura la sesión activa si existe o precarga exclusivamente los usuarios.
 * Consulta a Sheets: Llama a `loadUsersAndConfigFromCloud()` (Tablas: `Usuarios` y `Config`).
 */
// window.onload = function() {
//     auth.onAuthStateChanged(async function(firebaseUser) {

//         if (!firebaseUser) {
//             localStorage.removeItem('restopos_logged');
//             localStorage.removeItem('restopos_current_user');
//             localStorage.removeItem('restopos_current_role');

//             document.getElementById('login-view').classList.remove('hidden');
//             return;
//         }

//         try {
//             const userDoc = await db
//                 .collection('usuarios')
//                 .doc(firebaseUser.uid)
//                 .get();

//             if (!userDoc.exists) {
//                 await auth.signOut();
//                 showCustomAlert('La cuenta no tiene un perfil registrado en RESTOPOS.');
//                 return;
//             }

//             const userData = userDoc.data();
//             const validRoles = ['admin', 'mesero', 'cocinero'];

//             if (userData.activo !== true || !validRoles.includes(userData.rol)) {
//                 await auth.signOut();
//                 showCustomAlert('La cuenta está desactivada o no tiene un rol válido.');
//                 return;
//             }

//             localStorage.setItem('restopos_current_user', userData.nombre || userData.email);
//             localStorage.setItem('restopos_current_role', userData.rol);

//             setupUserSession(
//                 userData.nombre || userData.email,
//                 userData.rol,
//                 false
//             );

//         } catch (error) {
//             console.error('RESTOPOS - Error al restaurar sesión:', error);

//             showCustomAlert(
//                 'Error verificando perfil: ' +
//                 (error.code || 'sin código') +
//                 ' - ' +
//                 (error.message || 'Sin descripción')
//             );

//             await auth.signOut();
//         }
//     });
// };



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
 * Valida las credenciales ingresadas consultando estrictamente la tabla de usuarios.
 * Cómo lo realiza: Consulta la nube mediante el endpoint ligero, valida el rol y usuario.
 * Consulta a Sheets: Llama a `loadUsersAndConfigFromCloud()` (Tabla: `Usuarios`).
 */

// async function login() {
//     const emailInput = document.getElementById('userInput').value.trim();
//     const passInput = document.getElementById('passInput').value;

//     if (!emailInput || !passInput) {
//         showCustomAlert('Ingrese correo electrónico y contraseña.');
//         return;
//     }

//     if (!navigator.onLine) {
//         showCustomAlert('Se necesita conexión a internet para iniciar sesión.');
//         return;
//     }

//     try {
//         showCustomAlert('🔄 Verificando credenciales con Firebase...');

//         await auth.signInWithEmailAndPassword(
//             emailInput,
//             passInput
//         );

//         const alertOverlay = document.getElementById('customAlertModal');
//         if (alertOverlay) alertOverlay.style.display = 'none';

//         // La sesión y el perfil se procesan en onAuthStateChanged.

//     } catch (error) {
//         console.error('RESTOPOS - Error de inicio de sesión:', error);

//         const alertOverlay = document.getElementById('customAlertModal');
//         if (alertOverlay) alertOverlay.style.display = 'none';

//         let message = 'No fue posible iniciar sesión.';

//         if (error.code === 'auth/invalid-email') {
//             message = 'El correo electrónico no tiene un formato válido.';
//         } else if (
//             error.code === 'auth/invalid-credential' ||
//             error.code === 'auth/wrong-password' ||
//             error.code === 'auth/user-not-found'
//         ) {
//             message = 'Correo electrónico o contraseña incorrectos.';
//         } else if (error.code === 'auth/too-many-requests') {
//             message = 'Demasiados intentos. Espera unos minutos.';
//         } else if (error.code === 'auth/network-request-failed') {
//             message = 'Error de conexión. Comprueba tu internet.';
//         }

//         showCustomAlert(message);
//     }
// }


/**
 * Configura la interfaz gráfica y redirige a la vista inicial según el rol.
 * Cómo lo realiza: Muestra el rol y nombre, y direcciona al módulo correspondiente.
 * Consulta a Sheets: Ninguna directa.
 */
// function setupUserSession(username, role, isNewLogin = false) {
//     document.getElementById('login-view').classList.add('hidden');
//     document.getElementById('welcome-msg').innerText = `Usuario: ${username}`;
//     document.getElementById('userRoleBadge').innerText = `Rol: ${role}`;

//     const alarmParamInput = document.getElementById('waiterAlarmIntervalParam');
//     if (alarmParamInput) {
//         alarmParamInput.value = appConfig.waiterAlarmInterval || 20;
//     }

//     if (isNewLogin) {
//         if (role === 'cocinero') {
//             showSection('kitchen-section');
//             return;
//         } else if (role === 'mesero') {
//             showSection('tables-section');
//             return;
//         }
//     }

//     if (role === 'admin') {
//         showSection('dashboard-view');
//         renderDashboardMenu(role);
//     } else if (role === 'cocinero') {
//         showSection('kitchen-section');
//     } else if (role === 'mesero') {
//         showSection('tables-section');
//     }
// }


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


/**
 * Dibuja las tarjetas del menú principal para el Administrador.
 * Cómo lo realiza: Inserta dinámicamente las tarjetas de navegación en `#dashboardMenuGrid`.
 * Consulta a Sheets: Ninguna.
 */
// function renderDashboardMenu(role) {
//     const grid = document.getElementById('dashboardMenuGrid');
//     if (!grid) return;

//     grid.innerHTML = '';

//     const menuCards = [
//         { title: '📊 Dashboard de Ventas', desc: 'Analíticas y resultados comerciales', action: "showSection('dashboard-analytics-section')" },
//         { title: '🪑 Mesas & Pedidos', desc: 'Control de salón', action: "showSection('tables-section')" },
//         { title: '👨‍🍳 Módulo de Cocina', desc: 'Comandas en tiempo real', action: "showSection('kitchen-section')" },
//         { title: '👥 Gestión de Usuarios', desc: 'Crear usuarios y permisos', action: "showSection('users-admin-section')" },
//         { title: '⚙️ Gestionar Mesas', desc: 'Crear / Editar mesas', action: "showSection('tables-admin-section')" },
//         { title: '🍔 Catálogo de Platos', desc: 'Platos, bebidas y adicionales', action: "showSection('catalog-section')" }
//     ];

//     menuCards.forEach(card => {
//         const div = document.createElement('div');
//         div.className = 'menu-card';
//         div.setAttribute('onclick', card.action);
//         div.innerHTML = `
//             <h3>${card.title}</h3>
//             <p style="font-size: 0.85rem; color: var(--text-secondary);">${card.desc}</p>
//         `;
//         grid.appendChild(div);
//     });
// }

/**
 * Cierra la sesión activa y retorna a la vista de login.
 * Cómo lo realiza: Borra las credenciales de localStorage y limpia las vistas.
 * Consulta a Sheets: Ninguna.
 */

// async function logout() {
//     try {
//         await auth.signOut();

//         localStorage.removeItem('restopos_logged');
//         localStorage.removeItem('restopos_current_user');
//         localStorage.removeItem('restopos_current_role');

//         const sections = [
//             'dashboard-view',
//             'tables-section',
//             'kitchen-section',
//             'users-admin-section',
//             'tables-admin-section',
//             'order-section',
//             'bill-section',
//             'catalog-section',
//             'dashboard-analytics-section'
//         ];

//         sections.forEach(id => {
//             const el = document.getElementById(id);
//             if (el) el.classList.add('hidden');
//         });

//         document.getElementById('login-view').classList.remove('hidden');
//         document.getElementById('userInput').value = '';
//         document.getElementById('passInput').value = '';

//     } catch (error) {
//         console.error('RESTOPOS - Error al cerrar sesión:', error);
//         showCustomAlert('No fue posible cerrar la sesión. Intenta nuevamente.');
//     }
// }

/**
 * Gestiona la navegación entre secciones aplicando control de acceso y limpiando intervalos.
 * Cómo lo realiza: Valida permisos por rol, detiene cronómetros previos, muestra la vista solicitada
 * y ejecuta la consulta de datos correspondiente al módulo.
 * Consulta a Sheets:
 * - `tables-section`: Consulta `getTablesAndProducts` (Mesas, Productos con Caché).
 * - `kitchen-section`: Consulta `getData` y sondeo ligero de `Config`.
 * - Otras secciones: Llama a `loadDataFromCloud()`.
 */

// async function showSection(sectionId) {
//     const role = localStorage.getItem('restopos_current_role') || 'admin';

//     if (sectionId === 'dashboard-analytics-section' && role !== 'admin') {
//         showCustomAlert('❌ Acceso denegado: El módulo de Dashboard es exclusivo para el rol de Administrador.');
//         return;
//     }

//     if (role === 'mesero' && !['tables-section', 'order-section', 'bill-section'].includes(sectionId)) {
//         showCustomAlert('Acceso no autorizado para el rol de mesero.');
//         return;
//     }

//     if (role === 'cocinero' && sectionId !== 'kitchen-section') {
//         showCustomAlert('Acceso no autorizado para el rol de cocinero.');
//         return;
//     }

//     // CORRECCIÓN: No descargar datos pesados en el menú principal, mesas, dashboard analítico, catálogo ni pedidos, comandas tampoco
//     if (![
//         'dashboard-view',
//         'tables-section',
//         'dashboard-analytics-section',
//         'catalog-section',
//         'tables-admin-section',
//         'order-section',
//         'kitchen-section'].includes(sectionId)) {
//         await loadDataFromCloud();
//     }

//     const sections = [
//         'dashboard-view', 'tables-section', 'kitchen-section', 'users-admin-section',
//         'tables-admin-section', 'order-section', 'bill-section', 'catalog-section',
//         'dashboard-analytics-section'
//     ];

//     sections.forEach(id => {
//         const el = document.getElementById(id);
//         if (el) el.classList.add('hidden');
//     });

//     const target = document.getElementById(sectionId);
//     if (target) target.classList.remove('hidden');

//     if (kitchenInterval) {
//         clearInterval(kitchenInterval);
//         kitchenInterval = null;
//     }

//     if (kitchenCloudPollInterval) {
//         clearInterval(kitchenCloudPollInterval);
//         kitchenCloudPollInterval = null;
//     }

//     // Desconectar escuchador anterior de Firestore
//     if (kitchenFirestoreUnsubscribe) {
//         kitchenFirestoreUnsubscribe();
//         kitchenFirestoreUnsubscribe = null;
//     }

//     if (tablesRefreshInterval) {
//         clearInterval(tablesRefreshInterval);
//         tablesRefreshInterval = null;
//     }
//     document.querySelectorAll('.admin-back-btn').forEach(btn => {
//         btn.style.display = (role === 'admin') ? 'block' : 'none';
//     });

//     if (sectionId === 'dashboard-view') {
//         renderDashboardMenu(role);
//     } else if (sectionId === 'tables-section') {
//         const headerBar = document.getElementById('tablesHeaderBar');
//         const userTitle = document.getElementById('tablesUserTitle');
//         const roleBadge = document.getElementById('tablesRoleBadge');
//         const alarmCard = document.getElementById('waiterAlarmConfigCard');

//         if (role === 'mesero') {
//             userTitle.innerText = "Gestión de Mesas";
//             if (roleBadge) roleBadge.style.display = 'none';
//             headerBar.style.display = 'flex';
//             if (alarmCard) alarmCard.style.display = 'none';
//         } else if (role === 'admin') {
//             headerBar.style.display = 'none';
//             if (alarmCard) alarmCard.style.display = 'block';
//         }

//         // Carga inicial de mesas desde Firebase
//         try {
//             console.log('RESTOPOS: Consultando mesas en Firebase...');

//             const cloudTables = await window.RestoposDB.getAll('mesas');

//             if (Array.isArray(cloudTables)) {
//                 tables = cloudTables;
//                 saveData();

//                 console.log(
//                     'RESTOPOS: Mesas cargadas desde Firebase:',
//                     tables.length
//                 );
//             }

//         } catch (e) {
//             console.error(
//                 'RESTOPOS: Error cargando mesas desde Firebase:',
//                 e.code,
//                 e.message
//             );

//             console.warn('Se conservarán las mesas locales.');
//         }

//         renderTables();

//         // ⬇️ AGREGAN AQUÍ LA LÍNEA NUEVA: ⬇️
//         checkWaiterReadyAlarm();

//         // Actualización automática de mesas desde Firebase cada 60 segundos
//         // let isRefreshingTables = false;

        
//         // Escuchar cambios de mesas en tiempo real desde Firebase.
//         console.log(
//             'RESTOPOS: Activando escucha en tiempo real para mesas...'
//         );

//         kitchenFirestoreUnsubscribe = window.RestoposDB.listenCollection(
//             'mesas',

//             (cloudTables) => {

//                 const tablesSec = document.getElementById('tables-section');

//                 // Comprobar que la pantalla de mesas siga abierta.
//                 if (
//                     !tablesSec ||
//                     tablesSec.classList.contains('hidden')
//                 ) {
//                     return;
//                 }

//                 if (Array.isArray(cloudTables)) {

//                     // Actualizar las mesas con los datos de Firebase.
//                     tables = cloudTables;

//                     // Guardar los datos locales.
//                     saveData();

//                     // Actualizar visualmente las mesas.
//                     renderTables();

//                     // Comprobar si cocina atendió alguna comanda.
//                     checkWaiterReadyAlarm();

//                     console.log(
//                         'RESTOPOS: Mesas sincronizadas en tiempo real.',
//                         'Mesas:',
//                         tables.length
//                     );
//                 }
//             },

//             (error) => {
//                 console.error(
//                     'RESTOPOS: Error en escucha de mesas:',
//                     error.code,
//                     error.message
//                 );
//             }
//         );


//     } else if (sectionId === 'tables-admin-section') {
//         cancelEditTable();

//         // Consultar mesas desde Firebase
//         try {
//             console.log('RESTOPOS: Cargando administración de mesas desde Firebase...');

//             const cloudTables = await window.RestoposDB.getAll('mesas');

//             if (Array.isArray(cloudTables)) {
//                 tables = cloudTables;
//                 saveData();

//                 console.log(
//                     'RESTOPOS: Mesas disponibles para administración:',
//                     tables.length
//                 );
//             }

//         } catch (e) {
//             console.error(
//                 'RESTOPOS: Error cargando administración de mesas:',
//                 e.code,
//                 e.message
//             );
//         }

//         renderTablesAdmin();

//     } else if (sectionId === 'kitchen-section') {
//         const kitchenSection = document.getElementById('kitchen-section');
//         if (!kitchenSection) return;

//         const timerConfigBox = document.getElementById('kitchenTimerConfigBox');

//         if (timerConfigBox) {
//             timerConfigBox.style.display = (role === 'admin') ? 'flex' : 'none';
//         }

//         // Carga inicial: descargar exclusivamente las mesas y comandas.
//         // Carga inicial: consultar mesas y comandas desde Firebase.
//         try {
//             console.log('RESTOPOS: Cargando comandas de cocina desde Firebase...');

//             const cloudTables = await window.RestoposDB.getAll('mesas');

//             if (!Array.isArray(cloudTables)) {
//                 throw new Error('Firebase no devolvió una lista válida de mesas.');
//             }

//             tables = cloudTables;

//             saveData();

//             console.log(
//                 'RESTOPOS: Comandas cargadas desde Firebase:',
//                 tables.length
//             );

//         } catch (e) {
//             console.error(
//                 'RESTOPOS: Error cargando comandas desde Firebase:',
//                 e.code,
//                 e.message
//             );

//             console.warn('Se conservarán las comandas locales de cocina.');
//         }

//         renderKitchenOrders();

//         // Actualización visual local cada segundo.
//         kitchenInterval = setInterval(() => {
//             if (
//                 kitchenSection &&
//                 !kitchenSection.classList.contains('hidden')
//             ) {
//                 renderKitchenOrders();
//             } else {
//                 clearInterval(kitchenInterval);
//                 kitchenInterval = null;
//             }
//         }, 1000);

//         // Escuchar cambios de mesas y comandas en tiempo real desde Firebase.
//         console.log('RESTOPOS: Activando escucha en tiempo real para cocina...');

//         kitchenFirestoreUnsubscribe = window.RestoposDB.listenCollection(
//             'mesas',

//             (cloudTables) => {
//                 const kitchenSection = document.getElementById('kitchen-section');

//                 if (
//                     !kitchenSection ||
//                     kitchenSection.classList.contains('hidden')
//                 ) {
//                     return;
//                 }

//                 if (Array.isArray(cloudTables)) {
//                     tables = cloudTables;

//                     saveData();

//                     renderKitchenOrders();

//                     console.log(
//                         'RESTOPOS: Cocina sincronizada en tiempo real.',
//                         'Mesas:',
//                         tables.length
//                     );
//                 }
//             },

//             (error) => {
//                 console.error(
//                     'RESTOPOS: Error en escucha de cocina:',
//                     error.code,
//                     error.message
//                 );
//             }
//         );


//     } else if (sectionId === 'users-admin-section') {
//         cancelEditUser();

//         // Cargar usuarios desde Firestore antes de mostrarlos.
//         try {
//             console.log('RESTOPOS: Cargando usuarios desde Firebase...');

//             const cloudUsers = await window.RestoposDB.getAll('usuarios');

//             if (Array.isArray(cloudUsers)) {
//                 users = cloudUsers;

//                 localStorage.setItem(
//                     'restopos_users',
//                     JSON.stringify(users)
//                 );

//                 console.log(
//                     'RESTOPOS: Usuarios cargados desde Firebase:',
//                     users.length
//                 );
//             }

//         } catch (error) {
//             console.error(
//                 'RESTOPOS: Error cargando usuarios desde Firebase:',
//                 error.code,
//                 error.message
//             );

//             showCustomAlert('No fue posible cargar los usuarios desde Firebase.');
//             return;
//         }

//         renderUsersAdmin();
//     } else if (sectionId === 'catalog-section') {
//         cancelEditProduct();

//         // Consultar productos desde Firebase
//         try {
//             console.log('RESTOPOS: Cargando catálogo desde Firebase...');

//             const cloudProducts = await window.RestoposDB.getAll('productos');

//             if (Array.isArray(cloudProducts)) {
//                 products = cloudProducts;

//                 // Mantener compatibilidad con bebidas y adicionales
//                 drinks = products.filter(product =>
//                     String(product.category || '').toLowerCase() === 'bebidas'
//                 );

//                 addons = products.filter(product =>
//                     String(product.category || '').toLowerCase() === 'adicionales'
//                 );

//                 saveData();

//                 console.log(
//                     'RESTOPOS: Catálogo cargado desde Firebase:',
//                     products.length
//                 );
//             }

//         } catch (e) {
//             console.error(
//                 'RESTOPOS: Error cargando catálogo desde Firebase:',
//                 e.code,
//                 e.message
//             );
//         }

//         renderRecipeCheckboxes();
//         renderProducts();
//     } else if (sectionId === 'dashboard-analytics-section') {
//         renderSalesDashboard();
//     }
// }


/**
 * Verifica platos listos en cocina para activar la alarma del mesero.
 * Cómo lo realiza: Compara el tiempo transcurrido desde la última alerta.
 * Consulta a Sheets: Ninguna.
 */
// function checkWaiterReadyAlarm() {
//     const now = Date.now();
//     const tablesArray = Array.isArray(tables) ? tables : [];

//     const hasReadyTables = tablesArray.some(t => {
//         let items = t.items;
//         if (typeof items === 'string') {
//             try { items = JSON.parse(items); } catch (e) { items = []; }
//         }
//         return Array.isArray(items) && items.some(i => i.sentToKitchen && i.served && !i.pickedUp);
//     });

//     if (hasReadyTables) {
//         const intervalMs = (appConfig.waiterAlarmInterval || 20) * 1000;
//         if (now - lastWaiterAlarmTime >= intervalMs) {
//             playAlarmBeep();
//             lastWaiterAlarmTime = now;
//         }
//     }
// }




// /* ========================================================== */
// /* 3. GESTIÓN DE USUARIOS Y PERMISOS                          */
// /* ========================================================== */

/**
 * Renderiza la lista de usuarios en administración.
 * Cómo lo realiza: Limpia `#usersList` e inserta los registros.
 * Consulta a Sheets: Ninguna.
 */

/**
 * ==========================================================
 * RENDERIZAR USUARIOS REGISTRADOS EN FIRESTORE
 * ==========================================================
 */
// function renderUsersAdmin() {
//     const list = document.getElementById('usersList');
//     if (!list) return;

//     list.innerHTML = '';

//     if (!Array.isArray(users) || users.length === 0) {
//         list.innerHTML = `
//             <p style="text-align:center;color:var(--text-secondary);padding:1rem;">
//                 No hay usuarios registrados.
//             </p>
//         `;
//         return;
//     }

//     users.forEach(user => {
//         const item = document.createElement('div');
//         item.className = 'product-row';

//         const userId = user._docId || user.uid;
//         const role = user.rol || 'sin rol';
//         const status = user.activo === true ? 'Activo' : 'Desactivado';

//         item.innerHTML = `
//             <div class="product-info">
//                 <span><strong>${user.nombre || 'Sin nombre'}</strong></span>

//                 <span style="font-size:0.75rem;color:var(--text-secondary);display:block;">
//                     ${user.email || 'Sin correo'}
//                 </span>

//                 <span style="font-size:0.75rem;color:var(--text-secondary);display:block;text-transform:uppercase;">
//                     Rol: ${role}
//                 </span>

//                 <span style="font-size:0.75rem;display:block;color:${user.activo === true ? '#16a34a' : '#dc2626'};">
//                     ${status}
//                 </span>
//             </div>

//             <div class="product-actions">
//                 <button
//                     onclick="editUser('${userId}')"
//                     class="action-btn"
//                     title="Editar"
//                 >✏️</button>

//                 <button
//                     onclick="deleteUser('${userId}')"
//                     class="action-btn"
//                     title="Eliminar"
//                 >🗑️</button>
//             </div>
//         `;

//         list.appendChild(item);
//     });
// }



// /**
//  * ==========================================================
//  * CREAR Y ACTUALIZAR USUARIOS CON FIREBASE
//  * ==========================================================
//  *
//  * Firebase Authentication:
//  * - Crea las cuentas de los empleados.
//  * - Gestiona las contraseñas.
//  *
//  * Firestore:
//  * - Guarda nombre, correo, rol y estado.
//  * - Utiliza el UID de Authentication como ID del documento.
//  *
//  * Se utiliza una segunda instancia de Firebase Auth para
//  * conservar abierta la sesión del administrador.
//  *
//  * ==========================================================
//  */
// async function saveUser() {

//     if (!navigator.onLine) {
//         showCustomAlert('❌ Se necesita conexión a internet.');
//         return;
//     }

//     const name = document.getElementById('newUserName').value.trim();
//     const email = document.getElementById('newUserEmail').value.trim().toLowerCase();
//     const pass = document.getElementById('newUserPass').value;
//     const role = document.getElementById('newUserRole').value;
//     const isActive = document.getElementById('newUserStatus').value === 'true';

//     const emailInput = document.getElementById('newUserEmail');
//     const btnSave = document.getElementById('btnSaveUser');

//     // Validar nombre.
//     if (!name) {
//         showCustomAlert('Ingrese el nombre del empleado.');
//         return;
//     }

//     // Validar correo.
//     if (!email || !emailInput.checkValidity()) {
//         showCustomAlert('Ingrese un correo electrónico válido.');
//         return;
//     }

//     // Validar rol permitido.
//     if (!['admin', 'mesero', 'cocinero'].includes(role)) {
//         showCustomAlert('El rol seleccionado no es válido.');
//         return;
//     }

//     const isEditing = editingUserId !== null;

//     // La contraseña solo es obligatoria al crear una cuenta.
//     if (!isEditing && (!pass || pass.length < 6)) {
//         showCustomAlert(
//             'La contraseña debe tener al menos 6 caracteres.'
//         );
//         return;
//     }

//     btnSave.disabled = true;
//     btnSave.innerText = 'Guardando...';

//     try {

//         // ==================================================
//         // 1. ACTUALIZAR USUARIO EXISTENTE EN FIRESTORE
//         // ==================================================

//         if (isEditing) {

//             const user = users.find(
//                 u => (u._docId || u.uid) === editingUserId
//             );

//             if (!user) {
//                 throw new Error('No se encontró el usuario seleccionado.');
//             }

//             // No permitir cambiar el correo desde esta función.
//             // El correo de acceso pertenece a Authentication.
//             const existingEmail = String(user.email || '').trim().toLowerCase();

//             if (email !== existingEmail) {
//                 throw new Error(
//                     'No se puede cambiar el correo de acceso desde la edición. Se conserva el correo registrado en Firebase Authentication.'
//                 );
//             }


//             // No permitir desactivar la cuenta del administrador actual.
//             if (
//                 window.auth.currentUser &&
//                 window.auth.currentUser.uid === editingUserId &&
//                 !isActive
//             ) {
//                 throw new Error(
//                     'No puedes desactivar tu propia cuenta mientras estás administrando RESTOPOS.'
//                 );
//             }

//             // Evitar que el sistema se quede sin administradores activos.
//             const remainsAdmin = role === 'admin' && isActive;

//             if (user.rol === 'admin' && user.activo === true && !remainsAdmin) {
//                 const otherActiveAdmins = users.filter(
//                     u =>
//                         (u._docId || u.uid) !== editingUserId &&
//                         u.rol === 'admin' &&
//                         u.activo === true
//                 );

//                 if (otherActiveAdmins.length === 0) {
//                     throw new Error(
//                         'No puedes desactivar o cambiar el rol del último administrador activo.'
//                     );
//                 }
//             }

//             // Guardar los cambios en Firestore.
//             await window.RestoposDB.update(
//                 'usuarios',
//                 editingUserId,
//                 {
//                     nombre: name,
//                     rol: role,
//                     activo: isActive,
//                     updatedAt: Date.now()
//                 }
//             );

//             // Actualizar los datos locales.
//             user.nombre = name;
//             user.rol = role;
//             user.activo = isActive;
//             user.updatedAt = Date.now();

//             localStorage.setItem(
//                 'restopos_users',
//                 JSON.stringify(users)
//             );


//             // Actualizar la información local.
//             user.nombre = name;
//             user.rol = role;

//             cancelEditUser();
//             renderUsersAdmin();

//             showCustomAlert(
//                 '✅ Datos del empleado actualizados correctamente en Firebase.'
//             );

//             return;
//         }

//         // ==================================================
//         // 2. CREAR NUEVA CUENTA EN FIREBASE AUTHENTICATION
//         // ==================================================

//         const secondaryAppName = 'restoposUserCreation';

//         // Reutilizar la instancia secundaria si ya existe.
//         let secondaryApp = firebase.apps.find(
//             app => app.name === secondaryAppName
//         );

//         // Crear una instancia secundaria independiente.
//         if (!secondaryApp) {
//             secondaryApp = firebase.initializeApp(
//                 window.firebaseApp.options,
//                 secondaryAppName
//             );
//         }

//         const secondaryAuth = secondaryApp.auth();

//         let createdAuthUser = null;
//         let firestoreSaved = false;

//         try {

//             // Crear la cuenta sin cerrar la sesión principal.
//             const credential = await secondaryAuth
//                 .createUserWithEmailAndPassword(email, pass);

//             createdAuthUser = credential.user;

//             const uid = createdAuthUser.uid;

//             // ==================================================
//             // 3. GUARDAR PERFIL DEL EMPLEADO EN FIRESTORE
//             // ==================================================

//             const userData = {
//                 nombre: name,
//                 email: email,
//                 rol: role,
//                 activo: true,
//                 createdAt: Date.now()
//             };

//             await window.RestoposDB.set(
//                 'usuarios',
//                 uid,
//                 userData,
//                 false
//             );

//             firestoreSaved = true;

//             // Incorporar el nuevo empleado a la lista local.
//             users.push({
//                 ...userData,
//                 _docId: uid
//             });

//             // Cerrar únicamente la sesión secundaria.
//             await secondaryAuth.signOut();

//             cancelEditUser();
//             renderUsersAdmin();

//             showCustomAlert(
//                 '✅ Usuario creado correctamente en Firebase Authentication y Firestore.'
//             );

//         } catch (error) {

//             // Si Auth creó la cuenta pero Firestore falló,
//             // intentar eliminar la cuenta incompleta.
//             if (createdAuthUser && !firestoreSaved) {
//                 try {
//                     await createdAuthUser.delete();
//                 } catch (deleteError) {
//                     console.error(
//                         'No se pudo revertir la cuenta incompleta:',
//                         deleteError
//                     );
//                 }
//             }

//             try {
//                 await secondaryAuth.signOut();
//             } catch (signOutError) {
//                 console.warn(
//                     'No se pudo cerrar la sesión secundaria:',
//                     signOutError
//                 );
//             }

//             throw error;
//         }

//     } catch (error) {

//         console.error(
//             'RESTOPOS: Error guardando usuario:',
//             error.code,
//             error.message
//         );

//         let message = 'No fue posible guardar el usuario.';

//         if (error.code === 'auth/email-already-in-use') {
//             message = 'Este correo electrónico ya está registrado en Firebase Authentication.';
//         } else if (error.code === 'auth/invalid-email') {
//             message = 'El correo electrónico no es válido.';
//         } else if (error.code === 'auth/weak-password') {
//             message = 'La contraseña es demasiado débil.';
//         } else if (error.code === 'permission-denied') {
//             message = 'Firebase no autorizó la operación. Comprueba los permisos del administrador.';
//         } else if (error.message) {
//             message = error.message;
//         }

//         showCustomAlert('❌ ' + message);

//     } finally {

//         btnSave.disabled = false;

//         btnSave.innerText = editingUserId !== null
//             ? 'Guardar Cambios'
//             : 'Crear Usuario';
//     }
// }


// /**
//  * ==========================================================
//  * EDITAR USUARIO REGISTRADO EN FIRESTORE
//  * ==========================================================
//  */
// function editUser(uid) {
//     if (!navigator.onLine) {
//         showCustomAlert('❌ Sin conexión a internet.');
//         return;
//     }

//     const user = users.find(
//         u => (u._docId || u.uid) === uid
//     );

//     if (!user) {
//         showCustomAlert('No se encontró el usuario seleccionado.');
//         return;
//     }

//     // Guardar el UID del usuario que se está editando.
//     editingUserId = uid;

//     // Cargar los datos actuales del empleado.
//     document.getElementById('newUserName').value =
//         user.nombre || '';

//     document.getElementById('newUserEmail').value =
//         user.email || '';
//     document.getElementById('newUserEmail').readOnly = true;

//     // Firebase no permite recuperar contraseñas.
//     // Se deja vacío para conservar la contraseña actual.
//     document.getElementById('newUserPass').value = '';

//     document.getElementById('newUserRole').value =
//         user.rol || 'mesero';

//     document.getElementById('newUserStatus').value =
//         user.activo === true ? 'true' : 'false';

//     // Actualizar textos del formulario.
//     document.getElementById('formUserTitle').innerText =
//         'Editar empleado';

//     document.getElementById('btnSaveUser').innerText =
//         'Guardar Cambios';

//     document.getElementById('userPasswordHelp').innerText =
//         'Deja este campo vacío para conservar la contraseña actual.';

//     document.getElementById('btnCancelUserEdit')
//         .classList.remove('hidden');

//     window.scrollTo({
//         top: 0,
//         behavior: 'smooth'
//     });
// }


// /**
//  * ==========================================================
//  * CANCELAR EDICIÓN DE USUARIO
//  * ==========================================================
//  */
// function cancelEditUser() {
//     editingUserId = null;

//     document.getElementById('newUserName').value = '';
//     document.getElementById('newUserEmail').value = '';
//     document.getElementById('newUserEmail').readOnly = false;
//     document.getElementById('newUserPass').value = '';

//     document.getElementById('newUserRole').value = 'mesero';
//     document.getElementById('newUserStatus').value = 'true';

//     document.getElementById('formUserTitle').innerText =
//         '👥 Gestión de Usuarios y Permisos';

//     document.getElementById('btnSaveUser').innerText =
//         'Crear Usuario';

//     document.getElementById('userPasswordHelp').innerText =
//         'Obligatoria para crear una cuenta. Déjala vacía al editar.';

//     document.getElementById('btnCancelUserEdit')
//         .classList.add('hidden');
// }



// /**
//  * ==========================================================
//  * DESACTIVAR USUARIOS EN FIRESTORE
//  * ==========================================================
//  *
//  * No elimina la cuenta de Firebase Authentication.
//  * Cambia activo a false para impedir el acceso a Firestore.
//  *
//  * Conserva los registros históricos del empleado.
//  * ==========================================================
//  */
// async function deleteUser(id) {

//     if (!navigator.onLine) {
//         showCustomAlert('❌ Sin conexión a internet.');
//         return;
//     }

//     // Buscar al empleado por su UID de Firebase.
//     const user = users.find(
//         u => String(u._docId || u.uid) === String(id)
//     );

//     if (!user) {
//         showCustomAlert('No se encontró el empleado seleccionado.');
//         return;
//     }

//     const userId = user._docId || user.uid;

//     // No permitir desactivar la cuenta que está administrando el sistema.
//     if (
//         window.auth &&
//         window.auth.currentUser &&
//         window.auth.currentUser.uid === userId
//     ) {
//         showCustomAlert(
//             'No puedes desactivar tu propia cuenta de administrador.'
//         );
//         return;
//     }

//     // Evitar dejar el sistema sin administradores activos.
//     if (user.rol === 'admin') {
//         const activeAdmins = users.filter(
//             u => u.rol === 'admin' && u.activo === true
//         );

//         if (activeAdmins.length <= 1) {
//             showCustomAlert(
//                 'No puedes desactivar el último administrador activo.'
//             );
//             return;
//         }
//     }

//     const employeeName = user.nombre || user.email || 'este empleado';

//     const confirmed = await showCustomConfirm(
//         `¿Deseas desactivar a "${employeeName}"?\n\nEl empleado perderá el acceso al sistema, pero sus registros históricos se conservarán.`
//     );

//     if (!confirmed) {
//         return;
//     }

//     try {

//         // Actualizar el estado directamente en Firestore.
//         await window.RestoposDB.update(
//             'usuarios',
//             userId,
//             {
//                 activo: false,
//                 updatedAt: Date.now()
//             }
//         );

//         // Actualizar la lista local.
//         user.activo = false;
//         user.updatedAt = Date.now();

//         // Cancelar edición si corresponde.
//         if (editingUserId === userId) {
//             cancelEditUser();
//         }

//         localStorage.setItem(
//             'restopos_users',
//             JSON.stringify(users)
//         );

//         renderUsersAdmin();

//         showCustomAlert(
//             '✅ Empleado desactivado correctamente en Firebase.'
//         );

//         console.log(
//             'RESTOPOS: Usuario desactivado:',
//             userId
//         );

//     } catch (error) {

//         console.error(
//             'RESTOPOS: Error desactivando usuario:',
//             error.code,
//             error.message
//         );

//         showCustomAlert(
//             '❌ No fue posible desactivar el empleado en Firebase.'
//         );
//     }
// }



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

function cancelEditTable() {
    editingTableId = null;
    document.getElementById('newTableName').value = '';
    document.getElementById('btnCancelTableEdit').classList.add('hidden');
}

/**
 * ==========================================================
 * ELIMINAR MESA
 * Solicita confirmación personalizada y elimina definitivamente
 * el documento de la mesa en Firebase Firestore.
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


function normalizeCategory(cat) {
    if (!cat) return 'principales';
    const c = String(cat).toLowerCase().trim();
    if (c.includes('sopa') || c.includes('entrada')) return 'sopas';
    if (c.includes('principal') || c.includes('plato')) return 'principales';
    if (c.includes('bebida') || c.includes('jugo')) return 'bebidas';
    if (c.includes('adicional') || c.includes('extra')) return 'adicionales';
    return c;
}

function isProductActive(p) {
    if (p.active === undefined || p.active === null) return true;
    if (typeof p.active === 'boolean') return p.active;
    const str = String(p.active).toLowerCase().trim();
    return !['false', 'inactivo', '0', 'no'].includes(str);
}

/**
 * Filtra los productos unificados de la tabla `Productos` según su categoría y estado activo.
 * Cómo lo realiza: Filtra el arreglo global `products` según su categoría normalizada.
 * Consulta a Sheets: Ninguna (usa el catálogo cargado en memoria).
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

    // Buscar la mesa que tiene abierta el usuario.
    const table = tables.find(
        t => Number(t.id) === Number(currentTableId)
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

                // Buscar nuevamente la mesa con los últimos cambios.
                const latestTable = tables.find(
                    t => Number(t.id) === Number(currentTableId)
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
 * Actualiza localmente la observación y sus modificaciones.
 * Guarda los cambios en Firebase 700 ms después de que
 * el mesero termina de escribir.
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
/* 8. ALERTAS Y MODALES                                       */
/* ========================================================== */

/* ESTE CODIGONSE MIGRO A ALERTS.JS
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
*/
/*
/**
 * ==========================================================
 * CONFIRMACIÓN PERSONALIZADA
 * Muestra un popup blanco con botones Cancelar y Eliminar.
 * Devuelve true si el usuario confirma y false si cancela.
 * ==========================================================
 */

/* FUNCION TAMBIEN MIGRADA A ALERTS.JS
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
*/


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
/* 10. SINCRONIZACIÓN CON GOOGLE SHEETS                       */
/* ========================================================== */

/*
 * Descarga todos los datos operativos desde Google Apps Script.
 * Cómo lo realiza: Ejecuta una petición GET con `action=getData`.
 * Consulta a Sheets: Lee las tablas `Mesas`, `Productos`, `Bebidas`, `Adicionales`, `Usuarios` y `Config`.
 */

/* MIGRADA A STORAGE.JS
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
*/

/* eliminar funcion solo consulta a sheets
        async function saveDataAndSyncCloudSync(msg) {
            saveData();
            try {
                await fetch(WEB_APP_URL, {
                    method: 'POST',
                    body: JSON.stringify({ tables, products, drinks, addons, users, config: appConfig })
                });
                showCustomAlert(`✅ ${msg}`);
            } catch (e) {
                console.error("Error al sincronizar:", e);
            }
        }
*/

/* se elimina porwue solo se utiliza para sheets
        async function syncDataToCloud() {
            try {
                // Guardar primero una copia local de los datos.
                saveData();
        
                // Preparar los datos que se enviarán a Google Sheets.
                const payload = {
                    tables: tables,
                    products: products,
                    drinks: drinks,
                    addons: addons,
                    users: users,
                    config: appConfig
                };
        
                const response = await fetch(WEB_APP_URL, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'text/plain;charset=utf-8'
                    },
                    body: JSON.stringify(payload)
                });
        
                // Comprobar el estado de la petición HTTP.
                if (!response.ok) {
                    throw new Error(
                        'Error HTTP al sincronizar: ' + response.status
                    );
                }
        
                // Leer y validar la respuesta de Apps Script.
                const responseText = await response.text();
        
                let result;
        
                try {
                    result = JSON.parse(responseText);
                } catch (parseError) {
                    throw new Error(
                        'Google Apps Script devolvió una respuesta no válida.'
                    );
                }
        
                // Apps Script puede responder HTTP 200 aunque exista un error.
                if (!result || result.status !== 'success') {
                    throw new Error(
                        result && result.message
                            ? result.message
                            : 'Google Sheets no confirmó el guardado.'
                    );
                }
        
                // Actualizar la versión local con la versión confirmada por la nube.
                if (
                    result.lastUpdated !== undefined &&
                    Number.isFinite(Number(result.lastUpdated))
                ) {
                    appConfig.lastUpdated = Number(result.lastUpdated);
                }
        
                // Guardar nuevamente los datos y la versión confirmada.
                saveData();
        
                console.log(
                    'RESTOPOS: sincronización confirmada.',
                    'Versión:',
                    appConfig.lastUpdated
                );
        
                return result;
        
            } catch (error) {
                console.error(
                    'RESTOPOS: error de sincronización:',
                    error
                );
        
                // Importante: comunicar el error a la función que llamó
                // a syncDataToCloud(), para que no muestre un éxito falso.
                throw error;
            }
        }
        
*/
/* se eliminar solo se usa para sheets
        async function sendNewSalesToCloud(salesArray) {
            try {
                await fetch(WEB_APP_URL, {
                    method: 'POST',
                    body: JSON.stringify({ salesHistory: salesArray })
                });
            } catch (e) {
                console.error("Error registrando venta:", e);
            }
        }
*/
/* MIGRADA A STORAGE.JS
function saveData() {
    localStorage.setItem('restopos_tables', JSON.stringify(tables));
    localStorage.setItem('restopos_addons', JSON.stringify(addons));
    localStorage.setItem('restopos_products', JSON.stringify(products));
    localStorage.setItem('restopos_drinks', JSON.stringify(drinks));
    localStorage.setItem('restopos_sales_history', JSON.stringify(salesHistory));
    localStorage.setItem('restopos_users', JSON.stringify(users));
    localStorage.setItem('restopos_config', JSON.stringify(appConfig));
}
*/


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
