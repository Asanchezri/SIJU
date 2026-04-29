const express = require('express');
const { Pool } = require('pg');
const path = require('path');

const app = express();
const port = 3000;

const pool = new Pool({
  user: 'system',
  host: 'localhost',
  database: 'postgres',
  password: 'manager',
  port: 5432,
});

// Parche silencioso: Permite guardar progreso del aula sin obligar a que haya un alumno
pool.query('ALTER TABLE progreso ADD COLUMN IF NOT EXISTS id_aula INTEGER; ALTER TABLE progreso ALTER COLUMN id_alumno DROP NOT NULL;').catch(() => {});

app.use(express.json()); 
app.use(express.static('public'));

// --- OBTENER DICCIONARIO ---
app.get('/diccionario', async (req, res) => {
    try {
        const { edad, docente, alumno } = req.query; 
        
        let consulta = 'SELECT * FROM diccionario WHERE 1=1';
        let parametros = [];
        let contador = 1;

        if (edad) {
            consulta += ` AND edad = $${contador}`;
            parametros.push(parseInt(edad)); 
            contador++;
        }

        if (docente) {
            consulta += ` AND (id_profesor IS NULL OR id_profesor = $${contador})`;
            parametros.push(docente);
        } else if (alumno) {
            consulta += ` AND (id_profesor IS NULL OR id_profesor = (
                SELECT aulas.id_profesor FROM alumnos 
                JOIN aulas ON alumnos.id_aula = aulas.id 
                WHERE alumnos.id = $${contador}
            ))`;
            parametros.push(alumno);
        } else {
            consulta += ` AND id_profesor IS NULL`;
        }

        consulta += ' ORDER BY id ASC';
        const resultado = await pool.query(consulta, parametros);
        res.json(resultado.rows);
    } catch (err) {
        console.error("Error en /diccionario:", err);
        res.status(500).send('Error en el servidor');
    }
});

// --- PERFILES ---
app.get('/api/mis-perfiles', async (req, res) => {
    try {
        const { idUsuario, rol } = req.query;
        if (!idUsuario) return res.status(400).json({ error: 'Falta ID' });

        let query = (rol === 'familia') 
            ? 'SELECT * FROM alumnos WHERE id_tutor = $1' 
            : 'SELECT * FROM aulas WHERE id_profesor = $1';

        const resultado = await pool.query(query, [idUsuario]);
        res.json(resultado.rows);
    } catch (err) {
        console.error("Error en /api/mis-perfiles:", err);
        res.status(500).send('Error');
    }
});

// --- PROGRESO ---
app.post('/api/guardar-progreso', async (req, res) => {
    const { id_jugador, tipo, id_signo } = req.body;

    if (!id_jugador || !id_signo || !tipo) {
        return res.status(400).json({ error: 'Faltan datos' });
    }

    try {
        const esAula = tipo === 'aula';
        const idAula = esAula ? id_jugador : null;
        const idAlumno = esAula ? null : id_jugador;

        let comprobacion;
        if (esAula) {
            comprobacion = await pool.query(`SELECT aciertos FROM progreso WHERE id_aula = $1 AND id_signo = $2`, [idAula, id_signo]);
        } else {
            comprobacion = await pool.query(`SELECT aciertos FROM progreso WHERE id_alumno = $1 AND id_signo = $2`, [idAlumno, id_signo]);
        }

        if (comprobacion.rows.length > 0) {
            if (esAula) {
                await pool.query(`UPDATE progreso SET aciertos = aciertos + 1, fecha_ultimo_juego = CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Madrid' WHERE id_aula = $1 AND id_signo = $2`, [idAula, id_signo]);
            } else {
                await pool.query(`UPDATE progreso SET aciertos = aciertos + 1, fecha_ultimo_juego = CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Madrid' WHERE id_alumno = $1 AND id_signo = $2`, [idAlumno, id_signo]);
            }
        } else {
            await pool.query(
                `INSERT INTO progreso (id_alumno, id_aula, id_signo, aciertos, fecha_ultimo_juego) 
                 VALUES ($1, $2, $3, 1, CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Madrid')`,
                [idAlumno, idAula, id_signo]
            );
        }
        res.json({ mensaje: 'OK' });
    } catch (err) {
        console.error("Error al guardar:", err);
        res.status(500).json({ error: 'Error BD' });
    }
});

// --- ESTADÍSTICAS DEL ALUMNO/AULA ---
app.get('/api/progreso-alumno/:id', async (req, res) => {
  try {
      const idJugador = req.params.id;
      const tipo = req.query.tipo || 'alumno'; 

      let query;
      let params = [idJugador];

      if (tipo === 'aula') {
          query = `
              SELECT d.palabra, d.categoria, SUM(p.aciertos) as aciertos, MAX(p.fecha_ultimo_juego) as fecha_ultimo_juego
              FROM progreso p
              JOIN diccionario d ON p.id_signo = d.id
              WHERE p.id_aula = $1 OR p.id_alumno IN (SELECT id FROM alumnos WHERE id_aula = $1)
              GROUP BY d.palabra, d.categoria
              ORDER BY fecha_ultimo_juego DESC
          `;
      } else {
          query = `
              SELECT p.aciertos, p.fecha_ultimo_juego, d.palabra, d.categoria
              FROM progreso p
              JOIN diccionario d ON p.id_signo = d.id
              WHERE p.id_alumno = $1
              ORDER BY p.fecha_ultimo_juego DESC
          `;
      }
      const resultado = await pool.query(query, params);
      res.json(resultado.rows);
  } catch (err) {
      console.error(err);
      res.status(500).send('Error al obtener estadísticas');
  }
});

// --- USUARIOS Y LOGIN ---
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  try {
      const query = 'SELECT id, nombre, rol FROM usuarios WHERE email = $1 AND password = $2';
      const resultado = await pool.query(query, [email, password]);

      if (resultado.rows.length > 0) {
          res.json({ success: true, usuario: resultado.rows[0] });
      } else {
          res.status(401).json({ success: false, mensaje: 'Usuario o contraseña incorrectos' });
      }
  } catch (err) {
      console.error(err);
      res.status(500).json({ success: false, mensaje: 'Error en el servidor' });
  }
});

app.post('/api/registro', async (req, res) => {
    const { nombre, email, password, rol } = req.body;
    try {
        const existe = await pool.query('SELECT id FROM usuarios WHERE email = $1', [email]);
        if (existe.rows.length > 0) {
            return res.status(400).json({ success: false, mensaje: 'Ese correo ya está registrado.' });
        }

        const resultado = await pool.query(
            'INSERT INTO usuarios (nombre, email, password, rol) VALUES ($1, $2, $3, $4) RETURNING id, nombre, rol',
            [nombre, email, password, rol]
        );
        res.json({ success: true, usuario: resultado.rows[0] });
    } catch (err) {
        console.error("Error en registro:", err);
        res.status(500).json({ success: false, mensaje: 'Error en el servidor al crear la cuenta' });
    }
});

// --- ADMINISTRACIÓN DE PALABRAS ---
app.post('/api/admin/nueva-palabra', async (req, res) => {
    const { palabra, edad, nivel, ruta_concepto, ruta_signo, id_profesor } = req.body;
    try {
        const resultado = await pool.query(
            `INSERT INTO diccionario (palabra, edad, nivel, ruta_concepto, ruta_signo, id_profesor, es_sistema) 
             VALUES ($1, $2, $3, $4, $5, $6, false) RETURNING *`,
            [palabra, edad, nivel, ruta_concepto, ruta_signo, id_profesor]
        );
        res.json({ mensaje: '✅ Palabra guardada', dato: resultado.rows[0] });
    } catch (error) { res.status(500).json({ error: '❌ Error BD' }); }
});

app.get('/api/admin/mis-palabras', async (req, res) => {
    const { id_profesor } = req.query;
    try {
        const resultado = await pool.query('SELECT * FROM diccionario WHERE id_profesor = $1 ORDER BY id DESC', [id_profesor]);
        res.json(resultado.rows);
    } catch (error) { res.status(500).json({ error: 'Error al obtener palabras' }); }
});

app.put('/api/admin/editar-palabra/:id', async (req, res) => {
    const idPalabra = req.params.id;
    const { palabra, edad, nivel, ruta_concepto, ruta_signo } = req.body;
    try {
        await pool.query(
            `UPDATE diccionario SET palabra = $1, edad = $2, nivel = $3, ruta_concepto = $4, ruta_signo = $5 WHERE id = $6`,
            [palabra, edad, nivel, ruta_concepto, ruta_signo, idPalabra]
        );
        res.json({ mensaje: 'Palabra actualizada' });
    } catch (error) { res.status(500).json({ error: 'Error al actualizar' }); }
});

app.delete('/api/admin/borrar-palabra/:id', async (req, res) => {
    const idPalabra = req.params.id;
    try {
        await pool.query('DELETE FROM progreso WHERE id_signo = $1', [idPalabra]);
        await pool.query('DELETE FROM diccionario WHERE id = $1', [idPalabra]);
        res.json({ mensaje: 'Palabra borrada' });
    } catch (error) { res.status(500).json({ error: 'Error al borrar' }); }
});

// --- GESTIÓN DE AULAS Y ALUMNOS ---
app.post('/api/admin/nueva-aula', async (req, res) => {
    const { nombre, edad, id_profesor } = req.body;
    try {
        const resultado = await pool.query(
            `INSERT INTO aulas (nombre, edad_nivel, id_profesor) VALUES ($1, $2, $3) RETURNING *`,
            [nombre, edad, id_profesor]
        );
        res.json({ mensaje: '✅ Clase guardada', dato: resultado.rows[0] });
    } catch (error) { res.status(500).json({ error: '❌ Error BD' }); }
});

app.post('/api/admin/nuevo-alumno', async (req, res) => {
    const { nombre, edad, id_aula } = req.body;
    const codigo_familia = Math.random().toString(36).substring(2, 8).toUpperCase();

    try {
        const resultado = await pool.query(
            `INSERT INTO alumnos (nombre, edad, id_aula, codigo_familia) VALUES ($1, $2, $3, $4) RETURNING *`,
            [nombre, edad, id_aula, codigo_familia]
        );
        res.json({ mensaje: 'Alumno añadido con éxito', codigo: codigo_familia, dato: resultado.rows[0] });
    } catch (error) { res.status(500).json({ error: '❌ Error al guardar el alumno' }); }
});

app.get('/api/admin/alumnos-aula/:id_aula', async (req, res) => {
    const idAula = req.params.id_aula;
    try {
        const resultado = await pool.query(
            'SELECT id, nombre, edad, codigo_familia FROM alumnos WHERE id_aula = $1 ORDER BY nombre ASC',
            [idAula]
        );
        res.json(resultado.rows);
    } catch (error) {
        console.error("Error obteniendo lista de alumnos:", error);
        res.status(500).json({ error: 'Error al consultar la base de datos' });
    }
});

app.post('/api/familia/vincular-alumno', async (req, res) => {
    const { codigo, id_tutor } = req.body;
    try {
        const comprobacion = await pool.query(
            'SELECT id, nombre, id_tutor FROM alumnos WHERE codigo_familia = $1',
            [codigo]
        );

        if (comprobacion.rows.length === 0) {
            return res.status(404).json({ error: 'Código incorrecto o no existe' });
        }

        const alumno = comprobacion.rows[0];

        if (alumno.id_tutor) {
             return res.status(400).json({ error: 'Este perfil ya está vinculado a una familia' });
        }

        await pool.query(
            'UPDATE alumnos SET id_tutor = $1 WHERE codigo_familia = $2',
            [id_tutor, codigo]
        );

        res.json({ mensaje: `¡Perfil de ${alumno.nombre} vinculado con éxito!` });
    } catch (error) {
        console.error("Error al vincular:", error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// --- PUENTE HACIA LA IA EN PYTHON (¡CON DATOS AGRUPADOS Y ORDENADOS!) ---
app.post('/api/chat-ia', async (req, res) => {
    const { mensaje, rol, id_usuario } = req.body;
    let stats = null;

    try {
        if (id_usuario) {
            if (rol === 'docente') {
                const query = `
                    SELECT 
                        a.nombre as clase, 
                        COALESCE(al.nombre, 'Práctica General (Toda la clase)') as alumno, 
                        d.palabra, 
                        SUM(p.aciertos) as aciertos
                    FROM progreso p
                    JOIN diccionario d ON p.id_signo = d.id
                    LEFT JOIN alumnos al ON p.id_alumno = al.id
                    LEFT JOIN aulas a ON (p.id_aula = a.id OR al.id_aula = a.id)
                    WHERE a.id_profesor = $1
                    GROUP BY a.nombre, al.nombre, d.palabra
                `;
                const resDB = await pool.query(query, [id_usuario]);
                
                if (resDB.rows.length > 0) {
                    // Agrupamos los datos en un formato de "carpetas" que la IA entiende perfecto
                    const datosAgrupados = {};
                    resDB.rows.forEach(row => {
                        const clase = row.clase || 'Clase Desconocida';
                        const alumno = row.alumno;
                        
                        if (!datosAgrupados[clase]) datosAgrupados[clase] = {};
                        if (!datosAgrupados[clase][alumno]) datosAgrupados[clase][alumno] = [];
                        
                        datosAgrupados[clase][alumno].push(`${row.palabra} (${row.aciertos} aciertos)`);
                    });
                    stats = { tipo: "informe_docente", resumen_aulas: datosAgrupados };
                }
            } else if (rol === 'familia') {
                const query = `
                    SELECT al.nombre as alumno, d.palabra, SUM(p.aciertos) as aciertos
                    FROM alumnos al 
                    JOIN progreso p ON p.id_alumno = al.id 
                    JOIN diccionario d ON p.id_signo = d.id 
                    WHERE al.id_tutor = $1
                    GROUP BY al.nombre, d.palabra
                `;
                const resDB = await pool.query(query, [id_usuario]);
                
                if (resDB.rows.length > 0) {
                    const datosFamilia = {};
                    resDB.rows.forEach(row => {
                        if (!datosFamilia[row.alumno]) datosFamilia[row.alumno] = [];
                        datosFamilia[row.alumno].push(`${row.palabra} (${row.aciertos} aciertos)`);
                    });
                    stats = { tipo: "informe_familia", resumen_hijos: datosFamilia };
                }
            }
        }

        const respuestaPython = await fetch('http://127.0.0.1:5001/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mensaje: mensaje, rol: rol, stats: stats })
        });

        if (!respuestaPython.ok) throw new Error("Fallo en Flask");

        const data = await respuestaPython.json();
        res.json({ respuesta: data.respuesta });

    } catch (error) {
        console.error("Error conectando con IA:", error);
        res.status(500).json({ error: 'La IA está dormida. Enciende ia_siju.py' });
    }
});

app.listen(port, () => {
    console.log(`🚀 SIJU funcionando en http://localhost:${port}`);
});