const fs = require('fs');
const pool = require('./bd'); // Importamos tu conexión a PostgreSQL

async function insertarVocabulario() {
    try {
        console.log('⏳ Leyendo el archivo CSV...');
        const data = fs.readFileSync('vocabulario_base.csv', 'utf8');
        
        // Dividimos el archivo por saltos de línea
        const lineas = data.split('\n');
        let contador = 0;

        // Empezamos en i = 1 para saltarnos la primera línea (las cabeceras)
        for (let i = 1; i < lineas.length; i++) {
            const linea = lineas[i].trim();
            if (!linea) continue; // Si hay una línea en blanco al final, la saltamos

            // Separamos por comas
            const [palabra, edad, categoria, ruta_concepto, ruta_signo, es_sistema] = linea.split(',');

            // Preparamos la consulta SQL
            const query = `
                INSERT INTO diccionario (palabra, edad, categoria, ruta_concepto, ruta_signo, es_sistema)
                VALUES ($1, $2, $3, $4, $5, $6)
                /* Si tu tabla no tiene la palabra como clave única (UNIQUE), puedes quitar la siguiente línea */
                ON CONFLICT (palabra) DO NOTHING; 
            `;
            
            // Convertimos los datos al formato correcto
            const values = [
                palabra, 
                parseInt(edad), 
                categoria, 
                ruta_concepto, 
                ruta_signo, 
                es_sistema === 'true' // Convierte el texto "true" en un booleano real
            ];

            await pool.query(query, values);
            contador++;
            console.log(`✅ Insertada: ${palabra}`);
        }
        
        console.log(`\n🎉 ¡Éxito! Se han insertado ${contador} palabras en la base de datos.`);
    } catch (error) {
        console.error('❌ Error al insertar datos:', error);
    } finally {
        // Cerramos la conexión para que la terminal no se quede colgada
        pool.end(); 
    }
}

insertarVocabulario();