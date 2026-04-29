const { Pool } = require('pg');

const pool = new Pool({
  user: 'system',         
  host: 'localhost',   
  database: 'postgres',
  password: 'manager',
  port: 5432,
});

console.log('⏳ Inicializando conexión a la base de datos...');

// EXPORTAMOS el pool para que insertar_datos.js lo pueda usar
module.exports = pool;