
/**
 * ==========================================================
 * RESTOPOS - CONFIGURACIÓN GLOBAL
 * Variables compartidas por los módulos de la aplicación
 * ==========================================================
 */

//const WEB_APP_URL = "https://script.google.com/macros/s/AKfycbzhezTR3M0sdvL83xWy8EwUrHfIpmG841DT0kd85rzuYaCB4iauIvDNoON8xIdjW93XmA/exec";

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

let kitchenInterval = null;
let kitchenCloudPollInterval = null;
let kitchenFirestoreUnsubscribe = null;
let tablesRefreshInterval = null;

let lastKitchenAlarmTime = 0;
let lastWaiterAlarmTime = 0;
// Temporizadores para guardar observaciones de platos en Firebase.
let observationSaveTimers = {};
