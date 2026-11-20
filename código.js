
/* ========================================================== */
/* RESTOPOS - GOOGLE APPS SCRIPT                              */
/* BACKEND INTEGRADO Y OPTIMIZADO                             */
/* ========================================================== */

/*
  FUNCIONES PRINCIPALES:
  - Lectura de datos
  - Guardado de datos
  - Sincronización de mesas y comandas
  - Control de versión
  - Bloqueo de escrituras simultáneas
  - Caché de catálogos
  - Historial de facturas
*/

var SS = SpreadsheetApp.getActiveSpreadsheet();

var CACHE_EXPIRATION_SEC = 300;
var LOCK_TIMEOUT_MS = 20000;


/* ========================================================== */
/* 1. RESPUESTA JSON                                          */
/* ========================================================== */

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}


/* ========================================================== */
/* 2. INICIALIZACIÓN DE CONFIGURACIÓN                         */
/* ========================================================== */

function initializeConfigSheet() {
  var sheet = SS.getSheetByName("Config");

  if (!sheet) {
    sheet = SS.insertSheet("Config");
  }

  var headers = [
    "waiterAlarmInterval",
    "waiterCanGenerateReceipt",
    "lastUpdated"
  ];

  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }

  if (sheet.getLastRow() < 2) {
    sheet.getRange(2, 1, 1, 3).setValues([
      [20, true, Date.now()]
    ]);
  }

  return sheet;
}


function getConfigData() {
  var sheet = initializeConfigSheet();

  var values = sheet.getRange(2, 1, 1, 3).getValues()[0];

  var interval = Number(values[0]);
  var canGenerate = values[1];
  var lastUpdated = Number(values[2]);

  if (!interval || interval < 1) {
    interval = 20;
  }

  if (canGenerate === "" || canGenerate === null) {
    canGenerate = true;
  } else {
    canGenerate = !(
      canGenerate === false ||
      String(canGenerate).toLowerCase() === "false"
    );
  }

  if (!lastUpdated || !isFinite(lastUpdated)) {
    lastUpdated = Date.now();

    sheet.getRange(2, 3).setValue(lastUpdated);
  }

  return {
    waiterAlarmInterval: interval,
    waiterCanGenerateReceipt: canGenerate,
    lastUpdated: lastUpdated
  };
}


/*
  Actualiza la versión remota.
  Esta función se ejecuta cuando se guardan mesas.
*/

function updateCloudVersion() {
  var sheet = initializeConfigSheet();

  var currentVersion = Number(
    sheet.getRange(2, 3).getValue()
  ) || 0;

  var newVersion = Math.max(
    Date.now(),
    currentVersion + 1
  );

  sheet.getRange(2, 3).setValue(newVersion);

  return newVersion;
}


/*
  Guarda los parámetros de configuración sin aceptar
  versiones antiguas enviadas por el navegador.
*/

function saveConfigSettings(config) {
  var sheet = initializeConfigSheet();

  var current = getConfigData();

  var interval = current.waiterAlarmInterval;
  var canGenerate = current.waiterCanGenerateReceipt;

  if (config.waiterAlarmInterval !== undefined) {
    var newInterval = Number(config.waiterAlarmInterval);

    if (isFinite(newInterval) && newInterval >= 1) {
      interval = newInterval;
    }
  }

  if (config.waiterCanGenerateReceipt !== undefined) {
    canGenerate = config.waiterCanGenerateReceipt !== false &&
      String(config.waiterCanGenerateReceipt).toLowerCase() !== "false";
  }

  sheet.getRange(2, 1, 1, 2).setValues([
    [interval, canGenerate]
  ]);
}


/* ========================================================== */
/* 3. ENDPOINT GET                                            */
/* ========================================================== */

function doGet(e) {
  try {
    var action = e && e.parameter
      ? e.parameter.action
      : "";

    switch (action) {

      case "getData":
        return jsonResponse(getAllData());

      case "getTables":
        return jsonResponse(getTablesOnly());

      case "getProducts":
        return jsonResponse(getProductsOnly());

      case "getTablesAndProducts":
        return jsonResponse(getTablesAndProductsData());

      case "getLastUpdated":
        return jsonResponse({
          status: "success",
          lastUpdated: getConfigData().lastUpdated
        });

      case "getUsersAndConfig":
        return jsonResponse({
          status: "success",
          users: getSheetData("Usuarios"),
          config: getConfigData()
        });

      case "getDashboardDataFiltered":

        var startDate = e.parameter.startDate || "";
        var endDate = e.parameter.endDate || "";

        return jsonResponse(
          getDashboardDataByDateRange(startDate, endDate)
        );

      default:
        return jsonResponse({
          status: "error",
          message: "Acción no válida: " + action
        });
    }

  } catch (error) {

    return jsonResponse({
      status: "error",
      message: error.toString()
    });
  }
}


/* ========================================================== */
/* 4. ENDPOINT POST                                           */
/* ========================================================== */

function doPost(e) {

  var lock = LockService.getScriptLock();

  try {

    if (!e || !e.postData || !e.postData.contents) {
      throw new Error("No se recibió información en la petición.");
    }

    var data = JSON.parse(e.postData.contents);

    if (!data || typeof data !== "object" || Array.isArray(data)) {
      throw new Error("El contenido recibido no es válido.");
    }

    /*
      Evita que dos dispositivos ejecuten escrituras
      simultáneamente sobre las mismas hojas.
    */

    lock.waitLock(LOCK_TIMEOUT_MS);

    var result = saveAllData(data);

    return jsonResponse({
      status: "success",
      message: "Datos guardados correctamente.",
      lastUpdated: result.lastUpdated
    });

  } catch (error) {

    return jsonResponse({
      status: "error",
      message: error.toString()
    });

  } finally {

    if (lock.hasLock()) {
      lock.releaseLock();
    }
  }
}


/* ========================================================== */
/* 5. OBTENER TODOS LOS DATOS                                 */
/* ========================================================== */

function getAllData() {

  return {
    status: "success",

    tables: getSheetData("Mesas"),

    products: getCachedSheetData("Productos"),

    drinks: getCachedSheetData("Bebidas"),

    addons: getCachedSheetData("Adicionales"),

    inventory: getSheetData("Inventario"),

    users: getSheetData("Usuarios"),

    config: getConfigData()
  };
}


/* ========================================================== */
/* 6. OBTENER MESAS Y PRODUCTOS                               */
/* ========================================================== */

function getTablesAndProductsData() {

  return {
    status: "success",

    tables: getTablesOnly().tables,

    products: getCachedSheetData("Productos"),

    config: getConfigData()
  };
}


/* ========================================================== */
/* 7. OBTENER SOLAMENTE LAS MESAS                             */
/* ========================================================== */

function getTablesOnly() {

  var tables = getSheetData("Mesas");

  tables = tables.map(function(table) {

    if (!Array.isArray(table.items)) {
      table.items = [];
    }

    if (!Array.isArray(table.receipts)) {
      table.receipts = [];
    }

    return table;
  });

  return {
    status: "success",
    tables: tables,
    lastUpdated: getConfigData().lastUpdated
  };
}


/* ========================================================== */
/* 8. OBTENER SOLAMENTE LOS PRODUCTOS                         */
/* ========================================================== */

function getProductsOnly() {

  try {

    var products = getCachedSheetData("Productos");

    return {
      status: "success",
      products: products
    };

  } catch (error) {

    return {
      status: "error",
      message: error.toString(),
      products: []
    };
  }
}


/* ========================================================== */
/* 9. SISTEMA DE CACHÉ                                        */
/* ========================================================== */

function getCachedSheetData(sheetName) {

  var cache = CacheService.getScriptCache();

  var cacheKey = "sheet_" + sheetName;

  var cached = cache.get(cacheKey);

  if (cached !== null) {

    try {
      return JSON.parse(cached);
    } catch (error) {
      cache.remove(cacheKey);
    }
  }

  var data = getSheetData(sheetName);

  try {

    cache.put(
      cacheKey,
      JSON.stringify(data),
      CACHE_EXPIRATION_SEC
    );

  } catch (error) {
    console.log("No se pudo guardar caché: " + error);
  }

  return data;
}


/*
  Invalida la caché cuando cambian los catálogos.
*/

function clearCatalogCache() {

  var cache = CacheService.getScriptCache();

  cache.removeAll([
    "sheet_Productos",
    "sheet_Bebidas",
    "sheet_Adicionales"
  ]);
}


/* ========================================================== */
/* 10. CONSULTA DEL DASHBOARD                                 */
/* ========================================================== */

function getDashboardDataByDateRange(startDate, endDate) {

  var allSales = getSheetData("Facturas");

  if (!startDate || !endDate) {

    return {
      status: "success",
      salesHistory: allSales
    };
  }

  var filtered = allSales.filter(function(sale) {

    if (!sale.fecha) {
      return false;
    }

    var dateText = String(sale.fecha).trim();

    var isoDate = "";

    if (dateText.indexOf("/") !== -1) {

      var parts = dateText.split("/");

      if (parts.length !== 3) {
        return false;
      }

      var day = ("0" + parts[0].trim()).slice(-2);
      var month = ("0" + parts[1].trim()).slice(-2);
      var year = parts[2].trim();

      isoDate = year + "-" + month + "-" + day;

    } else {

      isoDate = dateText.substring(0, 10);
    }

    return isoDate >= startDate && isoDate <= endDate;
  });

  return {
    status: "success",
    salesHistory: filtered
  };
}


/* ========================================================== */
/* 11. LEER DATOS DE GOOGLE SHEETS                             */
/* ========================================================== */

function getSheetData(sheetName) {

  var sheet = SS.getSheetByName(sheetName);

  if (!sheet) {
    return [];
  }

  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();

  if (lastRow <= 1 || lastCol < 1) {
    return [];
  }

  var rows = sheet.getRange(
    1,
    1,
    lastRow,
    lastCol
  ).getValues();

  var headers = rows[0].map(function(header) {

    return String(header).trim().toLowerCase();

  });

  var result = [];

  var tz = Session.getScriptTimeZone();

  for (var i = 1; i < rows.length; i++) {

    var obj = {};

    for (var j = 0; j < headers.length; j++) {

      var header = headers[j];

      if (!header) {
        continue;
      }

      var value = rows[i][j];

      if (
        sheetName === "Facturas" &&
        value instanceof Date
      ) {

        if (header === "fecha") {

          value = Utilities.formatDate(
            value,
            tz,
            "dd/MM/yyyy"
          );

        } else if (header === "hora") {

          value = Utilities.formatDate(
            value,
            tz,
            "hh:mm:ss a"
          );
        }
      }

      /*
        Convierte campos JSON almacenados como texto.
        Ejemplo: items, receipts, components, modifications.
      */

      if (typeof value === "string") {

        var trimmed = value.trim();

        if (
          (trimmed.charAt(0) === "[" &&
           trimmed.charAt(trimmed.length - 1) === "]") ||

          (trimmed.charAt(0) === "{" &&
           trimmed.charAt(trimmed.length - 1) === "}")
        ) {

          try {
            value = JSON.parse(trimmed);
          } catch (error) {
            // Mantiene el texto original si no es JSON válido.
          }
        }
      }

      obj[header] = value;
    }

    result.push(obj);
  }

  return result;
}


/* ========================================================== */
/* 12. GUARDAR TODOS LOS DATOS                                */
/* ========================================================== */

/**
 * Comprueba si una hoja contiene registros además del encabezado.
 * Evita reemplazar catálogos existentes con arreglos vacíos.
 */

function sheetHasDataRows(sheetName) {
    var sheet = SS.getSheetByName(sheetName);

    if (!sheet) {
        return false;
    }

    return sheet.getLastRow() > 1;
}



function saveAllData(data) {

    var tablesChanged = Array.isArray(data.tables);

    var configChanged =
        data.config &&
        typeof data.config === "object";

    var catalogChanged = false;

    /*
      MESAS
    */

    if (tablesChanged) {
        saveSheetData("Mesas", data.tables);
    }

    /*
      PRODUCTOS
      Protección contra arreglos vacíos.
    */

    if (Array.isArray(data.products)) {

        if (
            data.products.length > 0 ||
            !sheetHasDataRows("Productos")
        ) {
            saveSheetData("Productos", data.products);
            catalogChanged = true;

        } else {
            Logger.log(
                "Protección: se evitó borrar Productos con un arreglo vacío."
            );
        }
    }

    /*
      BEBIDAS
    */

    if (Array.isArray(data.drinks)) {

        if (
            data.drinks.length > 0 ||
            !sheetHasDataRows("Bebidas")
        ) {
            saveSheetData("Bebidas", data.drinks);
            catalogChanged = true;

        } else {
            Logger.log(
                "Protección: se evitó borrar Bebidas con un arreglo vacío."
            );
        }
    }

    /*
      ADICIONALES
    */

    if (Array.isArray(data.addons)) {

        if (
            data.addons.length > 0 ||
            !sheetHasDataRows("Adicionales")
        ) {
            saveSheetData("Adicionales", data.addons);
            catalogChanged = true;

        } else {
            Logger.log(
                "Protección: se evitó borrar Adicionales con un arreglo vacío."
            );
        }
    }

    /*
      INVENTARIO
    */

    if (Array.isArray(data.inventory)) {
        saveSheetData("Inventario", data.inventory);
    }

    /*
      USUARIOS
    */

    if (Array.isArray(data.users)) {
        saveSheetData("Usuarios", data.users);
    }

    /*
      FACTURAS
    */

    if (Array.isArray(data.salesHistory)) {

        ensureSheet(
            "Facturas",
            [
                "facnumero",
                "mesa",
                "plato",
                "detallesmodificaciones",
                "valorpagado",
                "fecha",
                "hora",
                "usuario"
            ]
        );

        appendNewSales(
            "Facturas",
            data.salesHistory
        );
    }

    /*
      CONFIGURACIÓN
    */

    if (configChanged) {
        saveConfigSettings(data.config);
    }

    /*
      INVALIDAR CACHÉ SOLAMENTE SI SE GUARDÓ
      ALGÚN CATÁLOGO.
    */

    if (catalogChanged) {
        clearCatalogCache();
    }

    /*
      ACTUALIZAR VERSIÓN REMOTA.
    */

    var newVersion = getConfigData().lastUpdated;

    if (tablesChanged || configChanged) {
        newVersion = updateCloudVersion();
    }

    return {
        status: "success",
        lastUpdated: newVersion
    };
}



/* ========================================================== */
/* 13. CREAR HOJAS Y ENCABEZADOS                              */
/* ========================================================== */

function ensureSheet(sheetName, defaultHeaders) {

  var sheet = SS.getSheetByName(sheetName);

  if (!sheet) {

    sheet = SS.insertSheet(sheetName);

    sheet.getRange(
      1,
      1,
      1,
      defaultHeaders.length
    ).setValues([defaultHeaders]);

  } else if (sheet.getLastRow() === 0) {

    sheet.getRange(
      1,
      1,
      1,
      defaultHeaders.length
    ).setValues([defaultHeaders]);
  }

  return sheet;
}


/* ========================================================== */
/* 14. ENCABEZADOS POR DEFECTO                                */
/* ========================================================== */

function getDefaultHeaders(sheetName, dataArray) {

  var defaults = {

    "Mesas": [
      "id",
      "name",
      "status",
      "items",
      "receipts"
    ],

    "Productos": [
      "id",
      "name",
      "price",
      "components",
      "category",
      "active"
    ],

    "Bebidas": [
      "id",
      "name",
      "price",
      "active"
    ],

    "Adicionales": [
      "id",
      "name",
      "price",
      "active"
    ],

    "Usuarios": [
      "id",
      "username",
      "pass",
      "role"
    ],

    "Inventario": [
      "id",
      "name",
      "quantity",
      "unit"
    ],

    "Facturas": [
      "facnumero",
      "mesa",
      "plato",
      "detallesmodificaciones",
      "valorpagado",
      "fecha",
      "hora",
      "usuario"
    ]
  };

  if (defaults[sheetName]) {
    return defaults[sheetName];
  }

  if (dataArray.length > 0) {
    return Object.keys(dataArray[0]);
  }

  return ["id"];
}


/* ========================================================== */
/* 15. GUARDAR UNA HOJA COMPLETA                              */
/* ========================================================== */

function saveSheetData(sheetName, dataArray) {

  if (!Array.isArray(dataArray)) {

    throw new Error(
      "Los datos de " + sheetName + " no son un arreglo."
    );
  }

  var defaultHeaders = getDefaultHeaders(
    sheetName,
    dataArray
  );

  var sheet = ensureSheet(
    sheetName,
    defaultHeaders
  );

  var lastCol = sheet.getLastColumn();

  if (lastCol < 1) {
    throw new Error(
      "No se encontraron encabezados en " + sheetName
    );
  }

  /*
    Asegurar columnas category y active en Productos.
  */

  if (sheetName === "Productos") {

    var productHeaders = sheet.getRange(
      1,
      1,
      1,
      lastCol
    ).getValues()[0].map(function(h) {
      return String(h).trim().toLowerCase();
    });

    if (productHeaders.indexOf("category") === -1) {

      lastCol++;

      sheet.getRange(1, lastCol).setValue("category");
    }

    if (productHeaders.indexOf("active") === -1) {

      lastCol++;

      sheet.getRange(1, lastCol).setValue("active");
    }
  }

  lastCol = sheet.getLastColumn();

  var headers = sheet.getRange(
    1,
    1,
    1,
    lastCol
  ).getValues()[0].map(function(h) {

    return String(h).trim().toLowerCase();

  });

  /*
    Limpiar registros anteriores sin borrar encabezados.
  */

  var lastRow = sheet.getLastRow();

  if (lastRow > 1) {

    sheet.getRange(
      2,
      1,
      lastRow - 1,
      lastCol
    ).clearContent();
  }

  if (dataArray.length === 0) {
    return;
  }

  var rowsToInsert = [];

  dataArray.forEach(function(item) {

    var row = [];

    headers.forEach(function(header) {

      var value = item[header] !== undefined
        ? item[header]
        : "";

      if (
        value !== null &&
        typeof value === "object" &&
        !(value instanceof Date)
      ) {

        value = JSON.stringify(value);
      }

      if (value === null || value === undefined) {
        value = "";
      }

      row.push(value);
    });

    rowsToInsert.push(row);
  });

  sheet.getRange(
    2,
    1,
    rowsToInsert.length,
    headers.length
  ).setValues(rowsToInsert);
}


/* ========================================================== */
/* 16. AGREGAR NUEVAS FACTURAS                                */
/* ========================================================== */

function appendNewSales(sheetName, dataArray) {

  if (!Array.isArray(dataArray) || dataArray.length === 0) {
    return;
  }

  var sheet = SS.getSheetByName(sheetName);

  if (!sheet) {

    throw new Error(
      "No existe la hoja de facturas."
    );
  }

  var lastCol = sheet.getLastColumn();

  var headers = sheet.getRange(
    1,
    1,
    1,
    lastCol
  ).getValues()[0].map(function(h) {

    return String(h).trim().toLowerCase();

  });

  var rowsToInsert = [];

  var tz = Session.getScriptTimeZone();

  dataArray.forEach(function(item) {

    var row = [];

    headers.forEach(function(header) {

      var value = item[header] !== undefined
        ? item[header]
        : "";

      if (header === "valorpagado" && value !== "") {

        value = Number(value);

      } else if (header === "fecha") {

        value = value instanceof Date
          ? Utilities.formatDate(value, tz, "dd/MM/yyyy")
          : String(value);

      } else if (header === "hora") {

        value = value instanceof Date
          ? Utilities.formatDate(value, tz, "hh:mm:ss a")
          : String(value);

      } else if (
        value !== null &&
        typeof value === "object"
      ) {

        value = JSON.stringify(value);
      }

      if (value === null || value === undefined) {
        value = "";
      }

      row.push(value);
    });

    rowsToInsert.push(row);
  });

  var nextRow = sheet.getLastRow() + 1;

  sheet.getRange(
    nextRow,
    1,
    rowsToInsert.length,
    headers.length
  ).setValues(rowsToInsert);

  var valueIndex = headers.indexOf("valorpagado");

  if (valueIndex !== -1) {

    sheet.getRange(
      nextRow,
      valueIndex + 1,
      rowsToInsert.length,
      1
    ).setNumberFormat("$#,##0");
  }

  var dateIndex = headers.indexOf("fecha");

  if (dateIndex !== -1) {

    sheet.getRange(
      nextRow,
      dateIndex + 1,
      rowsToInsert.length,
      1
    ).setNumberFormat("@");
  }

  var timeIndex = headers.indexOf("hora");

  if (timeIndex !== -1) {

    sheet.getRange(
      nextRow,
      timeIndex + 1,
      rowsToInsert.length,
      1
    ).setNumberFormat("@");
  }
}


/* ========================================================== */
/* 17. PRUEBAS DEL BACKEND                                    */
/* ========================================================== */

function testGetProductsOnly() {

  var result = getProductsOnly();

  Logger.log(
    JSON.stringify(result, null, 2)
  );

  if (result.status === "success") {

    Logger.log(
      "Éxito: " + result.products.length +
      " productos encontrados."
    );

  } else {

    Logger.log(
      "Error: " + result.message
    );
  }
}


function testEndpointLogin() {

  var result = {

    status: "success",

    users: getSheetData("Usuarios"),

    config: getConfigData()
  };

  Logger.log(
    JSON.stringify(result, null, 2)
  );
}


function testEndpointTables() {

  var result = getTablesOnly();

  Logger.log(
    JSON.stringify(result, null, 2)
  );
}


function testCloudVersion() {

  var result = getConfigData();

  Logger.log(
    "Versión actual: " + result.lastUpdated
  );
}


function testBackend() {

  Logger.log("========== PRUEBA RESTOPOS ==========");

  Logger.log(
    "Mesas: " + getTablesOnly().tables.length
  );

  Logger.log(
    "Productos: " + getProductsOnly().products.length
  );

  Logger.log(
    "Usuarios: " + getSheetData("Usuarios").length
  );

  Logger.log(
    "Versión: " + getConfigData().lastUpdated
  );

  Logger.log("========== FIN DE PRUEBA ==========");
}
