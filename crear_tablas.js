const { Pool } = require('pg');

const pool = new Pool({
  user: 'system',
  host: 'localhost',
  database: 'postgres',
  password: 'manager',
  port: 5432,
});

const crearTablasQuery = `
  DROP TABLE IF EXISTS progreso;
  DROP TABLE IF EXISTS diccionario;
  DROP TABLE IF EXISTS alumnos;
  DROP TABLE IF EXISTS aulas;
  DROP TABLE IF EXISTS usuarios;

  CREATE TABLE usuarios (
      id SERIAL PRIMARY KEY,
      nombre VARCHAR(100) NOT NULL,
      email VARCHAR(100) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      rol VARCHAR(20) NOT NULL CHECK (rol IN ('familia', 'docente', 'admin')),
      fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE aulas (
      id SERIAL PRIMARY KEY,
      nombre VARCHAR(50) NOT NULL,
      edad_nivel INT NOT NULL CHECK (edad_nivel IN (3, 4, 5)),
      id_profesor INT NOT NULL,
      FOREIGN KEY (id_profesor) REFERENCES usuarios(id) ON DELETE CASCADE
  );

  CREATE TABLE alumnos (
      id SERIAL PRIMARY KEY,
      nombre VARCHAR(50) NOT NULL,
      avatar VARCHAR(255) DEFAULT 'avatar_default.png',
      edad INT NOT NULL CHECK (edad IN (3, 4, 5)),
      id_tutor INT,
      id_aula INT,
      codigo_familia VARCHAR(10) UNIQUE,
      email_tutor VARCHAR(100),
      FOREIGN KEY (id_tutor) REFERENCES usuarios(id) ON DELETE SET NULL,
      FOREIGN KEY (id_aula) REFERENCES aulas(id) ON DELETE CASCADE
  );

  CREATE TABLE diccionario (
      id SERIAL PRIMARY KEY,
      palabra VARCHAR(100) UNIQUE NOT NULL,
      edad INT NOT NULL,
      categoria VARCHAR(100),
      ruta_concepto VARCHAR(255),
      ruta_signo VARCHAR(255),
      es_sistema BOOLEAN DEFAULT true,
      id_profesor INT,
      nivel VARCHAR(50),
      FOREIGN KEY (id_profesor) REFERENCES usuarios(id) ON DELETE SET NULL
  );

  CREATE TABLE progreso (
      id SERIAL PRIMARY KEY,
      id_alumno INT,
      id_signo INT NOT NULL,
      aciertos INT DEFAULT 0,
      completado BOOLEAN DEFAULT FALSE,
      fecha_ultimo_juego TIMESTAMP DEFAULT (NOW() AT TIME ZONE 'Europe/Madrid'),
      id_aula INT,
      FOREIGN KEY (id_alumno) REFERENCES alumnos(id) ON DELETE CASCADE,
      FOREIGN KEY (id_signo) REFERENCES diccionario(id) ON DELETE CASCADE,
      FOREIGN KEY (id_aula) REFERENCES aulas(id) ON DELETE CASCADE,
      UNIQUE(id_alumno, id_signo)
  );

  INSERT INTO usuarios (nombre, email, password, rol) VALUES
  ('Daniela', 'daniela@cole.com', '$2b$10$ejemplohashbcrypt', 'docente'),
  ('Alfredo', 'alfredo@casa.com', '$2b$10$ejemplohashbcrypt', 'familia');

  INSERT INTO aulas (nombre, edad_nivel, id_profesor) VALUES
  ('Infantil 1', 3, 1),
  ('Infantil 2', 4, 1);

  INSERT INTO alumnos (nombre, edad, id_aula, codigo_familia) VALUES
  ('Juanito', 3, 1, 'ABC123'),
  ('Dani', 4, 2, 'DEF456');
`;

console.log('Reconstruyendo la base de datos SIJU...');

pool.query(crearTablasQuery, (err, res) => {
  if (err) {
    console.error('Error:', err);
  } else {
    console.log('Base de datos lista.');
  }
  pool.end();
});