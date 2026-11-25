/**
 * ==========================================================
 * RENDERIZAR MENÚ PRINCIPAL DEL ADMINISTRADOR
 * ==========================================================
 *
 * Función:
 * Construye dinámicamente las tarjetas de navegación del
 * panel principal del administrador.
 *
 * Funcionamiento:
 * - Obtiene el contenedor #dashboardMenuGrid.
 * - Limpia las tarjetas existentes.
 * - Genera las opciones de navegación disponibles.
 * - Asigna a cada tarjeta su acción correspondiente.
 * - Inserta las tarjetas en el panel principal.
 *
 * Dependencias:
 * - showSection(): Gestiona la navegación entre módulos.
 *
 * Fuente de datos:
 * No realiza consultas a Firebase ni modifica Firestore.
 *
 * Parámetros:
 * @param {string} role - Rol del usuario autenticado.
 *
 * ==========================================================
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
 * ==========================================================
 * NAVEGACIÓN PRINCIPAL Y CONTROL DE ACCESO
 * ==========================================================
 *
 * Función:
 * Gestiona el cambio entre las diferentes secciones de
 * RESTOPOS y controla el acceso según el rol del usuario.
 *
 * Funcionamiento:
 * - Identifica el rol del usuario mediante localStorage.
 * - Valida los permisos para acceder a cada sección.
 * - Carga los datos necesarios desde Firebase y Firestore.
 * - Oculta las secciones anteriores y muestra la solicitada.
 * - Detiene los intervalos y desconecta los escuchadores
 *   anteriores de Firestore.
 * - Ejecuta la inicialización correspondiente al módulo.
 *
 * Módulos gestionados:
 * - Dashboard principal.
 * - Gestión de mesas y pedidos.
 * - Administración de mesas.
 * - Cocina y seguimiento de comandas.
 * - Gestión de usuarios.
 * - Catálogo de productos.
 * - Dashboard de ventas.
 *
 * Sincronización con Firebase:
 * - Consulta documentos mediante RestoposDB.getAll().
 * - Escucha cambios en tiempo real mediante
 *   RestoposDB.listenCollection().
 * - Actualiza las variables globales y el almacenamiento local.
 * - Gestiona la desconexión de escuchadores anteriores.
 *
 * Dependencias:
 * - loadDataFromCloud()
 * - saveData()
 * - renderDashboardMenu()
 * - renderTables()
 * - renderTablesAdmin()
 * - renderKitchenOrders()
 * - renderUsersAdmin()
 * - renderRecipeCheckboxes()
 * - renderProducts()
 * - renderSalesDashboard()
 * - checkWaiterReadyAlarm()
 * - cancelEditTable()
 * - cancelEditUser()
 * - cancelEditProduct()
 *
 * Parámetros:
 * @param {string} sectionId - Identificador HTML de la sección
 *                             que se desea mostrar.
 *
 * ==========================================================
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

    // CORRECCIÓN: No descargar datos pesados en el menú principal, mesas, dashboard analítico, catálogo ni pedidos, comandas tampoco
    if (![
        'dashboard-view',
        'tables-section',
        'dashboard-analytics-section',
        'catalog-section',
        'tables-admin-section',
        'order-section',
        'kitchen-section'].includes(sectionId)) {
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

    if (kitchenInterval) {
        clearInterval(kitchenInterval);
        kitchenInterval = null;
    }

    if (kitchenCloudPollInterval) {
        clearInterval(kitchenCloudPollInterval);
        kitchenCloudPollInterval = null;
    }

    // Desconectar escuchador anterior de Firestore
    if (kitchenFirestoreUnsubscribe) {
        kitchenFirestoreUnsubscribe();
        kitchenFirestoreUnsubscribe = null;
    }

    if (tablesRefreshInterval) {
        clearInterval(tablesRefreshInterval);
        tablesRefreshInterval = null;
    }
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

        // Carga inicial de mesas desde Firebase
        try {
            console.log('RESTOPOS: Consultando mesas en Firebase...');

            const cloudTables = await window.RestoposDB.getAll('mesas');

            if (Array.isArray(cloudTables)) {
                tables = cloudTables;
                saveData();

                console.log(
                    'RESTOPOS: Mesas cargadas desde Firebase:',
                    tables.length
                );
            }

        } catch (e) {
            console.error(
                'RESTOPOS: Error cargando mesas desde Firebase:',
                e.code,
                e.message
            );

            console.warn('Se conservarán las mesas locales.');
        }

        renderTables();

        // ⬇️ AGREGAN AQUÍ LA LÍNEA NUEVA: ⬇️
        checkWaiterReadyAlarm();

        // Actualización automática de mesas desde Firebase cada 60 segundos
        // let isRefreshingTables = false;

        
        // Escuchar cambios de mesas en tiempo real desde Firebase.
        console.log(
            'RESTOPOS: Activando escucha en tiempo real para mesas...'
        );

        kitchenFirestoreUnsubscribe = window.RestoposDB.listenCollection(
            'mesas',

            (cloudTables) => {

                const tablesSec = document.getElementById('tables-section');

                // Comprobar que la pantalla de mesas siga abierta.
                if (
                    !tablesSec ||
                    tablesSec.classList.contains('hidden')
                ) {
                    return;
                }

                if (Array.isArray(cloudTables)) {

                    // Actualizar las mesas con los datos de Firebase.
                    tables = cloudTables;

                    // Guardar los datos locales.
                    saveData();

                    // Actualizar visualmente las mesas.
                    renderTables();

                    // Comprobar si cocina atendió alguna comanda.
                    checkWaiterReadyAlarm();

                    console.log(
                        'RESTOPOS: Mesas sincronizadas en tiempo real.',
                        'Mesas:',
                        tables.length
                    );
                }
            },

            (error) => {
                console.error(
                    'RESTOPOS: Error en escucha de mesas:',
                    error.code,
                    error.message
                );
            }
        );


    } else if (sectionId === 'tables-admin-section') {
        cancelEditTable();

        // Consultar mesas desde Firebase
        try {
            console.log('RESTOPOS: Cargando administración de mesas desde Firebase...');

            const cloudTables = await window.RestoposDB.getAll('mesas');

            if (Array.isArray(cloudTables)) {
                tables = cloudTables;
                saveData();

                console.log(
                    'RESTOPOS: Mesas disponibles para administración:',
                    tables.length
                );
            }

        } catch (e) {
            console.error(
                'RESTOPOS: Error cargando administración de mesas:',
                e.code,
                e.message
            );
        }

        renderTablesAdmin();

    } else if (sectionId === 'kitchen-section') {
        const kitchenSection = document.getElementById('kitchen-section');
        if (!kitchenSection) return;

        const timerConfigBox = document.getElementById('kitchenTimerConfigBox');

        if (timerConfigBox) {
            timerConfigBox.style.display = (role === 'admin') ? 'flex' : 'none';
        }

        // Carga inicial: descargar exclusivamente las mesas y comandas.
        // Carga inicial: consultar mesas y comandas desde Firebase.
        try {
            console.log('RESTOPOS: Cargando comandas de cocina desde Firebase...');

            const cloudTables = await window.RestoposDB.getAll('mesas');

            if (!Array.isArray(cloudTables)) {
                throw new Error('Firebase no devolvió una lista válida de mesas.');
            }

            tables = cloudTables;

            saveData();

            console.log(
                'RESTOPOS: Comandas cargadas desde Firebase:',
                tables.length
            );

        } catch (e) {
            console.error(
                'RESTOPOS: Error cargando comandas desde Firebase:',
                e.code,
                e.message
            );

            console.warn('Se conservarán las comandas locales de cocina.');
        }

        renderKitchenOrders();

        // Actualización visual local cada segundo.
        kitchenInterval = setInterval(() => {
            if (
                kitchenSection &&
                !kitchenSection.classList.contains('hidden')
            ) {
                renderKitchenOrders();
            } else {
                clearInterval(kitchenInterval);
                kitchenInterval = null;
            }
        }, 1000);

        // Escuchar cambios de mesas y comandas en tiempo real desde Firebase.
        console.log('RESTOPOS: Activando escucha en tiempo real para cocina...');

        kitchenFirestoreUnsubscribe = window.RestoposDB.listenCollection(
            'mesas',

            (cloudTables) => {
                const kitchenSection = document.getElementById('kitchen-section');

                if (
                    !kitchenSection ||
                    kitchenSection.classList.contains('hidden')
                ) {
                    return;
                }

                if (Array.isArray(cloudTables)) {
                    tables = cloudTables;

                    saveData();

                    renderKitchenOrders();

                    console.log(
                        'RESTOPOS: Cocina sincronizada en tiempo real.',
                        'Mesas:',
                        tables.length
                    );
                }
            },

            (error) => {
                console.error(
                    'RESTOPOS: Error en escucha de cocina:',
                    error.code,
                    error.message
                );
            }
        );


    } else if (sectionId === 'users-admin-section') {
        cancelEditUser();

        // Cargar usuarios desde Firestore antes de mostrarlos.
        try {
            console.log('RESTOPOS: Cargando usuarios desde Firebase...');

            const cloudUsers = await window.RestoposDB.getAll('usuarios');

            if (Array.isArray(cloudUsers)) {
                users = cloudUsers;

                localStorage.setItem(
                    'restopos_users',
                    JSON.stringify(users)
                );

                console.log(
                    'RESTOPOS: Usuarios cargados desde Firebase:',
                    users.length
                );
            }

        } catch (error) {
            console.error(
                'RESTOPOS: Error cargando usuarios desde Firebase:',
                error.code,
                error.message
            );

            showCustomAlert('No fue posible cargar los usuarios desde Firebase.');
            return;
        }

        renderUsersAdmin();
    } else if (sectionId === 'catalog-section') {
        cancelEditProduct();

        // Consultar productos desde Firebase
        try {
            console.log('RESTOPOS: Cargando catálogo desde Firebase...');

            const cloudProducts = await window.RestoposDB.getAll('productos');

            if (Array.isArray(cloudProducts)) {
                products = cloudProducts;

                // Mantener compatibilidad con bebidas y adicionales
                drinks = products.filter(product =>
                    String(product.category || '').toLowerCase() === 'bebidas'
                );

                addons = products.filter(product =>
                    String(product.category || '').toLowerCase() === 'adicionales'
                );

                saveData();

                console.log(
                    'RESTOPOS: Catálogo cargado desde Firebase:',
                    products.length
                );
            }

        } catch (e) {
            console.error(
                'RESTOPOS: Error cargando catálogo desde Firebase:',
                e.code,
                e.message
            );
        }

        renderRecipeCheckboxes();
        renderProducts();
    } else if (sectionId === 'dashboard-analytics-section') {
        renderSalesDashboard();
    }
}




/**
 * ==========================================================
 * VERIFICAR PLATOS LISTOS Y ACTIVAR ALARMA DEL MESERO
 * ==========================================================
 *
 * Función:
 * Comprueba si existen platos que ya fueron preparados por
 * cocina y están pendientes de ser recogidos por el mesero.
 *
 * Funcionamiento:
 * - Revisa las mesas almacenadas en la variable global tables.
 * - Examina los productos registrados en cada comanda.
 * - Identifica los elementos enviados a cocina, marcados como
 *   servidos y que todavía no han sido recogidos.
 * - Consulta el intervalo configurado en appConfig.
 * - Controla el tiempo transcurrido desde la última alarma.
 * - Reproduce una alerta sonora cuando corresponde.
 *
 * Dependencias:
 * - tables: Estado global de las mesas y sus comandas.
 * - appConfig: Configuración general de RESTOPOS.
 * - lastWaiterAlarmTime: Marca temporal de la última alerta.
 * - playAlarmBeep(): Reproduce la señal sonora.
 *
 * Fuente de datos:
 * Utiliza los datos disponibles en memoria, previamente
 * sincronizados con Firestore.
 *
 * ==========================================================
 */
function checkWaiterReadyAlarm() {
    const now = Date.now();
    const tablesArray = Array.isArray(tables) ? tables : [];

    const hasReadyTables = tablesArray.some(t => {
        let items = t.items;
        if (typeof items === 'string') {
            try { items = JSON.parse(items); } catch (e) { items = []; }
        }
        return Array.isArray(items) && items.some(i => i.sentToKitchen && i.served && !i.pickedUp);
    });

    if (hasReadyTables) {
        const intervalMs = (appConfig.waiterAlarmInterval || 20) * 1000;
        if (now - lastWaiterAlarmTime >= intervalMs) {
            playAlarmBeep();
            lastWaiterAlarmTime = now;
        }
    }
}