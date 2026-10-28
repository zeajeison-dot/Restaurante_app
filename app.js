window.onload = function() {
    if (localStorage.getItem('restopos_logged') === 'true') {
        document.getElementById('login-view').classList.add('hidden');
        document.getElementById('dashboard-view').classList.remove('hidden');
        document.getElementById('welcome-msg').innerText = 'Administrador General';
    }
};

let tables = JSON.parse(localStorage.getItem('restopos_tables')) || [
    { id: 1, name: 'Mesa 1', status: 'libre', items: [] },
    { id: 2, name: 'Mesa 2', status: 'libre', items: [] },
    { id: 3, name: 'Mesa 3', status: 'libre', items: [] },
    { id: 4, name: 'Mesa 4', status: 'libre', items: [] },
    { id: 5, name: 'Mesa 5', status: 'libre', items: [] },
    { id: 6, name: 'Mesa 6', status: 'libre', items: [] }
];

let addons = JSON.parse(localStorage.getItem('restopos_addons')) || [
    { id: 1, name: 'Papas a la francesa', price: 0 },
    { id: 2, name: 'Ensalada', price: 0 },
    { id: 3, name: 'Plátano maduro', price: 0 },
    { id: 4, name: 'Queso extra', price: 3000 }
];

let products = JSON.parse(localStorage.getItem('restopos_products')) || [
    { id: 1, name: 'Costillas BBQ', price: 22000, components: [1, 2] }
];

let inventory = JSON.parse(localStorage.getItem('restopos_inventory')) || [];
let currentTableId = null;
let editingProductId = null;
let editingAddonId = null;
let editingOrderItemIndex = null;

function saveData() {
    localStorage.setItem('restopos_tables', JSON.stringify(tables));
    localStorage.setItem('restopos_addons', JSON.stringify(addons));
    localStorage.setItem('restopos_products', JSON.stringify(products));
    localStorage.setItem('restopos_inventory', JSON.stringify(inventory));
}

function login() {
    if(document.getElementById('userInput').value === 'admin' && document.getElementById('passInput').value === '123') {
        localStorage.setItem('restopos_logged', 'true');
        document.getElementById('login-view').classList.add('hidden');
        document.getElementById('dashboard-view').classList.remove('hidden');
        document.getElementById('welcome-msg').innerText = 'Administrador General';
    } else { alert('Credenciales incorrectas (admin / 123)'); }
}

function logout() {
    localStorage.removeItem('restopos_logged');
    document.getElementById('dashboard-view').classList.add('hidden');
    document.getElementById('login-view').classList.remove('hidden');
    document.getElementById('userInput').value = '';
    document.getElementById('passInput').value = '';
}

function showSection(sectionId) {
    document.getElementById('dashboard-view').classList.add('hidden');
    document.getElementById('tables-section').classList.add('hidden');
    document.getElementById('order-section').classList.add('hidden');
    document.getElementById('catalog-section').classList.add('hidden');
    document.getElementById('addons-section').classList.add('hidden');
    document.getElementById('inventory-section').classList.add('hidden');
    
    document.getElementById(sectionId).classList.remove('hidden');
    if(sectionId === 'tables-section') renderTables();
    if(sectionId === 'catalog-section') { cancelEditProduct(); renderRecipeCheckboxes(); renderProducts(); }
    if(sectionId === 'addons-section') { cancelEditAddon(); renderAddons(); }
    if(sectionId === 'inventory-section') renderInventory();
}

function renderTables() {
    const container = document.getElementById('tableGridContainer');
    container.innerHTML = '';
    tables.forEach(t => {
        const div = document.createElement('div');
        div.className = `table-item ${t.status}`;
        div.innerHTML = `${t.name}<br><span style="font-size:0.75rem; text-transform:uppercase;">${t.status}</span>`;
        div.onclick = () => openTableOrder(t.id);
        container.appendChild(div);
    });
}

function openTableOrder(id) {
    currentTableId = id;
    const table = tables.find(t => t.id === id);
    document.getElementById('order-title').innerText = `Pedido - ${table.name}`;
    
    const select = document.getElementById('productSelect');
    select.innerHTML = '<option value="">-- Seleccione un plato --</option>';
    products.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.innerText = `${p.name} - $${p.price.toLocaleString()}`;
        select.appendChild(opt);
    });

    cancelOrderEdit();
    renderOrderItems();
    document.getElementById('tables-section').classList.add('hidden');
    document.getElementById('order-section').classList.remove('hidden');
}

function loadProductRecipeOptions(selectedComponentChoices = [], selectedAddonIds = []) {
    const prodId = parseInt(document.getElementById('productSelect').value);
    const box = document.getElementById('dishCustomizationBox');
    if (!prodId) { box.style.display = 'none'; return; }

    const product = products.find(p => p.id === prodId);
    box.style.display = 'block';

    const compList = document.getElementById('recipeComponentsList');
    compList.innerHTML = '<strong style="font-size:0.85rem; color:var(--text-secondary);">Componentes Base:</strong>';
    
    if (product.components && product.components.length > 0) {
        product.components.forEach((compId, idx) => {
            const addonObj = addons.find(a => a.id === compId);
            if (addonObj) {
                const div = document.createElement('div');
                div.style.cssText = "display: flex; align-items: center; justify-content: space-between; margin-top: 0.4rem; font-size: 0.9rem;";
                
                let subOptions = `<option value="Mantener (${addonObj.name})">Mantener (${addonObj.name})</option>`;
                addons.filter(a => a.price === 0).forEach(freeA => {
                    if (freeA.id !== compId) {
                        subOptions += `<option value="Cambiado por ${freeA.name}">Cambiar por ${freeA.name} (Sin costo)</option>`;
                    }
                });
                subOptions += `<option value="SIN ${addonObj.name}">[Retirar sin sustituto]</option>`;

                div.innerHTML = `
                    <span>${addonObj.name}</span>
                    <select class="component-choice" data-original="${addonObj.name}" style="width: 55%; padding: 0.3rem; font-size: 0.85rem;">
                        ${subOptions}
                    </select>
                `;
                compList.appendChild(div);

                if (selectedComponentChoices.length > 0 && selectedComponentChoices[idx]) {
                    const selectEl = div.querySelector('.component-choice');
                    selectEl.value = selectedComponentChoices[idx];
                }
            }
        });
    } else {
        compList.innerHTML += '<p style="font-size:0.85rem; color:var(--text-secondary);">Este plato no tiene componentes base.</p>';
    }

    const addonsBox = document.getElementById('addonsSelectionList');
    addonsBox.innerHTML = '<strong style="font-size:0.85rem; color:var(--text-secondary); display:block; margin-top:0.75rem;">Adicionales con costo extra:</strong>';
    
    let extraAddonsExist = false;
    addons.forEach(ad => {
        if (ad.price > 0) {
            extraAddonsExist = true;
            const isChecked = selectedAddonIds.includes(ad.id) ? 'checked' : '';
            const div = document.createElement('div');
            div.style.cssText = "display: flex; align-items: center; margin-top: 0.4rem;";
            div.innerHTML = `
                <label class="checkbox-label">
                    <input type="checkbox" class="addon-checkbox" value="${ad.id}" data-price="${ad.price}" data-name="${ad.name}" ${isChecked}>
                    <span>${ad.name} (+$${ad.price.toLocaleString()})</span>
                </label>
            `;
            addonsBox.appendChild(div);
        }
    });
    if (!extraAddonsExist) {
        addonsBox.innerHTML += '<p style="font-size:0.85rem; color:var(--text-secondary);">No hay adicionales con costo registrados.</p>';
    }
}

function saveOrderCustomization() {
    const prodId = parseInt(document.getElementById('productSelect').value);
    const product = products.find(p => p.id === prodId);
    const table = tables.find(t => t.id === currentTableId);

    if (!product || !table) { alert('Seleccione un plato válido.'); return; }

    let finalPrice = product.price;
    let modifications = [];
    let componentChoices = [];
    let addonIds = [];

    document.querySelectorAll('.component-choice').forEach(select => {
        const choice = select.value;
        componentChoices.push(choice);
        if (choice.startsWith('SIN ') || choice.startsWith('Cambiado por ')) {
            modifications.push(choice);
        }
    });

    document.querySelectorAll('.addon-checkbox:checked').forEach(chk => {
        const id = parseInt(chk.value);
        const name = chk.getAttribute('data-name');
        const price = parseFloat(chk.getAttribute('data-price')) || 0;
        addonIds.push(id);
        finalPrice += price;
        modifications.push(`Adicional: ${name} (+$${price.toLocaleString()})`);
    });

    const orderItemData = {
        productId: product.id,
        name: product.name,
        basePrice: product.price,
        finalPrice: finalPrice,
        modifications: modifications,
        componentChoices: componentChoices,
        addonIds: addonIds
    };

    if (editingOrderItemIndex !== null) {
        table.items[editingOrderItemIndex] = orderItemData;
    } else {
        table.items.push(orderItemData);
    }

    table.status = 'ocupada';
    saveData();
    cancelOrderEdit();
    renderOrderItems();
}

function editOrderItem(index) {
    const table = tables.find(t => t.id === currentTableId);
    const item = table.items[index];
    if (!item) return;

    editingOrderItemIndex = index;
    document.getElementById('productSelect').value = item.productId;
    
    loadProductRecipeOptions(item.componentChoices || [], item.addonIds || []);

    document.getElementById('customizationBoxTitle').innerText = `Editando: ${item.name}`;
    document.getElementById('btnAddOrUpdateOrder').innerText = 'Guardar Cambios del Plato';
    document.getElementById('btnCancelOrderEdit').classList.remove('hidden');
    
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function cancelOrderEdit() {
    editingOrderItemIndex = null;
    document.getElementById('productSelect').value = '';
    document.getElementById('dishCustomizationBox').style.display = 'none';
    document.getElementById('customizationBoxTitle').innerText = 'Personalización del Plato:';
    document.getElementById('btnAddOrUpdateOrder').innerText = 'Agregar Plato al Pedido';
    document.getElementById('btnCancelOrderEdit').classList.add('hidden');
}

function renderOrderItems() {
    const table = tables.find(t => t.id === currentTableId);
    const list = document.getElementById('orderItemsList');
    list.innerHTML = '';
    
    let total = 0;
    if (table.items.length === 0) {
        list.innerHTML = '<p style="color: var(--text-secondary); text-align: center; padding: 1rem;">No hay productos en esta mesa.</p>';
    } else {
        table.items.forEach((item, index) => {
            total += item.finalPrice;
            const row = document.createElement('div');
            row.className = 'order-item';
            
            let modsHtml = '';
            if (item.modifications && item.modifications.length > 0) {
                item.modifications.forEach(m => {
                    modsHtml += `<span class="mod-tag">↳ ${m}</span>`;
                });
            }

            row.innerHTML = `
                <div>
                    <strong>${item.name}</strong>
                    ${modsHtml}
                </div>
                <div style="text-align: right; display: flex; align-items: center; gap: 0.2rem;">
                    <strong>$${item.finalPrice.toLocaleString()}</strong>
                    <button onclick="editOrderItem(${index})" class="action-btn" title="Editar Plato">✏️</button>
                    <button onclick="removeOrderItem(${index})" class="action-btn" title="Eliminar Plato">❌</button>
                </div>
            `;
            list.appendChild(row);
        });
    }
    document.getElementById('orderTotal').innerText = `$ ${total.toLocaleString()}`;
}

function removeOrderItem(index) {
    const table = tables.find(t => t.id === currentTableId);
    if (editingOrderItemIndex === index) cancelOrderEdit();
    table.items.splice(index, 1);
    if (table.items.length === 0) table.status = 'libre';
    saveData();
    renderOrderItems();
}

function clearTableOrder() {
    const table = tables.find(t => t.id === currentTableId);
    if (confirm(`¿Desea cerrar la cuenta y liberar la ${table.name}?`)) {
        table.items = [];
        table.status = 'libre';
        cancelOrderEdit();
        saveData();
        showSection('tables-section');
    }
}

/* --- GESTIÓN DE CATÁLOGO Y RECETAS --- */

function renderRecipeCheckboxes() {
    const container = document.getElementById('recipeComponentsSelector');
    container.innerHTML = '';
    addons.forEach(ad => {
        const div = document.createElement('div');
        div.innerHTML = `
            <label class="checkbox-label">
                <input type="checkbox" class="recipe-comp-chk" value="${ad.id}">
                <span>${ad.name} ${ad.price > 0 ? '($' + ad.price + ')' : '(Base)'}</span>
            </label>
        `;
        container.appendChild(div);
    });
}

function renderProducts() {
    const list = document.getElementById('productList');
    list.innerHTML = '';
    products.forEach(p => {
        let compNames = (p.components || []).map(cid => {
            let a = addons.find(x => x.id === cid);
            return a ? a.name : '';
        }).filter(Boolean).join(', ');

        const item = document.createElement('div');
        item.className = 'product-row';
        item.innerHTML = `
            <div class="product-info">
                <span><strong>${p.name}</strong></span>
                <span style="font-size:0.75rem; color:var(--text-secondary); display:block;">Incluye: ${compNames || 'Sin componentes base'}</span>
            </div>
            <div class="product-actions">
                <strong>$${p.price.toLocaleString()}</strong>
                <button onclick="editProduct(${p.id})" class="action-btn" title="Editar">✏️</button>
                <button onclick="deleteProduct(${p.id})" class="action-btn" title="Eliminar">🗑️</button>
            </div>
        `;
        list.appendChild(item);
    });
}

function saveProduct() {
    const name = document.getElementById('newProdName').value.trim();
    const price = parseFloat(document.getElementById('newProdPrice').value);

    if (!name || isNaN(price)) { alert('Complete nombre y precio del plato.'); return; }

    let selectedComponents = [];
    document.querySelectorAll('.recipe-comp-chk:checked').forEach(chk => {
        selectedComponents.push(parseInt(chk.value));
    });

    if (editingProductId !== null) {
        const product = products.find(p => p.id === editingProductId);
        if (product) {
            product.name = name;
            product.price = price;
            product.components = selectedComponents;
        }
    } else {
        const newId = products.length > 0 ? Math.max(...products.map(p => p.id)) + 1 : 1;
        products.push({ id: newId, name, price, components: selectedComponents });
    }

    saveData();
    cancelEditProduct();
    renderProducts();
}

function editProduct(id) {
    const product = products.find(p => p.id === id);
    if (product) {
        editingProductId = id;
        document.getElementById('newProdName').value = product.name;
        document.getElementById('newProdPrice').value = product.price;
        
        renderRecipeCheckboxes();
        document.querySelectorAll('.recipe-comp-chk').forEach(chk => {
            if (product.components && product.components.includes(parseInt(chk.value))) {
                chk.checked = true;
            }
        });

        document.getElementById('formProductTitle').innerText = 'Editar Plato Principal';
        document.getElementById('btnSaveProduct').innerText = 'Guardar Cambios';
        document.getElementById('btnCancelEdit').classList.remove('hidden');
    }
}

function cancelEditProduct() {
    editingProductId = null;
    document.getElementById('newProdName').value = '';
    document.getElementById('newProdPrice').value = '';
    renderRecipeCheckboxes();
    document.getElementById('formProductTitle').innerText = 'Nombre del Plato Principal';
    document.getElementById('btnSaveProduct').innerText = 'Guardar Plato';
    document.getElementById('btnCancelEdit').classList.add('hidden');
}

function deleteProduct(id) {
    if (confirm('¿Desea eliminar este plato?')) {
        products = products.filter(p => p.id !== id);
        if (editingProductId === id) cancelEditProduct();
        saveData();
        renderProducts();
    }
}

/* --- GESTIÓN DE ADICIONALES --- */

function renderAddons() {
    const list = document.getElementById('addonsList');
    list.innerHTML = '';
    addons.forEach(ad => {
        const item = document.createElement('div');
        item.className = 'product-row';
        item.innerHTML = `
            <div class="product-info">
                <span>${ad.name} ${ad.price === 0 ? '<span style="color:var(--success); font-size:0.75rem; display:block;">(Base / Sustitución gratuita)</span>' : ''}</span>
            </div>
            <div class="product-actions">
                <strong>$${ad.price.toLocaleString()}</strong>
                <button onclick="editAddon(${ad.id})" class="action-btn" title="Editar">✏️</button>
                <button onclick="deleteAddon(${ad.id})" class="action-btn" title="Eliminar">🗑️</button>
            </div>
        `;
        list.appendChild(item);
    });
}

function saveAddon() {
    const name = document.getElementById('addonName').value.trim();
    const price = parseFloat(document.getElementById('addonPrice').value);

    if (!name || isNaN(price)) { alert('Complete nombre y precio del adicional.'); return; }

    if (editingAddonId !== null) {
        const addon = addons.find(a => a.id === editingAddonId);
        if (addon) { addon.name = name; addon.price = price; }
    } else {
        const newId = addons.length > 0 ? Math.max(...addons.map(a => a.id)) + 1 : 1;
        addons.push({ id: newId, name, price });
    }

    saveData();
    cancelEditAddon();
    renderAddons();
}

function editAddon(id) {
    const addon = addons.find(a => a.id === id);
    if (addon) {
        editingAddonId = id;
        document.getElementById('addonName').value = addon.name;
        document.getElementById('addonPrice').value = addon.price;
        document.getElementById('formAddonTitle').innerText = 'Editar Adicional';
        document.getElementById('btnSaveAddon').innerText = 'Guardar Cambios';
        document.getElementById('btnCancelAddonEdit').classList.remove('hidden');
    }
}

function cancelEditAddon() {
    editingAddonId = null;
    document.getElementById('addonName').value = '';
    document.getElementById('addonPrice').value = '';
    document.getElementById('formAddonTitle').innerText = 'Nombre del Adicional / Componente';
    document.getElementById('btnSaveAddon').innerText = 'Guardar Adicional';
    document.getElementById('btnCancelAddonEdit').classList.add('hidden');
}

function deleteAddon(id) {
    if (confirm('¿Desea eliminar este adicional?')) {
        addons = addons.filter(a => a.id !== id);
        if (editingAddonId === id) cancelEditAddon();
        saveData();
        renderAddons();
    }
}

/* --- INVENTARIO --- */
function renderInventory() {
    const list = document.getElementById('inventoryList');
    list.innerHTML = '<h3>Insumos Registrados</h3>';
    inventory.forEach(i => {
        list.innerHTML += `<div class="order-item"><span>${i.name}</span><strong>${i.stock} ${i.unit}</strong></div>`;
    });
}
function saveInventoryItem() {
    const name = document.getElementById('invName').value;
    const stock = parseFloat(document.getElementById('invStock').value);
    const unit = document.getElementById('invUnit').value;
    if(name && !isNaN(stock) && unit) {
        inventory.push({ id: inventory.length + 1, name, stock, unit });
        saveData();
        renderInventory();
        document.getElementById('invName').value = '';
        document.getElementById('invStock').value = '';
        document.getElementById('invUnit').value = '';
    }
}
