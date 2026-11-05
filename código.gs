/* ========================================================== */
/* BACKEND RESTOPOS - GOOGLE APPS SCRIPT (VERSIÓN INTEGRADA)  */
/* ========================================================== */

var SS = SpreadsheetApp.getActiveSpreadsheet();

function doGet(e) {
  var action = e.parameter.action;

  if (action === 'getData') {
    return ContentService.createTextOutput(JSON.stringify(getAllData()))
      .setMimeType(ContentService.MimeType.JSON);
  } 
  else if (action === 'getDashboardData') {
    return ContentService.createTextOutput(JSON.stringify(getDashboardDataOnly()))
      .setMimeType(ContentService.MimeType.JSON);
  }

  return ContentService.createTextOutput(JSON.stringify({
    status: "error",
    message: "Acción no válida"
  }))
    .setMimeType(ContentService.MimeType.JSON);
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
    products: getSheetData("Productos"),
    drinks: getSheetData("Bebidas"),
    addons: getSheetData("Adicionales"),
    inventory: getSheetData("Inventario"),
    salesHistory: getSheetData("Facturas"),
    users: getSheetData("Usuarios"),
    config: getConfigData()
  };
}

// Función optimizada: Solo consulta el historial de facturas bajo demanda para el Dashboard
function getDashboardDataOnly() {
  return {
    status: "success",
    salesHistory: getSheetData("Facturas")
  };
}

function getConfigData() {
  var sheet = SS.getSheetByName("Config");
  if (!sheet) return { waiterAlarmInterval: 20, waiterCanGenerateReceipt: true };
  var rows = sheet.getDataRange().getValues();
  if (rows.length < 2) return { waiterAlarmInterval: 20, waiterCanGenerateReceipt: true };
  return {
    waiterAlarmInterval: Number(rows[1][0]) || 20,
    waiterCanGenerateReceipt: rows[1][1] !== false && rows[1][1] !== "false"
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

      try {
        val = JSON.parse(val);
      } catch (e) {}

      obj[headers[j]] = val;
    }

    result.push(obj);
  }

  return result;
}

function saveAllData(data) {
  if (data.tables) saveSheetData("Mesas", data.tables);
  if (data.products) saveSheetData("Productos", data.products);
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
    if (!sheetConfig) {
      sheetConfig = SS.insertSheet("Config");
      sheetConfig.appendRow(["waiterAlarmInterval", "waiterCanGenerateReceipt"]);
    } else {
      sheetConfig.clearContents();
      sheetConfig.appendRow(["waiterAlarmInterval", "waiterCanGenerateReceipt"]);
    }
    sheetConfig.appendRow([data.config.waiterAlarmInterval || 20, data.config.waiterCanGenerateReceipt !== false]);
  }
}

function saveSheetData(sheetName, dataArray) {
  var sheet = SS.getSheetByName(sheetName);

  if (!sheet) return;

  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();

  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, lastCol).clearContent();
  }

  if (dataArray.length === 0) return;

  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function(h) { return h.toString().trim().toLowerCase(); });
  var rowsToInsert = [];

  dataArray.forEach(function(item) {
    var row = [];

    headers.forEach(function(header) {
      var val = item[header] !== undefined ? item[header] : "";

      if (typeof val === 'object') {
        val = JSON.stringify(val);
      }

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
        if (val instanceof Date) {
          val = Utilities.formatDate(val, tz, "dd/MM/yyyy");
        } else {
          val = String(val);
        }
      } else if (header === 'hora') {
        if (val instanceof Date) {
          val = Utilities.formatDate(val, tz, "hh:mm:ss a");
        } else {
          val = String(val);
        }
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
    if (valIndex !== -1) {
      sheet.getRange(nextRow, valIndex + 1, rowsToInsert.length, 1).setNumberFormat("$#,##0");
    }

    var fechaIndex = headers.indexOf('fecha');
    if (fechaIndex !== -1) {
      sheet.getRange(nextRow, fechaIndex + 1, rowsToInsert.length, 1).setNumberFormat("@");
    }

    var horaIndex = headers.indexOf('hora');
    if (horaIndex !== -1) {
      sheet.getRange(nextRow, horaIndex + 1, rowsToInsert.length, 1).setNumberFormat("@");
    }
  }
}


V10