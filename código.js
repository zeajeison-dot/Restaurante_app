/* ========================================================== */
/* BACKEND RESTOPOS - GOOGLE APPS SCRIPT (OPTIMIZADO CON CACHÉ) */
/* ========================================================== */

var SS = SpreadsheetApp.getActiveSpreadsheet();
var CACHE_EXPIRATION_SEC = 300; // 5 minutos de caché para catálogos estáticos

function doGet(e) {
  var action = e.parameter.action;

  if (action === 'getData') {
    return ContentService.createTextOutput(JSON.stringify(getAllData()))
      .setMimeType(ContentService.MimeType.JSON);
  } 
  else if (action === 'getTablesAndProducts') {
    // Endpoint ultrarrápido optimizado con CacheService para Mesas y Pedidos
    return ContentService.createTextOutput(JSON.stringify(getTablesAndProductsData()))
      .setMimeType(ContentService.MimeType.JSON);
  }
  else if (action === 'getDashboardDataFiltered') {
    // Filtrado de facturas por rango de fechas para el Dashboard
    var startDate = e.parameter.startDate || "";
    var endDate = e.parameter.endDate || "";
    return ContentService.createTextOutput(JSON.stringify(getDashboardDataByDateRange(startDate, endDate)))
      .setMimeType(ContentService.MimeType.JSON);
  }
  else if (action === 'getLastUpdated') {
    var config = getConfigData();
    return ContentService.createTextOutput(JSON.stringify({
      status: "success",
      lastUpdated: config.lastUpdated || 0
    })).setMimeType(ContentService.MimeType.JSON);
  }
   else if (action === 'getUsersAndConfig') {
    // Endpoint ultraligero exclusivo para el Login (no consulta productos, mesas ni facturas)
    return ContentService.createTextOutput(JSON.stringify({
      status: "success",
      users: getSheetData("Usuarios"),
      config: getConfigData()
    })).setMimeType(ContentService.MimeType.JSON);
  }


  return ContentService.createTextOutput(JSON.stringify({
    status: "error",
    message: "Acción no válida"
  })).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    saveAllData(data);

    return ContentService.createTextOutput(JSON.stringify({
      status: "success"
    }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: error.toString()
    }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function getAllData() {
  return {
    tables: getSheetData("Mesas"),
    products: getCachedSheetData("Productos"),
    drinks: getCachedSheetData("Bebidas"),
    addons: getCachedSheetData("Adicionales"),
    inventory: getSheetData("Inventario"),
    users: getSheetData("Usuarios"),
    config: getConfigData()
  };
}

/**
 * Endpoint específico para Mesas y Pedidos usando CacheService para máxima velocidad.
 */
function getTablesAndProductsData() {
  return {
    status: "success",
    tables: getSheetData("Mesas"), // Las mesas cambian de estado constantemente, se leen directo
    products: getCachedSheetData("Productos"),
    drinks: getCachedSheetData("Bebidas"),
    addons: getCachedSheetData("Adicionales"),
    config: getConfigData()
  };
}

/**
 * Obtiene datos de una hoja usando caché temporal para evitar lecturas pesadas y repetitivas en Sheets.
 */
function getCachedSheetData(sheetName) {
  var cache = CacheService.getScriptCache();
  var cached = cache.get("sheet_" + sheetName);
  
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch (e) {}
  }

  var data = getSheetData(sheetName);
  try {
    cache.put("sheet_" + sheetName, JSON.stringify(data), CACHE_EXPIRATION_SEC);
  } catch (e) {}

  return data;
}

/**
 * Consulta el historial de facturas filtrado por rango de fechas (dd/MM/yyyy).
 */
function getDashboardDataByDateRange(startDate, endDate) {
  var allSales = getSheetData("Facturas");
  
  if (!startDate || !endDate) {
    return { status: "success", salesHistory: allSales };
  }

  // Formato esperado de fecha: yyyy-mm-dd desde el input date HTML, se compara con dd/MM/yyyy de Sheets
  var filtered = allSales.filter(function(sale) {
    var saleDateStr = sale.fecha; // Ej: "07/11/2026"
    if (!saleDateStr) return false;
    
    var parts = saleDateStr.split("/");
    if (parts.length !== 3) return true;
    
    var saleIso = parts[2] + "-" + parts[1] + "-" + parts[0]; // yyyy-mm-dd
    return saleIso >= startDate && saleIso <= endDate;
  });

  return {
    status: "success",
    salesHistory: filtered
  };
}

function getConfigData() {
  var sheet = SS.getSheetByName("Config");
  if (!sheet) return { waiterAlarmInterval: 20, waiterCanGenerateReceipt: true, lastUpdated: Date.now() };
  var rows = sheet.getDataRange().getValues();
  if (rows.length < 2) return { waiterAlarmInterval: 20, waiterCanGenerateReceipt: true, lastUpdated: Date.now() };
  
  return {
    waiterAlarmInterval: Number(rows[1][0]) || 20,
    waiterCanGenerateReceipt: rows[1][1] !== false && rows[1][1] !== "false",
    lastUpdated: rows[1][2] || Date.now()
  };
}

function getSheetData(sheetName) {
  var sheet = SS.getSheetByName(sheetName);
  if (!sheet) return [];
  var rows = sheet.getDataRange().getValues();
  if (rows.length <= 1) return [];

  var headers = rows[0].map(function(h) { return h.toString().trim().toLowerCase(); });
  var result = [];
  var tz = Session.getScriptTimeZone();

  for (var i = 1; i < rows.length; i++) {
    var obj = {};
    for (var j = 0; j < headers.length; j++) {
      var val = rows[i][j];
      if (sheetName === "Facturas") {
        if (headers[j] === 'fecha' && val instanceof Date) {
          val = Utilities.formatDate(val, tz, "dd/MM/yyyy");
        } else if (headers[j] === 'hora' && val instanceof Date) {
          val = Utilities.formatDate(val, tz, "hh:mm:ss a");
        }
      }
      try { val = JSON.parse(val); } catch (e) {}
      obj[headers[j]] = val;
    }
    result.push(obj);
  }
  return result;
}

function saveAllData(data) {
  // Limpiar caché de catálogos al guardar cambios
  var cache = CacheService.getScriptCache();
  cache.remove("sheet_Productos");
  cache.remove("sheet_Bebidas");
  cache.remove("sheet_Adicionales");

  if (data.tables) saveSheetData("Mesas", data.tables);
  
  if (data.products) {
    var sheetProducts = SS.getSheetByName("Productos");
    if (!sheetProducts) {
      sheetProducts = SS.insertSheet("Productos");
      sheetProducts.appendRow(["id", "name", "price", "components", "category", "active"]);
    } else {
      var headers = sheetProducts.getRange(1, 1, 1, sheetProducts.getLastColumn() || 1).getValues()[0].map(function(h) { return h.toString().trim().toLowerCase(); });
      if (headers.indexOf("category") === -1) sheetProducts.getRange(1, sheetProducts.getLastColumn() + 1).setValue("category");
      var updatedHeaders = sheetProducts.getRange(1, 1, 1, sheetProducts.getLastColumn()).getValues()[0].map(function(h) { return h.toString().trim().toLowerCase(); });
      if (updatedHeaders.indexOf("active") === -1) sheetProducts.getRange(1, sheetProducts.getLastColumn() + 1).setValue("active");
    }
    saveSheetData("Productos", data.products);
  }

  if (data.drinks) saveSheetData("Bebidas", data.drinks);
  if (data.addons) saveSheetData("Adicionales", data.addons);
  if (data.inventory) saveSheetData("Inventario", data.inventory);
  
  if (data.salesHistory) {
    var sheetFacturas = SS.getSheetByName("Facturas");
    if (!sheetFacturas) {
      sheetFacturas = SS.insertSheet("Facturas");
      sheetFacturas.appendRow(["facnumero", "mesa", "plato", "detallesmodificaciones", "valorpagado", "fecha", "hora", "usuario"]);
    }
    appendNewSales("Facturas", data.salesHistory);
  }
  
  if (data.users) {
    var sheetUsers = SS.getSheetByName("Usuarios");
    if (!sheetUsers) {
      sheetUsers = SS.insertSheet("Usuarios");
      sheetUsers.appendRow(["id", "username", "pass", "role"]);
    }
    saveSheetData("Usuarios", data.users);
  }

  if (data.config) {
    var sheetConfig = SS.getSheetByName("Config");
    var currentTime = Date.now();
    if (!sheetConfig) {
      sheetConfig = SS.insertSheet("Config");
      sheetConfig.appendRow(["waiterAlarmInterval", "waiterCanGenerateReceipt", "lastUpdated"]);
    } else {
      sheetConfig.clearContents();
      sheetConfig.appendRow(["waiterAlarmInterval", "waiterCanGenerateReceipt", "lastUpdated"]);
    }
    sheetConfig.appendRow([
      data.config.waiterAlarmInterval || 20, 
      data.config.waiterCanGenerateReceipt !== false,
      data.config.lastUpdated || currentTime
    ]);
  }
}

function saveSheetData(sheetName, dataArray) {
  var sheet = SS.getSheetByName(sheetName);
  if (!sheet) return;
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow > 1) sheet.getRange(2, 1, lastRow - 1, lastCol).clearContent();
  if (dataArray.length === 0) return;

  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function(h) { return h.toString().trim().toLowerCase(); });
  var rowsToInsert = [];

  dataArray.forEach(function(item) {
    var row = [];
    headers.forEach(function(header) {
      var val = item[header] !== undefined ? item[header] : "";
      if (typeof val === 'object') val = JSON.stringify(val);
      row.push(val);
    });
    rowsToInsert.push(row);
  });

  if (rowsToInsert.length > 0) {
    sheet.getRange(2, 1, rowsToInsert.length, headers.length).setValues(rowsToInsert);
  }
}

function appendNewSales(sheetName, dataArray) {
  var sheet = SS.getSheetByName(sheetName);
  if (!sheet || dataArray.length === 0) return;

  var lastCol = sheet.getLastColumn();
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function(h) { return h.toString().trim().toLowerCase(); });
  var rowsToInsert = [];
  var tz = Session.getScriptTimeZone();

  dataArray.forEach(function(item) {
    var row = [];
    headers.forEach(function(header) {
      var val = item[header] !== undefined ? item[header] : "";
      if (header === 'valorpagado' && val !== "") {
        val = Number(val);
      } else if (header === 'fecha') {
        val = (val instanceof Date) ? Utilities.formatDate(val, tz, "dd/MM/yyyy") : String(val);
      } else if (header === 'hora') {
        val = (val instanceof Date) ? Utilities.formatDate(val, tz, "hh:mm:ss a") : String(val);
      } else if (typeof val === 'object') {
        val = JSON.stringify(val);
      }
      row.push(val);
    });
    rowsToInsert.push(row);
  });

  if (rowsToInsert.length > 0) {
    var nextRow = sheet.getLastRow() + 1;
    var range = sheet.getRange(nextRow, 1, rowsToInsert.length, headers.length);
    range.setValues(rowsToInsert);

    var valIndex = headers.indexOf('valorpagado');
    if (valIndex !== -1) sheet.getRange(nextRow, valIndex + 1, rowsToInsert.length, 1).setNumberFormat("$#,##0");
    var fechaIndex = headers.indexOf('fecha');
    if (fechaIndex !== -1) sheet.getRange(nextRow, fechaIndex + 1, rowsToInsert.length, 1).setNumberFormat("@");
    var horaIndex = headers.indexOf('hora');
    if (horaIndex !== -1) sheet.getRange(nextRow, horaIndex + 1, rowsToInsert.length, 1).setNumberFormat("@");
  }
}

/*V14*/