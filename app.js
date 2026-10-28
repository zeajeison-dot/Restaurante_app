window.onload = function() {
    if (localStorage.getItem('restopos_logged') === 'true') {
        document.getElementById('login-view').classList.add('hidden');
        document.getElementById('dashboard-view').classList.remove('hidden');
        document.getElementById('welcome-msg').innerText = 'Administrador General';
    }
};

let tables = JSON.parse(localStorage.getItem('restopos_tables')) || [
    { id: 1, name: 'Mesa 1', status: 'libre', items: [], receipts: [] },
    { id: 2, name: 'Mesa 2', status: 'libre', items: [], receipts: [] },
    { id: 3, name: 'Mesa 3', status: 'libre', items: [], receipts: [] },
    { id: 4, name: 'Mesa 4', status: 'libre', items: [], receipts: [] },
    { id: 5, name: 'Mesa 5', status: 'libre', items: [], receipts: [] },
    { id: 6, name: 'Mesa 6', status: 'libre', items: [], receipts: [] }
];

let addons = JSON.parse(localStorage.getItem('restopos_addons')) || [
    { id: 1, name: 'Papas a la francesa', price: 0 },
    { id: 2, name: 'Ensalada', price: 0 },
    { id: 3, name: 'Plátano maduro', price: 0 },
    { id: 4, name: 'Queso extra', price: 3000 },
    { id: 5, name: 'Tocineta', price: 3000 }
];

let products = JSON.parse(localStorage.getItem('restopos_products')) || [
    { id: 1, name: 'Costillas BBQ', price: 22000, components: [1, 2] }
];

let drinks = JSON.parse(localStorage.getItem('restopos_drinks')) || [
    { id: 1, name: 'Gaseosa 400ml', price: 4000 },
    { id: 2, name: 'Agua en botella', price: 3000 },
    { id: 3, name: 'Limonada natural', price: 5000 }
];

let inventory = JSON.parse(localStorage.getItem('restopos_inventory')) || [];
let currentTableId = null;
let editingProductId = null;
let editingDrinkId = null;
let editingAddonId = null;
let editingOrderItemIndex = null;

function saveData() {
    localStorage.setItem('restopos_tables', JSON.stringify(tables));
    localStorage.setItem('restopos_addons', JSON.stringify(addons));
    localStorage.setItem('restopos_products', JSON.stringify(products));
    localStorage.setItem('restopos_drinks', JSON.stringify(drinks));
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
    const sections = ['dashboard-view', 'tables-section', 'order-section', 'bill-section', 'catalog-section', 'drinks-section', 'addons-section', 'inventory-section'];
    sections.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });
    
    const target = document.getElementById(sectionId);
    if (target) target.classList.remove('hidden');

    if(sectionId === 'tables-section') renderTables();
    if(sectionId === 'catalog-section') { cancelEditProduct(); renderRecipeCheckboxes(); renderProducts(); }
    if(sectionId === 'drinks-section') { cancelEditDrink(); renderDrinks(); }
    if(sectionId === 'addons-section') { cancelEditAddon(); renderAddons(); }
    if(sectionId === 'inventory-section') renderInventory();
}

function renderTables() {
    const container = document.getElementById('tableGridContainer');
    if (!container) return;
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
    if (!table.receipts) table.receipts = [];
    
    table.items.forEach(item => {
        if (!item.uid) item.uid = '_' + Math.random().toString(36).substr(2, 9);
    });

    document.getElementById('order-title').innerText = `Pedido - ${table.name}`;
    
    const select = document.getElementById('productSelect');
    select.innerHTML = '<option value="">-- Seleccione un plato o bebida --</option>';
    products.forEach(p => {
        const opt = document.createElement('option');
        opt.value = 'prod_' + p.id;
        opt.innerText = `${p.name} - $${p.price.toLocaleString()}`;
        select.appendChild(opt);
    });

    drinks.forEach(d => {
        const opt = document.createElement('option');
        opt.value = 'drink_' + d.id;
        opt.innerText = `🥤 [Bebida] ${d.name} - $${d.price.toLocaleString()}`;
        select.appendChild(opt);
    });

    cancelOrderEdit();
    renderOrderItems();
    document.getElementById('tables-section').classList.add('hidden');
    document.getElementById('order-section').classList.remove('hidden');
}

function loadProductRecipeOptions(selectedComponentChoices = [], selectedAddonsData = []) {
    const val = document.getElementById('productSelect').value;
    const box = document.getElementById('dishCustomizationBox');
    const compList = document.getElementById('recipeComponentsList');
    const addonsBox = document.getElementById('addonsSelectionList');

    if (!val) { box.style.display = 'none'; return; }

    if (val.startsWith('drink_')) {
        box.style.display = 'none';
        return;
    }

    box.style.display = 'block';
    const prodId = parseInt(val.replace('prod_', ''));
    const product = products.find(p => p.id === prodId);

    compList.innerHTML = '<strong style="font-size:0.85rem; color:var(--text-secondary);">Componentes Base:</strong>';
    
    if (product && product.components && product.components.length > 0) {
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

    addonsBox.innerHTML = '<strong style="font-size:0.85rem; color:var(--text-secondary); display:block; margin-top:0.75rem;">Adicionales con costo extra:</strong>';
    
    let extraAddonsExist = false;
    addons.forEach(ad => {
        if (ad.price > 0) {
            extraAddonsExist = true;
            let matched = selectedAddonsData.find(item => item.id === ad.id);
            let isChecked = matched ? 'checked' : '';
            let qty = matched ? matched.qty : 1;
            let displayStyle = matched ? 'display: inline-block;' : 'display: none;';

            const div = document.createElement('div');
            div.style.cssText = "display: flex; align-items: center; justify-content: space-between; margin-top: 0.4rem;";
            div.innerHTML = `
                <label class="checkbox-label" style="flex: 1;">
                    <input type="checkbox" class="addon-checkbox" value="${ad.id}" data-price="${ad.price}" data-name="${ad.name}" ${isChecked} onchange="toggleAddonQuantity(this)">
                    <span>${ad.name} (+$${ad.price.toLocaleString()})</span>
                </label>
                <select class="addon-qty-select" data-id="${ad.id}" style="width: 70px; padding: 0.2rem; font-size: 0.85rem; ${displayStyle}">
                    <option value="1" ${qty==1?'selected':''}>1</option>
                    <option value="2" ${qty==2?'selected':''}>2</option>
                    <option value="3" ${qty==3?'selected':''}>3</option>
                    <option value="4" ${qty==4?'selected':''}>4</option>
                    <option value="5" ${qty==5?'selected':''}>5</option>
                </select>
            `;
            addonsBox.appendChild(div);
        }
    });
    if (!extraAddonsExist) {
        addonsBox.innerHTML += '<p style="font-size:0.85rem; color:var(--text-secondary);">No hay adicionales con costo registrados.</p>';
    }
}

function toggleAddonQuantity(checkbox) {
    const parentRow = checkbox.closest('div');
    const selectQty = parentRow.querySelector('.addon-qty-select');
    if (checkbox.checked) {
        selectQty.style.display = 'inline-block';
    } else {
        selectQty.style.display = 'none';
        selectQty.value = '1';
    }
}

function saveOrderCustomization() {
    const val = document.getElementById('productSelect').value;
    const table = tables.find(t => t.id === currentTableId);

    if (!val || !table) { alert('Seleccione un producto o bebida válido.'); return; }

    let finalPrice = 0;
    let name = '';
    let modifications = [];
    let componentChoices = [];
    let addonsData = [];
    let productId = 0;

    if (val.startsWith('drink_')) {
        let drinkId = parseInt(val.replace('drink_', ''));
        let drink = drinks.find(d => d.id === drinkId);
        finalPrice = drink.price;
        name = drink.name;
        productId = drink.id;
    } else {
        let prodId = parseInt(val.replace('prod_', ''));
        let product = products.find(p => p.id === prodId);
        finalPrice = product.price; // Precio base exacto del plato
        name = product.name;
        productId = product.id;

        document.querySelectorAll('.component-choice').forEach(select => {
            const choice = select.value;
            componentChoices.push(choice);
            if (choice.startsWith('SIN ') || choice.startsWith('Cambiado por ')) {
                modifications.push(choice);
            }
        });

        document.querySelectorAll('.addon-checkbox:checked').forEach(chk => {
            const id = parseInt(chk.value);
            const dataName = chk.getAttribute('data-name');
            const unitPrice = parseFloat(chk.getAttribute('data-price')) || 0;
            
            const qtySelect = chk.closest('div').querySelector('.addon-qty-select');
            const qty = parseInt(qtySelect.value) || 1;

            let totalAddonPrice = unitPrice * qty;
            finalPrice += totalAddonPrice; // Suma exacta de adicionales

            addonsData.push({ id, qty });
            
            if (qty > 1) {
                modifications.push(`Adicional: ${dataName} x${qty} (+$${totalAddonPrice.toLocaleString()})`);
            } else {
                modifications.push(`Adicional: ${dataName} (+$${totalAddonPrice.toLocaleString()})`);
            }
        });
    }

    const orderItemData = {
        uid: '_' + Math.random().toString(36).substr(2, 9),
        productId: productId,
        name: name,
        finalPrice: finalPrice,
        modifications: modifications,
        componentChoices: componentChoices,
        addonsData: addonsData,
        billed: false
    };

    if (editingOrderItemIndex !== null) {
        orderItemData.uid = table.items[editingOrderItemIndex].uid || orderItemData.uid;
        orderItemData.billed = table.items[editingOrderItemIndex].billed || false;
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

    if (item.billed) {
        alert('Este plato ya fue facturado. Anule el recibo asociado para poder editarlo.');
        return;
    }

    editingOrderItemIndex = index;
    let selectVal = products.some(p => p.id === item.productId) ? 'prod_' + item.productId : 'drink_' + item.productId;
    document.getElementById('productSelect').value = selectVal;
    
    loadProductRecipeOptions(item.componentChoices || [], item.addonsData || []);

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
    if (!list) return;
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

            let billedBadge = item.billed ? `<span style="font-size:0.7rem; background:#fee2e2; color:#dc2626; padding:0.1rem 0.3rem; border-radius:4px; margin-left:5px;">FACTURADO</span>` : '';

            row.innerHTML = `
                <div>
                    <strong>${item.name}</strong> ${billedBadge}
                    ${modsHtml}
                </div>
                <div style="text-align: right; display: flex; align-items: center; gap: 0.2rem;">
                    <strong>$${item.finalPrice.toLocaleString()}</strong>
                    <button onclick="editOrderItem(${index})" class="action-btn" title="Editar Plato" ${item.billed ? 'style="opacity:0.4;"' : ''}>✏️</button>
                    <button onclick="removeOrderItem(${index})" class="action-btn" title="Eliminar Plato" ${item.billed ? 'style="opacity:0.4;"' : ''}>❌</button>
                </div>
            `;
            list.appendChild(row);
        });
    }
    const orderTotalEl = document.getElementById('orderTotal');
    if (orderTotalEl) orderTotalEl.innerText = `$ ${total.toLocaleString()}`;
}

function removeOrderItem(index) {
    const table = tables.find(t => t.id === currentTableId);
    const item = table.items[index];
    if (item && item.billed) {
        alert('Este plato ya fue facturado. Anule el recibo asociado para poder eliminarlo.');
        return;
    }
    if (editingOrderItemIndex === index) cancelOrderEdit();
    table.items.splice(index, 1);
    if (table.items.length === 0) table.status = 'libre';
    saveData();
    renderOrderItems();
}

function clearTableOrder() {
    const table = tables.find(t => t.id === currentTableId);
    if (table.items.length === 0) {
        table.status = 'libre';
        saveData();
        showSection('tables-section');
        return;
    }
    openBillSection();
}

/* --- MÓDULO DE CUENTAS Y RECIBOS (SIN DIVISIÓN DE PLATOS) --- */

function openBillSection() {
    const table = tables.find(t => t.id === currentTableId);
    if (!table || table.items.length === 0) {
        alert('Esta mesa no tiene pedidos activos.');
        return;
    }
    if (!table.receipts) table.receipts = [];

    let activeBilledUids = [];
    table.receipts.forEach(r => {
        if (r.itemUids) activeBilledUids.push(...r.itemUids);
    });
    table.items.forEach(item => {
        if (item.billed && !activeBilledUids.includes(item.uid)) {
            item.billed = false;
        }
    });
    saveData();

    document.getElementById('bill-title').innerText = `Cuenta - ${table.name}`;
    
    const list = document.getElementById('billItemsList');
    if (!list) return;
    list.innerHTML = '';

    table.items.forEach((item, index) => {
        let modsHtml = '';
        if (item.modifications && item.modifications.length > 0) {
            item.modifications.forEach(m => {
                modsHtml += `<span class="mod-tag">↳ ${m}</span>`;
            });
        }

        const div = document.createElement('div');
        div.className = 'order-item';
        
        if (item.billed) {
            div.innerHTML = `
                <div style="flex: 1; opacity: 0.5;">
                    <span style="font-size:0.7rem; background:#fee2e2; color:#dc2626; padding:0.1rem 0.3rem; border-radius:4px; font-weight:bold;">[ ASIGNADO A RECIBO ]</span>
                    <strong>${item.name}</strong>
                    ${modsHtml}
                </div>
                <strong style="text-decoration: line-through;">$${item.finalPrice.toLocaleString()}</strong>
            `;
        } else {
            div.innerHTML = `
                <label class="checkbox-label" style="flex: 1; align-items: flex-start;">
                    <input type="checkbox" class="bill-item-chk" value="${index}" data-price="${item.finalPrice}" onchange="calculatePartialTotal()" style="margin-top: 3px;">
                    <div>
                        <strong>${item.name}</strong>
                        ${modsHtml}
                    </div>
                </label>
                <strong style="margin-left: 1rem;">$${item.finalPrice.toLocaleString()}</strong>
            `;
        }
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
        let price = parseFloat(chk.getAttribute('data-price')) || 0;
        partialTotal += price;
    });

    const selectedTotalEl = document.getElementById('selectedPartialTotal');
    if (selectedTotalEl) selectedTotalEl.innerText = `$ ${Math.round(partialTotal).toLocaleString()}`;
}

function generateReceipt() {
    const table = tables.find(t => t.id === currentTableId);
    let selectedIndexes = [];
    let partialTotal = 0;
    let receiptItems = [];
    let receiptItemUids = [];

    document.querySelectorAll('.bill-item-chk:checked').forEach(chk => {
        let idx = parseInt(chk.value);
        let item = table.items[idx];

        partialTotal += item.finalPrice;
        receiptItems.push({ ...item });
        receiptItemUids.push(item.uid);
        selectedIndexes.push(idx);

        item.billed = true; // Se marca como facturado completo
    });

    if (selectedIndexes.length === 0) {
        alert('Seleccione al menos un plato o bebida para generar el recibo.');
        return;
    }

    const newReceipt = {
        id: Date.now(),
        items: receiptItems,
        itemUids: receiptItemUids,
        total: Math.round(partialTotal),
        date: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    table.receipts.push(newReceipt);
    saveData();
    openBillSection();
}

function printReceiptDoc(receiptId) {
    const table = tables.find(t => t.id === currentTableId);
    const receipt = table.receipts.find(r => r.id === receiptId);
    if (!receipt) return;

    let selectedItemsHtml = '';
    receipt.items.forEach(item => {
        let itemModsHtml = '';
        if (item.modifications && item.modifications.length > 0) {
            item.modifications.forEach(m => {
                if (m.includes('(+$') || m.includes('($')) {
                    itemModsHtml += `<div style="font-size: 0.8rem; color: #555; margin-left: 10px;">&bull; ${m}</div>`;
                }
            });
        }

        selectedItemsHtml += `
            <div style="margin-bottom: 6px; text-align: left;">
                <strong>${item.name}</strong> — <strong>$${item.finalPrice.toLocaleString()}</strong>
                ${itemModsHtml}
            </div>
        `;
    });

    let receiptWindow = window.open('', '_blank', 'width=400,height=600');
    receiptWindow.document.write(`
        <html>
        <head><title>Recibo - ${table.name}</title></head>
        <body style="font-family: monospace; padding: 1rem; text-align: center;">
            <h3>RestoPOS - Recibo de Venta</h3>
            <p>${table.name} | Hora: ${receipt.date}</p>
            <hr>
            <div style="text-align: left;">
                ${selectedItemsHtml}
            </div>
            <hr>
            <h3 style="text-align: right;">TOTAL: $${receipt.total.toLocaleString()}</h3>
            <p>¡Gracias por su visita!</p>
        </body>
        </html>
    `);
    receiptWindow.document.close();
    receiptWindow.print();
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
        if (container) container.innerHTML = '<p style="font-size: 0.85rem; color: var(--text-secondary); text-align: center;">No hay recibos generados aún.</p>';
        return;
    }

    let html = `<h4 style="font-size: 0.95rem; margin-bottom: 0.5rem; color: var(--text);">Recibos Generados (Seleccione para pagar o anular):</h4>`;
    
    table.receipts.forEach((rc, rIdx) => {
        let itemNames = rc.items.map(i => i.name).join(', ');
        html += `
            <div style="background: #f1f5f9; padding: 0.6rem; border-radius: 8px; margin-bottom: 0.5rem; display: flex; justify-content: space-between; align-items: center; font-size: 0.85rem;">
                <div>
                    <strong>Recibo #${rIdx + 1}</strong> (${rc.date})<br>
                    <span style="color: var(--text-secondary);">${itemNames}</span><br>
                    <strong style="color: var(--primary);">Total: $${rc.total.toLocaleString()}</strong>
                </div>
                <div style="display: flex; gap: 0.3rem;">
                    <button class="btn btn-secondary" style="padding: 0.3rem 0.5rem; font-size: 0.75rem; width: auto; margin:0;" onclick="printReceiptDoc(${rc.id})">🖨️</button>
                    <button class="btn btn-success" style="padding: 0.3rem 0.5rem; font-size: 0.75rem; width: auto; margin:0; background: var(--success);" onclick="confirmPayReceipt(${rc.id})">Pagar</button>
                    <button class="btn btn-danger" style="padding: 0.3rem 0.5rem; font-size: 0.75rem; width: auto; margin:0;" onclick="cancelReceipt(${rc.id})">Anular</button>
                </div>
            </div>
        `;
    });

    if (container) container.innerHTML = html;
}

function confirmPayReceipt(receiptId) {
    const table = tables.find(t => t.id === currentTableId);
    const receiptIndex = table.receipts.findIndex(r => r.id === receiptId);
    if (receiptIndex === -1) return;

    let receipt = table.receipts[receiptIndex];

    if (confirm(`¿Confirmar pago del Recibo por valor de $${receipt.total.toLocaleString()}?`)) {
        table.receipts.splice(receiptIndex, 1);
        table.items = table.items.filter(item => !receipt.itemUids.includes(item.uid));

        if (table.items.length === 0 && table.receipts.length === 0) {
            table.status = 'libre';
            table.receipts = [];
            saveData();
            showSection('tables-section');
        } else {
            saveData();
            openBillSection();
        }
    }
}

function cancelReceipt(receiptId) {
    const table = tables.find(t => t.id === currentTableId);
    const receiptIndex = table.receipts.findIndex(r => r.id === receiptId);
    if (receiptIndex === -1) return;

    let receipt = table.receipts[receiptIndex];

    if (confirm(`¿Anular este recibo? Los ítems volverán a estar disponibles en la cuenta.`)) {
        table.receipts.splice(receiptIndex, 1);
        saveData();
        openBillSection();
    }
}

function backToOrderSection() {
    document.getElementById('bill-section').classList.add('hidden');
    document.getElementById('order-section').classList.remove('hidden');
}

/* --- GESTIÓN DE CATÁLOGO Y RECETAS --- */

function renderRecipeCheckboxes() {
    const container = document.getElementById('recipeComponentsSelector');
    if (!container) return;
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
    if (!list) return;
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
                <span style="font-size:0.75rem; color: var(--text-secondary); display:block;">Incluye: ${compNames || 'Sin componentes base'}</span>
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

/* --- GESTIÓN DE BEBIDAS --- */

function renderDrinks() {
    const list = document.getElementById('drinksList');
    if (!list) return;
    list.innerHTML = '';
    drinks.forEach(d => {
        const item = document.createElement('div');
        item.className = 'product-row';
        item.innerHTML = `
            <div class="product-info">
                <span><strong>${d.name}</strong></span>
            </div>
            <div class="product-actions">
                <strong>$${d.price.toLocaleString()}</strong>
                <button onclick="editDrink(${d.id})" class="action-btn" title="Editar">✏️</button>
                <button onclick="deleteDrink(${d.id})" class="action-btn" title="Eliminar">🗑️</button>
            </div>
        `;
        list.appendChild(item);
    });
}

function saveDrink() {
    const name = document.getElementById('drinkName').value.trim();
    const price = parseFloat(document.getElementById('drinkPrice').value);

    if (!name || isNaN(price)) { alert('Complete nombre y precio de la bebida.'); return; }

    if (editingDrinkId !== null) {
        const drink = drinks.find(d => d.id === editingDrinkId);
        if (drink) { drink.name = name; drink.price = price; }
    } else {
        const newId = drinks.length > 0 ? Math.max(...drinks.map(d => d.id)) + 1 : 1;
        drinks.push({ id: newId, name, price });
    }

    saveData();
    cancelEditDrink();
    renderDrinks();
}

function editDrink(id) {
    const drink = drinks.find(d => d.id === id);
    if (drink) {
        editingDrinkId = id;
        document.getElementById('drinkName').value = drink.name;
        document.getElementById('drinkPrice').value = drink.price;
        document.getElementById('formDrinkTitle').innerText = 'Editar Bebida';
        document.getElementById('btnSaveDrink').innerText = 'Guardar Cambios';
        document.getElementById('btnCancelDrinkEdit').classList.remove('hidden');
    }
}

function cancelEditDrink() {
    editingDrinkId = null;
    document.getElementById('drinkName').value = '';
    document.getElementById('drinkPrice').value = '';
    document.getElementById('formDrinkTitle').innerText = 'Nombre de la Bebida';
    document.getElementById('btnSaveDrink').innerText = 'Guardar Bebida';
    document.getElementById('btnCancelDrinkEdit').classList.add('hidden');
}

function deleteDrink(id) {
    if (confirm('¿Desea eliminar esta bebida?')) {
        drinks = drinks.filter(d => d.id !== id);
        if (editingDrinkId === id) cancelEditDrink();
        saveData();
        renderDrinks();
    }
}

/* --- GESTIÓN DE ADICIONALES --- */

function renderAddons() {
    const list = document.getElementById('addonsList');
    if (!list) return;
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
    if (!list) return;
    list.innerHTML = '<h3>Insumos Registrados</h3>';
    inventory.forEach(i => {
        list.innerHTML += `<div class="order-item"><span>${i.name}</span><strong>${i.stock} ${i.unit}</strong></div>`;
    });
}

function saveInventoryItem() {
    const nameVal = document.getElementById('invName').value;
    const stock = parseFloat(document.getElementById('invStock').value);
    const unit = document.getElementById('invUnit').value;
    if(nameVal && !isNaN(stock) && unit) {
        inventory.push({ id: inventory.length + 1, name: nameVal, stock, unit });
        saveData();
        renderInventory();
        document.getElementById('invName').value = '';
        document.getElementById('invStock').value = '';
        document.getElementById('invUnit').value = '';
    }
}
