var SS = SpreadsheetApp.getActiveSpreadsheet();

function doGet(e) {
  var action = e.parameter.action;

  if (action === 'getData') {
    return ContentService.createTextOutput(JSON.stringify(getAllData()))
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
    users: getSheetData("Usuarios") // <-- Incluido para sincronizar los usuarios desde Sheets al cargar la app
  };
}

function getSheetData(sheetName) {
  var sheet = SS.getSheetByName(sheetName);

  if (!sheet) return [];

  var rows = sheet.getDataRange().getValues();

  if (rows.length <= 1) return [];

  var headers = rows[0];
  var result = [];

  for (var i = 1; i < rows.length; i++) {
    var obj = {};

    for (var j = 0; j < headers.length; j++) {
      var val = rows[i][j];

      // Intentar parsear JSON si los campos guardan arrays/objetos complejos
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
  
  // <-- Incluido para guardar/actualizar los usuarios en la pestaña "Usuarios" al hacer modificaciones online
  if (data.users) {
    var sheetUsers = SS.getSheetByName("Usuarios");
    if (!sheetUsers) {
      sheetUsers = SS.insertSheet("Usuarios");
      sheetUsers.appendRow(["id", "username", "pass", "role"]); // Crear cabeceras si no existe la hoja
    }
    saveSheetData("Usuarios", data.users);
  }
}

function saveSheetData(sheetName, dataArray) {
  var sheet = SS.getSheetByName(sheetName);

  if (!sheet) return;

  // Limpiar datos existentes manteniendo encabezados
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();

  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, lastCol).clearContent();
  }

  if (dataArray.length === 0) return;

  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
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
