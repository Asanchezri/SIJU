const pool = require('./bd');

async function arreglarNiveles() {
    console.log('⏳ Asignando niveles de texto a las palabras...');
    
    try {
        // Nivel Básico
        await pool.query(`UPDATE diccionario SET nivel = 'Básico' WHERE categoria IN ('Necesidades básicas', 'Comunicación', 'Familia', 'Colores')`);
        
        // Nivel Medio
        await pool.query(`UPDATE diccionario SET nivel = 'Medio' WHERE categoria IN ('Animales', 'Juego', 'Entorno', 'Colegio', 'Acción', 'Social')`);
        
        // Nivel Difícil
        await pool.query(`UPDATE diccionario SET nivel = 'Difícil' WHERE categoria IN ('Emociones', 'Tiempo', 'Profesiones', 'Dactilología', 'Cortesía')`);

        // Por si alguna se queda vacía, le ponemos Básico
        await pool.query(`UPDATE diccionario SET nivel = 'Básico' WHERE nivel IS NULL`);

        console.log('✅ ¡Niveles asignados! (Básico, Medio y Difícil).');
    } catch (error) {
        console.error('❌ Error asignando niveles:', error);
    } finally {
        pool.end();
    }
}

arreglarNiveles();