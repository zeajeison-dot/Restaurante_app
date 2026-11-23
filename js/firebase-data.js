
/**
 * ==========================================================
 * RESTOPOS - SERVICIOS DE DATOS FIREBASE
 * Operaciones comunes con Cloud Firestore
 * ==========================================================
 *
 * Este módulo centraliza:
 * - Lectura de documentos y colecciones.
 * - Creación de documentos.
 * - Actualización de documentos.
 * - Eliminación de documentos.
 * - Escucha de cambios en tiempo real.
 * - Operaciones por lotes y transacciones.
 *
 * IMPORTANTE:
 * No contiene lógica visual ni modifica app.js.
 * ==========================================================
 */

window.RestoposDB = (() => {

    /**
     * Verificar que Firebase y Firestore estén disponibles.
     */
    function getDatabase() {
        if (!window.db) {
            throw new Error(
                'Firebase Firestore no está inicializado.'
            );
        }

        return window.db;
    }

    /**
     * Verificar que exista una sesión autenticada.
     */
    function requireAuth() {
        if (!window.auth || !window.auth.currentUser) {
            throw new Error(
                'Se requiere iniciar sesión para acceder a los datos.'
            );
        }

        return window.auth.currentUser;
    }

    /**
     * Obtener una colección de Firestore.
     */
    function getCollection(collectionName) {
        if (
            typeof collectionName !== 'string' ||
            !collectionName.trim()
        ) {
            throw new Error('Nombre de colección no válido.');
        }

        return getDatabase().collection(collectionName);
    }

    /**
     * Obtener todos los documentos de una colección.
     *
     * Conserva los campos originales y agrega _docId,
     * que contiene el identificador real de Firestore.
     */
    async function getAll(collectionName) {
        requireAuth();

        const snapshot = await getCollection(collectionName).get();

        return snapshot.docs.map(doc => ({
            ...doc.data(),
            _docId: doc.id
        }));
    }

    /**
     * Obtener un documento por su ID.
     */
    async function getById(collectionName, documentId) {
        requireAuth();

        if (!documentId) {
            throw new Error('Se requiere el ID del documento.');
        }

        const doc = await getCollection(collectionName)
            .doc(String(documentId))
            .get();

        if (!doc.exists) {
            return null;
        }

        return {
            ...doc.data(),
            _docId: doc.id
        };
    }

    /**
     * Crear un documento con ID automático.
     *
     * Si no existe un campo id, se utiliza el ID generado
     * por Firestore como identificador del registro.
     */
    async function add(collectionName, data) {
        requireAuth();

        if (!data || typeof data !== 'object' || Array.isArray(data)) {
            throw new Error('Los datos del documento no son válidos.');
        }

        const collection = getCollection(collectionName);
        const documentRef = collection.doc();

        const documentData = {
            ...data,
            id: data.id !== undefined ? data.id : documentRef.id
        };

        await documentRef.set(documentData);

        return {
            id: documentData.id,
            _docId: documentRef.id
        };
    }

    /**
     * Crear o reemplazar un documento con ID específico.
     *
     * merge = true conserva los campos que no se envían.
     */
    async function set(collectionName, documentId, data, merge = true) {
        requireAuth();

        if (!documentId) {
            throw new Error('Se requiere el ID del documento.');
        }

        if (!data || typeof data !== 'object' || Array.isArray(data)) {
            throw new Error('Los datos del documento no son válidos.');
        }

        await getCollection(collectionName)
            .doc(String(documentId))
            .set(data, { merge });

        return true;
    }

    /**
     * Actualizar campos específicos de un documento.
     */
    async function update(collectionName, documentId, data) {
        requireAuth();

        if (!documentId) {
            throw new Error('Se requiere el ID del documento.');
        }

        if (!data || typeof data !== 'object' || Array.isArray(data)) {
            throw new Error('Los datos de actualización no son válidos.');
        }

        await getCollection(collectionName)
            .doc(String(documentId))
            .update(data);

        return true;
    }

    /**
     * Eliminar un documento.
     */
    async function remove(collectionName, documentId) {
        requireAuth();

        if (!documentId) {
            throw new Error('Se requiere el ID del documento.');
        }

        await getCollection(collectionName)
            .doc(String(documentId))
            .delete();

        return true;
    }

    /**
     * Escuchar cambios en tiempo real de una colección.
     *
     * Devuelve una función unsubscribe para detener
     * la escucha cuando ya no sea necesaria.
     */
    function listenCollection(
        collectionName,
        onData,
        onError
    ) {
        requireAuth();

        if (typeof onData !== 'function') {
            throw new Error('Se requiere una función para recibir los datos.');
        }

        return getCollection(collectionName).onSnapshot(
            snapshot => {
                const records = snapshot.docs.map(doc => ({
                    ...doc.data(),
                    _docId: doc.id
                }));

                onData(records);
            },
            error => {
                console.error(
                    'RESTOPOS: error escuchando colección:',
                    collectionName,
                    error
                );

                if (typeof onError === 'function') {
                    onError(error);
                }
            }
        );
    }

    /**
     * Escuchar cambios en tiempo real de un documento.
     */
    function listenDocument(
        collectionName,
        documentId,
        onData,
        onError
    ) {
        requireAuth();

        if (!documentId) {
            throw new Error('Se requiere el ID del documento.');
        }

        if (typeof onData !== 'function') {
            throw new Error('Se requiere una función para recibir los datos.');
        }

        return getCollection(collectionName)
            .doc(String(documentId))
            .onSnapshot(
                doc => {
                    onData(
                        doc.exists
                            ? { ...doc.data(), _docId: doc.id }
                            : null
                    );
                },
                error => {
                    console.error(
                        'RESTOPOS: error escuchando documento:',
                        documentId,
                        error
                    );

                    if (typeof onError === 'function') {
                        onError(error);
                    }
                }
            );
    }

    /**
     * Ejecutar varias escrituras en un lote.
     */
    async function runBatch(callback) {
    requireAuth();

    if (typeof callback !== 'function') {
        throw new Error('Se requiere una función para configurar el lote.');
    }

    const database = getDatabase();
    const batch = database.batch();

    await callback(batch, database);

    await batch.commit();

    return true;
}

    /**
     * Ejecutar una transacción de Firestore.
     */
    async function runTransaction(callback) {
        requireAuth();

        if (typeof callback !== 'function') {
            throw new Error('Se requiere una función para la transacción.');
        }

        return getDatabase().runTransaction(callback);
    }

    /**
     * API pública de RESTOPOS.
     */
    return {
        getAll,
        getById,
        add,
        set,
        update,
        remove,
        listenCollection,
        listenDocument,
        runBatch,
        runTransaction
    };

})();

console.log(
    'RESTOPOS: Servicios de datos Firebase preparados.'
);


