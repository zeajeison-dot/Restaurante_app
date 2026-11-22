
/**
 * ==========================================================
 * RESTOPOS - CONEXIÓN CON FIREBASE
 * Inicialización de Authentication y Firestore
 * ==========================================================
 */

const firebaseConfig = {
    apiKey: "AIzaSyDbVdWO-nOwA7F_0Yg7Fl1kaJw0lnK1afU",
    authDomain: "restopos-83ddf.firebaseapp.com",
    projectId: "restopos-83ddf",
    storageBucket: "restopos-83ddf.firebasestorage.app",
    messagingSenderId: "561362304600",
    appId: "1:561362304600:web:4ad333495c5dea774d942d"
};

// Inicializar Firebase
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

// Referencias globales para RESTOPOS
window.firebaseApp = firebase.app();
window.auth = window.firebaseApp.auth();
window.db = window.firebaseApp.firestore();

console.log("RESTOPOS: Firebase inicializado correctamente.");
