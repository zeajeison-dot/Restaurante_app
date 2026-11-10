/**
 * ==========================================================
 * SISTEMA RESTOPOS - CONTROL Y GESTIÓN DE RESTAURANTE
 * ARCHIVO PRINCIPAL DE LÓGICA DE NEGOCIO (app.js)
 * ==========================================================
 */

/* ========================================================== */
/* 1. VARIABLES GLOBALES Y ESTADO INICIAL VACÍO               */
/* ========================================================== */

const WEB_APP_URL = "https://script.google.com/macros/s/AKfycbwRGdEjCW5p1py7dX1dvToX_w3RxEAxkG5sAFYrmr9TD-Rbvvfa_iiWSMsl9YvFo9T0-A/exec";

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

/* ========================================================== */
/* 1. INICIALIZACIÓN DE SESIÓN                                */
/* ========================================================== */

/**
 * Inicializa la aplicación al cargar la ventana.
 * Cómo lo realiza: Restaura la sesión activa si existe o precarga exclusivamente los usuarios.
 * Consulta a Sheets: Llama a `loadUsersAndConfigFromCloud()` (Tablas: `Usuarios` y `Config`).
 */
window.onload = async function() {
    if (localStorage.getItem('restopos_logged') === 'true') {
        const username = localStorage.getItem('restopos_current_user') || 'admin';
        const role = localStorage.getItem('restopos_current_role') || 'admin';
        
        await loadUsersAndConfigFromCloud();
        setupUserSession(username, role, false);
    } else {
        await loadUsersAndConfigFromCloud();
    }
};


/* ========================================================== */
/* 2. AUTENTICACIÓN Y CONTROL DE VISTAS                       */
/* ========================================================== */

/**
 * Descarga exclusivamente la tabla de Usuarios y Configuración desde la nube para el Login.
 * Cómo lo realiza: Realiza un fetch al endpoint ligero `getUsersAndConfig`.
 * Consulta a Sheets: Lee únicamente las tablas `Usuarios` y `Config`.
 */
async function loadUsersAndConfigFromCloud() {
    try {
        const response = await fetch(`${WEB_APP_URL}?action=getUsersAndConfig`);
        if (!response.ok) throw new Error("Error HTTP al consultar usuarios");
        const cloudData = await response.json();
        
        if (cloudData && cloudData.status !== 'error') {
            if (Array.isArray(cloudData.users)) {
                users = cloudData.users;
                localStorage.setItem('restopos_users', JSON.stringify(users));
            }
            if (cloudData.config) {
                appConfig = cloudData.config;
                localStorage.setItem('restopos_config', JSON.stringify(appConfig));
            }
            return true;
        }
    } catch (e) {
        console.warn("No se pudieron cargar usuarios de la nube, usando caché local:", e);
        users = JSON.parse(localStorage.getItem('restopos_users')) || [];
    }
    return false;
}

/**
 * Valida las credenciales ingresadas consultando estrictamente la tabla de usuarios.
 * Cómo lo realiza: Consulta la nube mediante el endpoint ligero, valida el rol y usuario.
 * Consulta a Sheets: Llama a `loadUsersAndConfigFromCloud()` (Tabla: `Usuarios`).
 */
async function login() {
    const userInput = document.getElementById('userInput').value.trim();
    const passInput = document.getElementById('passInput').value.trim();

    if (!userInput || !passInput) {
        showCustomAlert('Ingrese usuario y contraseña.');
        return;
    }

    showCustomAlert('🔄 Validando credenciales en Google Sheets...');
    const cloudLoaded = await loadUsersAndConfigFromCloud();

    const foundUser = users.find(u =>
        String(u.username).trim().toLowerCase() === userInput.toLowerCase() &&
        String(u.pass).trim() === passInput
    );

    const alertOverlay = document.getElementById('customAlertModal');
    if (alertOverlay) alertOverlay.style.display = 'none';

    if (foundUser) {
        localStorage.setItem('restopos_logged', 'true');
        localStorage.setItem('restopos_current_user', foundUser.username);
        localStorage.setItem('restopos_current_role', foundUser.role);

        setupUserSession(foundUser.username, foundUser.role, true);
    } else {
        if (!cloudLoaded && !navigator.onLine) {
            showCustomAlert('No hay conexión a internet. No fue posible consultar los usuarios.');
        } else {
            showCustomAlert('Usuario o contraseña incorrectos.');
        }
    }
}

/**
 * Configura la interfaz gráfica y redirige a la vista inicial según el rol.
 * Cómo lo realiza: Muestra el rol y nombre, y direcciona al módulo correspondiente.
 * Consulta a Sheets: Ninguna directa.
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
 * Guarda la configuración de intervalos de alarma de mesero en Google Sheets.
 * Cómo lo realiza: Valida el input en segundos y sincroniza con la nube.
 * Consulta a Sheets: Modifica la tabla `Config` vía `saveDataAndSyncCloudSync()`.
 */
async function saveWaiterAlarmConfig() {
    const val = parseInt(document.getElementById('waiterAlarmIntervalParam').value, 10);
    const canGen = document.getElementById('waiterCanGenerateReceiptParam')?.checked ?? true;

    if (isNaN(val) || val < 5) {
        showCustomAlert('Ingrese un valor válido en segundos (mínimo 5).');
        return;
    }

    appConfig.waiterAlarmInterval = val;
    appConfig.waiterCanGenerateReceipt = canGen;
    appConfig.lastUpdated = Date.now();

    await saveDataAndSyncCloudSync('Configuración y permisos guardados correctamente en Sheets.');
}

/**
 * Dibuja las tarjetas del menú principal para el Administrador.
 * Cómo lo realiza: Inserta dinámicamente las tarjetas de navegación en `#dashboardMenuGrid`.
 * Consulta a Sheets: Ninguna.
 */
function renderDashboardMenu(role) {
    const grid = document.getElementById('dashboardMenuGrid');
    if (!grid) return;

    grid.innerHTML = '';

    const menuCards = [
        { title: '📊 Dashboard de Ventas', desc: 'Analíticas y resultados comerciales', action: "showSection('dashboard-analytics-section')" },
        { title: '🪑 Mesas & Pedidos', desc: 'Control de salón', action: "showSection('tables-section')" },
        { title: '👨‍🍳 Módulo de Cocina', desc: 'Comandas en tiempo real', action: "showSection('kitchen-section')" },
        { title: '👥 Gestión de Usuarios', desc: 'Crear usuarios y permisos', action: "showSection('users-admin-section')" },
        { title: '⚙️ Gestionar Mesas', desc: 'Crear / Editar mesas', action: "showSection('tables-admin-section')" },
        { title: '🍔 Catálogo de Platos', desc: 'Platos, bebidas y adicionales', action: "showSection('catalog-section')" }
    ];

    menuCards.forEach(card => {
        const div = document.createElement('div');
        div.className = 'menu-card';
        div.setAttribute('onclick', card.action);
        div.innerHTML = `
            <h3>${card.title}</h3>
            <p style="font-size: 0.85rem; color: var(--text-secondary);">${card.desc}</p>
        `;
        grid.appendChild(div);
    });
}

/**
 * Cierra la sesión activa y retorna a la vista de login.
 * Cómo lo realiza: Borra las credenciales de localStorage y limpia las vistas.
 * Consulta a Sheets: Ninguna.
 */
function logout() {
    localStorage.removeItem('restopos_logged');
    localStorage.removeItem('restopos_current_user');
    localStorage.removeItem('restopos_current_role');

        const sections = [
        'dashboard-view', 'tables-section', 'kitchen-section', 'users-admin-section',
        'tables-admin-section', 'order-section', 'bill-section', 'catalog-section',
        'dashboard-analytics-section'
    ];

    sections.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });

    document.getElementById('login-view').classList.remove('hidden');
    document.getElementById('userInput').value = '';
    document.getElementById('passInput').value = '';
}

/**
 * Gestiona la navegación entre secciones aplicando control de acceso y limpiando intervalos.
 * Cómo lo realiza: Valida permisos por rol, detiene cronómetros previos, muestra la vista solicitada
 * y ejecuta la consulta de datos correspondiente al módulo.
 * Consulta a Sheets:
 * - `tables-section`: Consulta `getTablesAndProducts` (Mesas, Productos con Caché).
 * - `kitchen-section`: Consulta `getData` y sondeo ligero de `Config`.
 * - Otras secciones: Llama a `loadDataFromCloud()`.
 */

async function showSection(sectionId) {
    const role = localStorage.getItem('restopos_current_role') || 'admin';

    if (sectionId === 'dashboard-analytics-section' && role !== 'admin') {
        showCustomAlert('❌ Acceso denegado: El módulo de Dashboard es exclusivo para el rol de Administrador.');
        return;
    }

    if (role === 'mesero' && !['tables-section', 'order-section', 'bill-section'].includes(sectionId)) {
        showCustomAlert('Acceso no autorizado para el rol de mesero.');
        return;
    }

    if (role === 'cocinero' && sectionId !== 'kitchen-section') {
        showCustomAlert('Acceso no autorizado para el rol de cocinero.');
        return;
    }

        // CORRECCIÓN: No descargar datos pesados en el menú principal, mesas, dashboard analítico, catálogo ni pedidos
    if (!['dashboard-view', 'tables-section', 'dashboard-analytics-section', 'catalog-section', 'tables-admin-section', 'order-section'].includes(sectionId)) {
        await loadDataFromCloud();
    }

    const sections = [
        'dashboard-view', 'tables-section', 'kitchen-section', 'users-admin-section',
        'tables-admin-section', 'order-section', 'bill-section', 'catalog-section',
        'dashboard-analytics-section'
    ];

    sections.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });

    const target = document.getElementById(sectionId);
    if (target) target.classList.remove('hidden');

    if (kitchenInterval) { clearInterval(kitchenInterval); kitchenInterval = null; }
    if (kitchenCloudPollInterval) { clearInterval(kitchenCloudPollInterval); kitchenCloudPollInterval = null; }
    if (tablesRefreshInterval) { clearInterval(tablesRefreshInterval); tablesRefreshInterval = null; }

    document.querySelectorAll('.admin-back-btn').forEach(btn => {
        btn.style.display = (role === 'admin') ? 'block' : 'none';
    });

    if (sectionId === 'dashboard-view') {
        renderDashboardMenu(role);
    } else if (sectionId === 'tables-section') {
        const headerBar = document.getElementById('tablesHeaderBar');
        const userTitle = document.getElementById('tablesUserTitle');
        const roleBadge = document.getElementById('tablesRoleBadge');
        const alarmCard = document.getElementById('waiterAlarmConfigCard');

        if (role === 'mesero') {
            userTitle.innerText = "Gestión de Mesas";
            if (roleBadge) roleBadge.style.display = 'none';
            headerBar.style.display = 'flex';
            if (alarmCard) alarmCard.style.display = 'none';
        } else if (role === 'admin') {
            headerBar.style.display = 'none';
            if (alarmCard) alarmCard.style.display = 'block';
        }

        // Carga inicial: consulta exclusiva de mesas (sin productos pesados)
        try {
            const res = await fetch(`${WEB_APP_URL}?action=getTables`);
            if (res.ok) {
                const data = await res.json();
                if (data.status === 'success') {
                    if (Array.isArray(data.tables)) {
                        tables = data.tables;
                        saveData();
                    }
                }
            }
        } catch (e) {
            console.warn("Usando datos locales para mesas:", e);
        }

        renderTables();

        // Sondeo automático cada 60 segundos consultando EXCLUSIVAMENTE mesas
        let isRefreshingTables = false;
        tablesRefreshInterval = setInterval(async () => {
            const tablesSec = document.getElementById('tables-section');
            if (tablesSec && !tablesSec.classList.contains('hidden')) {
                if (isRefreshingTables) return;
                isRefreshingTables = true;
                try {
                    const res = await fetch(`${WEB_APP_URL}?action=getTables`);
                    if (res.ok) {
                        const data = await res.json();
                        if (data && data.status === 'success' && Array.isArray(data.tables)) {
                            tables = data.tables;
                            renderTables();
                            checkWaiterReadyAlarm();
                        }
                    }
                } catch (e) {
                    console.error("Error en sondeo de mesas:", e);
                } finally {
                    isRefreshingTables = false;
                }
            } else {
                clearInterval(tablesRefreshInterval);
                tablesRefreshInterval = null;
            }
        }, 60000); // Actualiza cada 60 segundos exactos

    } else if (sectionId === 'tables-admin-section') {
        cancelEditTable();
        
        // Consulta ligera exclusiva para la pestaña Mesas
        try {
            const res = await fetch(`${WEB_APP_URL}?action=getTables`);
            if (res.ok) {
                const data = await res.json();
                if (data.status === 'success' && Array.isArray(data.tables)) {
                    tables = data.tables;
                    saveData();
                }
            }
        } catch (e) {
            console.warn("Usando datos locales para administración de mesas:", e);
        }

        renderTablesAdmin();

    } else if (sectionId === 'kitchen-section') {
        const kitchenSection = document.getElementById('kitchen-section');
        if (!kitchenSection) return;

        const timerConfigBox = document.getElementById('kitchenTimerConfigBox');
        if (timerConfigBox) timerConfigBox.style.display = (role === 'admin') ? 'flex' : 'none';

        await loadDataFromCloud();
        renderKitchenOrders();

        let localLastUpdated = appConfig.lastUpdated || 0;

        kitchenInterval = setInterval(() => {
            if (kitchenSection && !kitchenSection.classList.contains('hidden')) {
                renderKitchenOrders();
            } else {
                clearInterval(kitchenInterval);
                kitchenInterval = null;
            }
        }, 1000);

        let isRefreshingKitchen = false;
        kitchenCloudPollInterval = setInterval(async () => {
            if (kitchenSection && !kitchenSection.classList.contains('hidden')) {
                if (isRefreshingKitchen) return;
                isRefreshingKitchen = true;
                try {
                    const resCheck = await fetch(`${WEB_APP_URL}?action=getLastUpdated`);
                    if (resCheck.ok) {
                        const checkData = await resCheck.json();
                        if (checkData && checkData.status === 'success' && checkData.lastUpdated > localLastUpdated) {
                            localLastUpdated = checkData.lastUpdated;
                            await loadDataFromCloud();
                            renderKitchenOrders();
                        }
                    }
                } catch (e) {
                    console.error("Error en sondeo ligero de cocina:", e);
                } finally {
                    isRefreshingKitchen = false;
                }
            } else {
                clearInterval(kitchenCloudPollInterval);
                kitchenCloudPollInterval = null;
            }
        }, 15000);

    } else if (sectionId === 'users-admin-section') {
        cancelEditUser();
        renderUsersAdmin();
    } else if (sectionId === 'catalog-section') {
        cancelEditProduct();
        renderRecipeCheckboxes();
        
        // Consulta ligera exclusiva para la pestaña Productos
        try {
            const res = await fetch(`${WEB_APP_URL}?action=getProducts`);
            if (res.ok) {
                const data = await res.json();
                if (data.status === 'success' && Array.isArray(data.products)) {
                    products = data.products;
                    saveData();
                }
            }
        } catch (e) {
            console.warn("Usando datos locales para el catálogo:", e);
        }

        renderProducts();
    } else if (sectionId === 'dashboard-analytics-section') {
        renderSalesDashboard();
    }
}


/**
 * Verifica platos listos en cocina para activar la alarma del mesero.
 * Cómo lo realiza: Compara el tiempo transcurrido desde la última alerta.
 * Consulta a Sheets: Ninguna.
 */
function checkWaiterReadyAlarm() {
    const now = Date.now();
    const hasReadyTables = tables.some(t => t.items && t.items.some(i => i.sentToKitchen && i.served && !i.pickedUp));

    if (hasReadyTables) {
        const intervalMs = (appConfig.waiterAlarmInterval || 20) * 1000;
        if (now - lastWaiterAlarmTime >= intervalMs) {
            playAlarmBeep();
            lastWaiterAlarmTime = now;
        }
    }
}


/* ========================================================== */
/* 3. GESTIÓN DE USUARIOS Y PERMISOS                          */
/* ========================================================== */

/**
 * Renderiza la lista de usuarios en administración.
 * Cómo lo realiza: Limpia `#usersList` e inserta los registros.
 * Consulta a Sheets: Ninguna.
 */
function renderUsersAdmin() {
    const list = document.getElementById('usersList');
    if (!list) return;
    list.innerHTML = '';

    users.forEach(u => {
        const item = document.createElement('div');
        item.className = 'product-row';
        item.innerHTML = `
            <div class="product-info">
                <span><strong>${u.username}</strong></span>
                <span style="font-size:0.75rem; color: var(--text-secondary); display:block; text-transform:uppercase;">Rol: ${u.role}</span>
            </div>
            <div class="product-actions">
                <button onclick="editUser(${u.id})" class="action-btn" title="Editar">✏️</button>
                <button onclick="deleteUser(${u.id})" class="action-btn" title="Eliminar">🗑️</button>
            </div>
        `;
        list.appendChild(item);
    });
}

/**
 * Guarda o actualiza un usuario en la nube.
 * Cómo lo realiza: Valida campos y sincroniza.
 * Consulta a Sheets: Modifica la tabla `Usuarios` vía `saveDataAndSyncCloudSync()`.
 */
async function saveUser() {
    if (!navigator.onLine) {
        showCustomAlert('❌ Acción bloqueada: Sin conexión a internet.');
        return;
    }

    const username = document.getElementById('newUsername').value.trim();
    const pass = document.getElementById('newUserPass').value.trim();
    const role = document.getElementById('newUserRole').value;

    if (!username || !pass) {
        showCustomAlert('Por favor ingrese usuario y contraseña.');
        return;
    }

    if (editingUserId !== null) {
        const user = users.find(u => u.id == editingUserId);
        if (user) { user.username = username; user.pass = pass; user.role = role; }
        cancelEditUser();
    } else {
        const newId = users.length > 0 ? Math.max(...users.map(u => Number(u.id))) + 1 : 1;
        users.push({ id: newId, username, pass, role });
    }

    appConfig.lastUpdated = Date.now();
    await saveDataAndSyncCloudSync('Usuario guardado en Google Sheets exitosamente.');
    document.getElementById('newUsername').value = '';
    document.getElementById('newUserPass').value = '';
    renderUsersAdmin();
}

function editUser(id) {
    if (!navigator.onLine) { showCustomAlert('❌ Sin conexión a internet.'); return; }
    const user = users.find(u => u.id == id);
    if (user) {
        editingUserId = id;
        document.getElementById('newUsername').value = user.username;
        document.getElementById('newUserPass').value = user.pass;
        document.getElementById('newUserRole').value = user.role;
        document.getElementById('formUserTitle').innerText = 'Editar Usuario';
        document.getElementById('btnSaveUser').innerText = 'Guardar Cambios (Online)';
        document.getElementById('btnCancelUserEdit').classList.remove('hidden');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
}

function cancelEditUser() {
    editingUserId = null;
    document.getElementById('newUsername').value = '';
    document.getElementById('newUserPass').value = '';
    document.getElementById('newUserRole').value = 'mesero';
    document.getElementById('formUserTitle').innerText = 'Nombre de Usuario';
    document.getElementById('btnSaveUser').innerText = 'Crear / Guardar Usuario (Online)';
    document.getElementById('btnCancelUserEdit').classList.add('hidden');
}

async function deleteUser(id) {
    if (!navigator.onLine) { showCustomAlert('❌ Sin conexión a internet.'); return; }
    const user = users.find(u => u.id == id);
    if (!user) return;
    if (user.username === 'admin') { showCustomAlert('No se puede eliminar el administrador.'); return; }

    if (confirm(`¿Desea eliminar a "${user.username}"?`)) {
        users = users.filter(u => u.id != id);
        if (editingUserId == id) cancelEditUser();
        appConfig.lastUpdated = Date.now();
        await saveDataAndSyncCloudSync('Usuario eliminado.');
        renderUsersAdmin();
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
            try { items = JSON.parse(items); } catch(e) { items = []; }
        }
        if (!Array.isArray(items)) items = [];

        let receipts = t.receipts;
        if (typeof receipts === 'string') {
            try { receipts = JSON.parse(receipts); } catch(e) { receipts = []; }
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

async function saveNewTable() {
    if (!navigator.onLine) {
        showCustomAlert('❌ Acción bloqueada: Debe estar conectado a internet para crear o modificar mesas.');
        return;
    }

    const nameInput = document.getElementById('newTableName');
    const name = nameInput.value.trim();
    if (!name) { showCustomAlert('Ingrese el nombre de la mesa.'); return; }

    if (editingTableId !== null) {
        const table = tables.find(t => t.id === editingTableId);
        if (table) table.name = name;
        cancelEditTable();
    } else {
        const newId = tables.length > 0 ? Math.max(...tables.map(t => Number(t.id) || 0)) + 1 : 1;
        tables.push({ id: newId, name: name, status: 'libre', items: [], receipts: [] });
    }

    appConfig.lastUpdated = Date.now();
    await saveDataAndSyncCloudSync('Mesa guardada y sincronizada exitosamente en Google Sheets.');
    nameInput.value = '';
    renderTablesAdmin();
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

async function deleteTable(id) {
    if (!navigator.onLine) {
        showCustomAlert('❌ Acción bloqueada: Debe estar conectado a internet para eliminar mesas.');
        return;
    }

    const table = tables.find(t => t.id === id);
    if (!table) return;
    
    if (table.status === 'ocupada' || (table.items && table.items.length > 0)) {
        showCustomAlert('No se puede eliminar una mesa ocupada.');
        return;
    }

    if (confirm(`¿Eliminar ${table.name}?`)) {
        tables = tables.filter(t => t.id !== id);
        if (editingTableId === id) cancelEditTable();
        appConfig.lastUpdated = Date.now();
        await saveDataAndSyncCloudSync('Mesa eliminada de Google Sheets.');
        renderTablesAdmin();
    }
}


/* ========================================================== */
/* 5. PEDIDOS Y COMANDAS                                      */
/* ========================================================== */

/**
 * Abre la sección de pedidos para una mesa.
 * Cómo lo realiza: Sincroniza desde la nube y prepara la interfaz de comandas.
 * Consulta a Sheets: Llama a `loadDataFromCloud()`.
 */
async function openTableOrder(id) {
    currentTableId = id;

    // 1. Carga ligera y segura con validación de red
    try {
        const [resTables, resProducts] = await Promise.all([
            fetch(`${WEB_APP_URL}?action=getTables`).catch(err => null),
            fetch(`${WEB_APP_URL}?action=getProducts`).catch(err => null)
        ]);

        if (resTables && resTables.ok) {
            const dataT = await resTables.json();
            if (dataT && dataT.status === 'success' && Array.isArray(dataT.tables)) {
                tables = dataT.tables;
            }
        }

        if (resProducts && resProducts.ok) {
            const dataP = await resProducts.json();
            if (dataP && dataP.status === 'success' && Array.isArray(dataP.products)) {
                products = dataP.products;
            }
        }

        saveData();
    } catch (e) {
        console.warn("Usando datos locales para la orden de mesa:", e);
    }

    const table = tables.find(t => t.id === id);
    if (!table) return;

    // Asegurar que items y receipts sean arreglos válidos
    if (typeof table.items === 'string') {
        try { table.items = JSON.parse(table.items); } catch (e) { table.items = []; }
    }
    if (!Array.isArray(table.items)) table.items = [];

    if (typeof table.receipts === 'string') {
        try { table.receipts = JSON.parse(table.receipts); } catch (e) { table.receipts = []; }
    }
    if (!Array.isArray(table.receipts)) table.receipts = [];

    // 2. Mostrar la sección de pedidos en pantalla
    await showSection('order-section');
    
    const titleEl = document.getElementById('orderTableTitle');
    if (titleEl) titleEl.innerText = `Pedido - ${table.name}`;

    // 3. Cargar la categoría inicial y los ítems
    filterPlusCategory('sopas');
    renderPlusOrderItems();
}





async function markTablePickedUp() {
    const table = tables.find(t => t.id === currentTableId);
    if (!table) return;

    table.items.forEach(item => {
        if (item.sentToKitchen && item.served) item.pickedUp = true;
    });

    appConfig.lastUpdated = Date.now();
    await saveDataAndSyncCloudSync('Pedido marcado como recogido.');
    const readyBanner = document.getElementById('readyForPickupBanner');
    if (readyBanner) readyBanner.style.display = 'none';
    renderPlusOrderItems();
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
        event.currentTarget.classList.add('active-cat'); // 👈 CORREGIDO: Usar event.currentTarget
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
        catalogGrid.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; font-size: 0.8rem; color: var(--text-secondary); padding: 1rem;">No hay productos activos en esta categoría.</div>';
        return;
    }

    itemsToDisplay.forEach(item => {
        const btn = document.createElement('div');
        btn.style.cssText = "background: #ffffff; border: 1px solid var(--border); border-radius: 6px; padding: 0.4rem; display: flex; flex-direction: column; justify-content: space-between; align-items: center; cursor: pointer; text-align: center; width: 110px; height: 55px; box-sizing: border-box;";
        const itemId = 'prod_' + item.id;

        btn.innerHTML = `
            <span style="font-size: 0.7rem; font-weight: bold; color: var(--text); overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; line-height: 1.1;">${item.name}</span>
            <span style="font-size: 0.7rem; color: var(--primary); font-weight: bold;">$${(item.price || 0).toLocaleString()}</span>
        `;

        btn.onclick = () => addProductDirectlyToOrder(itemId);
        catalogGrid.appendChild(btn);
    });
}

function addProductDirectlyToOrder(itemIdentifier) {
    const table = tables.find(t => t.id === currentTableId);
    if (!table) return;

    const id = parseInt(String(itemIdentifier).replace('prod_', '').replace('drink_', '').replace('addon_', ''), 10);
    const prod = products.find(p => p.id === id);
    if (!prod) return;

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

    table.items.push(orderItemData);
    table.status = 'ocupada';

    renderPlusOrderItems();
    saveData();
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


function updateItemKitchenCheck(index, isChecked) {
    const table = tables.find(t => t.id === currentTableId);
    if (table && table.items[index]) {
        table.items[index].kitchenChecked = isChecked;
        saveData();
    }
}

function updateItemObservation(index, textValue) {
    const table = tables.find(t => t.id === currentTableId);
    if (table && table.items[index]) {
        table.items[index].observation = textValue;
        table.items[index].modifications = textValue ? [`Nota: ${textValue}`] : [];
        saveData();
    }
}

async function removePlusOrderItem(index) {
    const table = tables.find(t => t.id === currentTableId);
    const item = table.items[index];

    if (item && item.billed) {
        showCustomAlert('Este plato ya fue facturado.');
        return;
    }

    table.items.splice(index, 1);
    if (table.items.length === 0) table.status = 'libre';

    renderPlusOrderItems();
    saveData();
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

async function sendOrderToKitchen() {
    const table = tables.find(t => t.id === currentTableId);
    if (!table || !table.items || table.items.length === 0) {
        showCustomAlert('No hay platos en esta mesa.');
        return;
    }

    const itemsToSend = table.items.filter(item => !item.sentToKitchen && item.kitchenChecked);

    if (itemsToSend.length === 0) {
        showCustomAlert('⚠️ Por favor seleccione con el checkbox al menos un plato nuevo para enviar a cocina.');
        return;
    }

    const now = Date.now();

    table.items.forEach(item => {
        if (!item.sentToKitchen && item.kitchenChecked) {
            item.sentToKitchen = true;
            item.served = false;
            item.pickedUp = false;
            item.sentAt = now;
            item.kitchenChecked = true;
        }
    });

    table.status = 'ocupada';
    appConfig.lastUpdated = now;

    renderPlusOrderItems();
    saveData();

    try {
        await syncDataToCloud();
        showCustomAlert(`👨‍🍳 Comanda enviada a cocina exitosamente (${itemsToSend.length} ítem(s)).`);
    } catch (error) {
        showCustomAlert(`⚠️ Guardado localmente. Se sincronizará al haber red.`);
    }

    showSection('tables-section');
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

async function markBatchServed(tableId, batchId) {
    const table = tables.find(t => t.id === tableId);
    if (!table) return;

    if (confirm(`¿Marcar este lote de la ${table.name} como servido?`)) {
        table.items.forEach(item => {
            if (item.sentToKitchen && item.sentAt === batchId) {
                item.served = true;
                item.pickedUp = false;
            }
        });
        appConfig.lastUpdated = Date.now();
        renderKitchenOrders();
        await syncDataToCloud();
    }
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
    document.getElementById('bill-title').innerText = `Cuenta - ${table.name}`;
    const list = document.getElementById('billItemsList');
    if (!list) return;

    list.innerHTML = '';
    table.items.forEach((item, index) => {
        const div = document.createElement('div');
        div.className = 'order-item';
        div.innerHTML = `
            <label class="checkbox-label" style="flex: 1;">
                <input type="checkbox" class="bill-item-chk" value="${index}" data-price="${item.finalPrice}" onchange="calculatePartialTotal()">
                <span><strong>${item.name}</strong> ${item.observation ? '(' + item.observation + ')' : ''}</span>
            </label>
            <strong>$${item.finalPrice.toLocaleString()}</strong>
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

async function generateReceipt() {
    const table = tables.find(t => t.id === currentTableId);
    const receiptItems = [];
    const receiptItemUids = [];
    let partialTotal = 0;

    document.querySelectorAll('.bill-item-chk:checked').forEach(chk => {
        const idx = parseInt(chk.value, 10);
        const item = table.items[idx];
        partialTotal += item.finalPrice;
        receiptItems.push({ ...item });
        receiptItemUids.push(item.uid);
        item.billed = true;
    });

    if (receiptItems.length === 0) {
        showCustomAlert('Seleccione al menos un ítem.');
        return;
    }

    table.receipts.push({
        id: Date.now(),
        items: receiptItems,
        itemUids: receiptItemUids,
        total: Math.round(partialTotal),
        date: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    });

    appConfig.lastUpdated = Date.now();
    await syncDataToCloud();
    openBillSection();
}

function renderReceiptsManager() {
    const table = tables.find(t => t.id === currentTableId);
    let container = document.getElementById('receiptsManagerContainer');

    if (!container) {
        container = document.createElement('div');
        container.id = 'receiptsManagerContainer';
        container.style.cssText = "margin-top: 1rem; border-top: 2px dashed var(--border); padding-top: 0.75rem;";
        const billItemsList = document.getElementById('billItemsList');
        if (billItemsList && billItemsList.nextSibling) {
            document.getElementById('bill-section').insertBefore(container, billItemsList.nextSibling);
        }
    }

    if (!table.receipts || table.receipts.length === 0) {
        container.innerHTML = '<p style="font-size: 0.85rem; color: var(--text-secondary); text-align: center;">No hay recibos.</p>';
        return;
    }

    let html = `<h4>Recibos Generados:</h4>`;
    table.receipts.forEach((rc, rIdx) => {
        html += `
            <div style="background: #f1f5f9; padding: 0.5rem; border-radius: 6px; margin-bottom: 0.4rem; display: flex; justify-content: space-between; align-items: center; font-size: 0.85rem;">
                <div><strong>Recibo #${rIdx + 1}</strong> - $${rc.total.toLocaleString()}</div>
                <div style="display: flex; gap: 0.3rem;">
                    <button class="btn btn-success" style="padding: 0.2rem 0.4rem; font-size: 0.75rem; width: auto;" onclick="confirmPayReceipt(${rc.id})">Pagar</button>
                    <button class="btn btn-danger" style="padding: 0.2rem 0.4rem; font-size: 0.75rem; width: auto;" onclick="cancelReceipt(${rc.id})">Anular</button>
                </div>
            </div>
        `;
    });
    container.innerHTML = html;
}

/**
 * Registra el pago del recibo y guarda la venta en Google Sheets.
 * Cómo lo realiza: Inserta filas en la tabla `Facturas` y actualiza estados de mesa.
 * Consulta a Sheets: Inserta en `Facturas` vía `sendNewSalesToCloud()`.
 */
async function confirmPayReceipt(receiptId) {
    const table = tables.find(t => t.id === currentTableId);
    const receiptIndex = table.receipts.findIndex(r => r.id === receiptId);
    if (receiptIndex === -1) return;

    const receipt = table.receipts[receiptIndex];
    if (confirm(`¿Cobrar recibo por valor de $${receipt.total.toLocaleString()}?`)) {
        const nowFull = new Date();
        const facNumero = `FAC-${nowFull.getFullYear()}${String(nowFull.getMonth() + 1).padStart(2, '0')}${String(nowFull.getDate()).padStart(2, '0')}${String(nowFull.getHours()).padStart(2, '0')}${String(nowFull.getMinutes()).padStart(2, '0')}`;

        const newSalesBatch = [];
        receipt.items.forEach(item => {
            newSalesBatch.push({
                facnumero: facNumero,
                mesa: table.name,
                plato: item.name,
                detallesmodificaciones: item.observation || 'Ninguna',
                valorpagado: item.finalPrice,
                fecha: new Date().toLocaleDateString(),
                hora: new Date().toLocaleTimeString(),
                usuario: localStorage.getItem('restopos_current_user') || 'admin'
            });
        });

        salesHistory.push(...newSalesBatch);
        table.receipts.splice(receiptIndex, 1);
        table.items = table.items.filter(item => !receipt.itemUids.includes(item.uid));

        appConfig.lastUpdated = Date.now();
        await sendNewSalesToCloud(newSalesBatch);

        if (table.items.length === 0 && table.receipts.length === 0) {
            table.status = 'libre';
            saveData();
            await syncDataToCloud();
            showCustomAlert('✅ ¡Pago registrado con éxito!', () => showSection('tables-section'));
        } else {
            saveData();
            await syncDataToCloud();
            openBillSection();
        }
    }
}

async function cancelReceipt(receiptId) {
    const table = tables.find(t => t.id === currentTableId);
    const receiptIndex = table.receipts.findIndex(r => r.id === receiptId);
    if (receiptIndex === -1) return;

    if (confirm('¿Anular recibo?')) {
        table.receipts.splice(receiptIndex, 1);
        appConfig.lastUpdated = Date.now();
        saveData();
        openBillSection();
        await syncDataToCloud();
    }
}

function backToOrderSection() {
    document.getElementById('bill-section').classList.add('hidden');
    document.getElementById('order-section').classList.remove('hidden');
}


/* ========================================================== */
/* 8. ALERTAS Y MODALES                                       */
/* ========================================================== */

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

    if (editingProductId !== null) {
        const prod = products.find(p => p.id === editingProductId);
        if (prod) {
            prod.name = name;
            prod.price = price;
            prod.category = category;
            prod.active = active;
        }
        cancelEditProduct();
    } else {
        const newId = products.length > 0 ? Math.max(...products.map(p => p.id)) + 1 : 1;
        products.push({ id: newId, name, price, category, active });
    }

    appConfig.lastUpdated = Date.now();
    await saveDataAndSyncCloudSync('Plato guardado y sincronizado exitosamente.');
    cancelEditProduct();
    renderProducts();
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

async function deleteProduct(id) {
    const prod = products.find(p => p.id === id);
    if (!prod) return;

    if (confirm(`¿Desea eliminar el plato "${prod.name}"?`)) {
        products = products.filter(p => p.id !== id);
        if (editingProductId === id) cancelEditProduct();
        appConfig.lastUpdated = Date.now();
        await saveDataAndSyncCloudSync('Plato eliminado exitosamente.');
        renderProducts();
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

/**
 * Descarga todos los datos operativos desde Google Apps Script.
 * Cómo lo realiza: Ejecuta una petición GET con `action=getData`.
 * Consulta a Sheets: Lee las tablas `Mesas`, `Productos`, `Bebidas`, `Adicionales`, `Usuarios` y `Config`.
 */
async function loadDataFromCloud() {
    try {
        const response = await fetch(`${WEB_APP_URL}?action=getData`);
        if (!response.ok) throw new Error("Error HTTP");
        const cloudData = await response.json();
        if (cloudData && cloudData.status !== 'error') {
            if (Array.isArray(cloudData.tables)) tables = cloudData.tables;
            if (Array.isArray(cloudData.products)) products = cloudData.products;
            if (Array.isArray(cloudData.drinks)) drinks = cloudData.drinks;
            if (Array.isArray(cloudData.addons)) addons = cloudData.addons;
            if (Array.isArray(cloudData.users)) users = cloudData.users;
            if (cloudData.config) appConfig = cloudData.config;
            saveData();
            return true;
        }
    } catch (e) {
        console.warn("Usando caché local:", e);
        return false;
    }
}

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

async function syncDataToCloud() {
    try {
        await fetch(WEB_APP_URL, {
            method: 'POST',
            body: JSON.stringify({ tables, products, drinks, addons, users, config: appConfig })
        });
    } catch (e) {
        console.error("Error sincronizando:", e);
    }
}

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

function saveData() {
    localStorage.setItem('restopos_tables', JSON.stringify(tables));
    localStorage.setItem('restopos_addons', JSON.stringify(addons));
    localStorage.setItem('restopos_products', JSON.stringify(products));
    localStorage.setItem('restopos_drinks', JSON.stringify(drinks));
    localStorage.setItem('restopos_sales_history', JSON.stringify(salesHistory));
    localStorage.setItem('restopos_users', JSON.stringify(users));
    localStorage.setItem('restopos_config', JSON.stringify(appConfig));
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
 * Consulta las facturas filtradas en Google Sheets y renderiza métricas, gráfica y Top Productos.
 */
async function fetchAndRenderSalesData() {
    const container = document.getElementById('dashboardAnalyticsContainer');
    if (!container) return;

    const startDate = document.getElementById('dashStartDate')?.value || "";
    const endDate = document.getElementById('dashEndDate')?.value || "";

    container.innerHTML = `
        <div style="text-align: center; padding: 2rem; color: var(--text-secondary);">
            <p>🔄 Consultando facturas filtradas en la nube...</p>
        </div>
    `;

    try {
        const response = await fetch(`${WEB_APP_URL}?action=getDashboardDataFiltered&startDate=${startDate}&endDate=${endDate}`);
        if (!response.ok) throw new Error("Error HTTP: " + response.status);

        const result = await response.json();
        if (result.status === 'success' && Array.isArray(result.salesHistory)) {
            salesHistory = result.salesHistory;
        } else {
            throw new Error(result.message || "Respuesta inválida del servidor.");
        }
    } catch (e) {
        console.warn("No se pudo consultar el servidor, usando caché local.", e);
        salesHistory = JSON.parse(localStorage.getItem('restopos_sales_history')) || [];
    }

    container.innerHTML = '';

    if (!Array.isArray(salesHistory) || salesHistory.length === 0) {
        container.innerHTML = `
            <div style="background: #ffffff; border: 1px solid var(--border); padding: 2rem; border-radius: 12px; text-align: center; color: var(--text-secondary);">
                <h3 style="font-size: 1rem; margin-bottom: 0.5rem; color: var(--text);">Sin datos de ventas en este rango</h3>
                <p style="font-size: 0.85rem;">No se encontraron facturas entre ${startDate} y ${endDate}.</p>
            </div>
        `;
        return;
    }

    let totalRevenue = 0;
    const totalInvoicesSet = new Set();
    const productCounts = {};

    salesHistory.forEach(sale => {
        const price = parseFloat(sale.valorpagado) || 0;
        totalRevenue += price;
        if (sale.facnumero) totalInvoicesSet.add(sale.facnumero);

        const plato = sale.plato || 'Producto General';
        productCounts[plato] = (productCounts[plato] || 0) + 1;
    });

    const totalInvoices = totalInvoicesSet.size;
    const averageTicket = totalInvoices > 0 ? totalRevenue / totalInvoices : 0;
    const sortedProducts = Object.entries(productCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);

    let topProductsHtml = '';
    sortedProducts.forEach(([prod, count]) => {
        topProductsHtml += `
            <div style="display: flex; justify-content: space-between; padding: 0.5rem 0; border-bottom: 1px dashed var(--border); font-size: 0.85rem;">
                <span>${prod}</span>
                <strong>${count} vendidos</strong>
            </div>
        `;
    });

    // Detectar si el rango es mensual (> 10 días) o semanal para elegir el tipo de gráfica
    const diffTime = Math.abs(new Date(endDate) - new Date(startDate));
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    const chartViewType = diffDays > 10 ? 'month' : 'week';
    const salesChartHtml = renderSalesChart(salesHistory, chartViewType);

    container.innerHTML = `
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 0.75rem; margin-bottom: 1rem;">
            <div style="background: #f8fafc; border: 1px solid var(--border); padding: 0.75rem; border-radius: 8px; text-align: center;">
                <span style="font-size: 0.75rem; color: var(--text-secondary); display: block;">VENTA TOTAL</span>
                <strong style="font-size: 1.1rem; color: var(--primary);">$${Math.round(totalRevenue).toLocaleString()}</strong>
            </div>
            <div style="background: #f8fafc; border: 1px solid var(--border); padding: 0.75rem; border-radius: 8px; text-align: center;">
                <span style="font-size: 0.75rem; color: var(--text-secondary); display: block;">TICKET PROMEDIO</span>
                <strong style="font-size: 1.1rem; color: var(--success);">$${Math.round(averageTicket).toLocaleString()}</strong>
            </div>
            <div style="background: #f8fafc; border: 1px solid var(--border); padding: 0.75rem; border-radius: 8px; text-align: center;">
                <span style="font-size: 0.75rem; color: var(--text-secondary); display: block;">TOTAL FACTURAS</span>
                <strong style="font-size: 1.1rem; color: var(--text);">${totalInvoices}</strong>
            </div>
        </div>

        ${salesChartHtml}

        <div style="background: #ffffff; border: 1px solid var(--border); padding: 0.75rem; border-radius: 8px; margin-bottom: 1rem;">
            <h4 style="font-size: 0.95rem; margin-bottom: 0.5rem; color: var(--text);">🏆 Top Productos Más Vendidos</h4>
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
                    <line x1="0" y1="${chartHeight/2}" x2="${chartWidth}" y2="${chartHeight/2}" stroke="#f1f5f9" stroke-width="1"/>
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
