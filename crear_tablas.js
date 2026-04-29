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
      nombre VARCHAR(50) NOT NULL, -- Ej: "Los Delfines"
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
      codigo_familia VARCHAR(10) UNIQUE, -- ¡VITAL PARA LA GESTIÓN DE PADRES!
      
      FOREIGN KEY (id_tutor) REFERENCES usuarios(id) ON DELETE SET NULL,
      FOREIGN KEY (id_aula) REFERENCES aulas(id) ON DELETE CASCADE
  );

  CREATE TABLE diccionario (
      id SERIAL PRIMARY KEY,
      palabra VARCHAR(50) NOT NULL,
      categoria VARCHAR(50),
      url_video VARCHAR(255),
      url_imagen VARCHAR(255),
      edad_recomendada INT NOT NULL DEFAULT 3,
      nivel INT DEFAULT 1, -- ¡VITAL PARA EL MAPA Y MINIJUEGOS!
      id_profesor INT,     -- ¡VITAL PARA EL PANEL DE ADMINISTRACIÓN!
      
      FOREIGN KEY (id_profesor) REFERENCES usuarios(id) ON DELETE CASCADE
  );

  CREATE TABLE progreso (
      id SERIAL PRIMARY KEY,
      id_alumno INT NOT NULL,
      id_signo INT NOT NULL,
      aciertos INT DEFAULT 0,
      completado BOOLEAN DEFAULT FALSE,
      fecha_ultimo_juego TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      
      FOREIGN KEY (id_alumno) REFERENCES alumnos(id) ON DELETE CASCADE,
      FOREIGN KEY (id_signo) REFERENCES diccionario(id) ON DELETE CASCADE,
      UNIQUE(id_alumno, id_signo)
  );

  -- 1. CREAMOS LOS USUARIOS
  INSERT INTO usuarios (nombre, email, password, rol) VALUES 
  ('Daniela', 'daniela@cole.com', '1234', 'docente'),
  ('Alfredo', 'alfredo@casa.com', '1234', 'familia');

  -- 2. CREAMOS AULAS PARA DANIELA (id_profesor = 1)
  INSERT INTO aulas (nombre, edad_nivel, id_profesor) VALUES 
  ('Infantil 1', 3, 1),
  ('Infantil 2', 4, 1);

  -- 3. MATRICULAMOS ALUMNOS (Con código de familia)
  INSERT INTO alumnos (nombre, edad, id_aula, codigo_familia) VALUES 
  ('Juanito (Alumno)', 3, 1, 'ABC-123'),
  ('Dani (Hijo)', 4, 2, 'DEF-456');

  -- 4. AÑADIMOS PALABRAS ASIGNADAS A DANIELA (id_profesor = 1)
  INSERT INTO diccionario (palabra, categoria, url_video, url_imagen, edad_recomendada, nivel, id_profesor) VALUES
  ('Manzana', 'Comida', 'https://ejemplo.com/video.mp4', 'https://ejemplo.com/manzana.jpg', 3, 1, 1),
  ('Perro', 'Animales', 'https://ejemplo.com/video.mp4', 'https://ejemplo.com/perro.jpg', 3, 2, 1),
  ('Colegio', 'Lugares', 'https://ejemplo.com/video.mp4', 'https://ejemplo.com/cole.jpg', 4, 3, 1);
`;

console.log('🏗️  Reconstruyendo la Base de Datos SIJU...');

pool.query(crearTablasQuery, (err, res) => {
  if (err) {
    console.error('Error:', err);
  } else {
    console.log('BASE DE DATOS LISTA');
  }
  pool.end();
});