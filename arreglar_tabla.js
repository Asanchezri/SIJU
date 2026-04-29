const pool = require('./bd');

async function resetTabla() {
    console.log('⏳ Recreando la tabla diccionario DEFINITIVA...');
    const query = `
        DROP TABLE IF EXISTS diccionario CASCADE;
        
        CREATE TABLE diccionario (
            id SERIAL PRIMARY KEY,
            palabra VARCHAR(100) UNIQUE NOT NULL,
            edad INTEGER NOT NULL,
            categoria VARCHAR(100),
            ruta_concepto VARCHAR(255),
            ruta_signo VARCHAR(255),
            es_sistema BOOLEAN DEFAULT true,
            id_profesor INTEGER,
            nivel VARCHAR(50)
        );
    `;
    
    try {
        await pool.query(query);
        console.log('✅ ¡Tabla diccionario creada perfecta!');
    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        pool.end();
    }
}

resetTabla();