const express = require('express');
const { Pool } = require('pg');
const path = require('path');
const bcrypt = require('bcrypt');
const nodemailer = require('nodemailer');

const app = express();
const port = 3000;

const pool = new Pool({
  user: 'system',
  host: 'localhost',
  database: 'postgres',
  password: 'manager',
  port: 5432,
});

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'asanchezri.inf@upsa.es',
        pass: 'xkqf kwdj xiin dtrq'
    }
});

// Parches silenciosos de BD
pool.query(`
    ALTER TABLE progreso ADD COLUMN IF NOT EXISTS id_aula INTEGER;
    ALTER TABLE progreso ALTER COLUMN id_alumno DROP NOT NULL;
`).catch(() => {});

pool.query(`
    ALTER TABLE alumnos ADD COLUMN IF NOT EXISTS email_tutor VARCHAR(255);
`).catch(() => {});

app.use(express.json({ limit: '10mb' }));
app.use((req, res, next) => {
    if (req.path.endsWith('.html') || req.path === '/') {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
    }
    next();
});
app.use(express.static('public'));

// --- DICCIONARIO ---
app.get('/diccionario', async (req, res) => {
    try {
        const { edad, docente, alumno } = req.query; 
        let consulta = 'SELECT * FROM diccionario WHERE 1=1';
        let parametros = [];
        let contador = 1;

        if (edad) { consulta += ` AND edad = $${contador}`; parametros.push(parseInt(edad)); contador++; }

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
    if (!id_jugador || !id_signo || !tipo) return res.status(400).json({ error: 'Faltan datos' });

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

// --- ESTADÍSTICAS ---
app.get('/api/progreso-alumno/:id', async (req, res) => {
    try {
        const idJugador = req.params.id;
        const tipo = req.query.tipo || 'alumno'; 
        let query, params = [idJugador];

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

// --- LOGIN Y REGISTRO ---
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const resultado = await pool.query('SELECT id, nombre, rol, password FROM usuarios WHERE email = $1', [email]);
        if (resultado.rows.length > 0) {
            const usuario = resultado.rows[0];
            const contrasenaValida = await bcrypt.compare(password, usuario.password);
            if (contrasenaValida) {
                delete usuario.password;
                res.json({ success: true, usuario });
            } else {
                res.status(401).json({ success: false, mensaje: 'Usuario o contraseña incorrectos' });
            }
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
        if (existe.rows.length > 0) return res.status(400).json({ success: false, mensaje: 'Ese correo ya está registrado.' });
        const hashedPassword = await bcrypt.hash(password, 10);
        const resultado = await pool.query(
            'INSERT INTO usuarios (nombre, email, password, rol) VALUES ($1, $2, $3, $4) RETURNING id, nombre, rol',
            [nombre, email, hashedPassword, rol]
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
    const { palabra, edad, nivel, ruta_concepto, ruta_signo } = req.body;
    try {
        await pool.query(
            `UPDATE diccionario SET palabra = $1, edad = $2, nivel = $3, ruta_concepto = $4, ruta_signo = $5 WHERE id = $6`,
            [palabra, edad, nivel, ruta_concepto, ruta_signo, req.params.id]
        );
        res.json({ mensaje: 'Palabra actualizada' });
    } catch (error) { res.status(500).json({ error: 'Error al actualizar' }); }
});

app.delete('/api/admin/borrar-palabra/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM progreso WHERE id_signo = $1', [req.params.id]);
        await pool.query('DELETE FROM diccionario WHERE id = $1', [req.params.id]);
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
    try {
        const resultado = await pool.query(
            'SELECT id, nombre, edad, codigo_familia, email_tutor FROM alumnos WHERE id_aula = $1 ORDER BY nombre ASC',
            [req.params.id_aula]
        );
        res.json(resultado.rows);
    } catch (error) {
        console.error("Error obteniendo lista de alumnos:", error);
        res.status(500).json({ error: 'Error al consultar la base de datos' });
    }
});

// ELIMINAR AULA (y sus alumnos y progreso)
app.delete('/api/admin/eliminar-aula/:id', async (req, res) => {
    const idAula = req.params.id;
    try {
        await pool.query('DELETE FROM progreso WHERE id_aula = $1', [idAula]);
        await pool.query('DELETE FROM progreso WHERE id_alumno IN (SELECT id FROM alumnos WHERE id_aula = $1)', [idAula]);
        await pool.query('DELETE FROM alumnos WHERE id_aula = $1', [idAula]);
        await pool.query('DELETE FROM aulas WHERE id = $1', [idAula]);
        res.json({ mensaje: 'Clase eliminada' });
    } catch (error) {
        console.error("Error eliminando aula:", error);
        res.status(500).json({ error: 'Error al eliminar la clase' });
    }
});

// EDITAR ALUMNO (nombre + email tutor)
app.put('/api/admin/editar-alumno/:id', async (req, res) => {
    const { nombre, email_tutor } = req.body;
    try {
        await pool.query(
            `UPDATE alumnos SET nombre = $1, email_tutor = $2 WHERE id = $3`,
            [nombre, email_tutor || null, req.params.id]
        );
        res.json({ mensaje: 'Alumno actualizado' });
    } catch (error) {
        console.error("Error editando alumno:", error);
        res.status(500).json({ error: 'Error al actualizar' });
    }
});

// ELIMINAR ALUMNO
app.delete('/api/admin/eliminar-alumno/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM progreso WHERE id_alumno = $1', [req.params.id]);
        await pool.query('DELETE FROM alumnos WHERE id = $1', [req.params.id]);
        res.json({ mensaje: 'Alumno eliminado' });
    } catch (error) {
        console.error("Error eliminando alumno:", error);
        res.status(500).json({ error: 'Error al eliminar' });
    }
});

app.post('/api/familia/vincular-alumno', async (req, res) => {
    const { codigo, id_tutor } = req.body;
    try {
        const comprobacion = await pool.query('SELECT id, nombre, id_tutor FROM alumnos WHERE codigo_familia = $1', [codigo]);
        if (comprobacion.rows.length === 0) return res.status(404).json({ error: 'Código incorrecto o no existe' });
        const alumno = comprobacion.rows[0];
        if (alumno.id_tutor) return res.status(400).json({ error: 'Este perfil ya está vinculado a una familia' });
        await pool.query('UPDATE alumnos SET id_tutor = $1 WHERE codigo_familia = $2', [id_tutor, codigo]);
        res.json({ mensaje: `¡Perfil de ${alumno.nombre} vinculado con éxito!` });
    } catch (error) {
        console.error("Error al vincular:", error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// --- IA ---
app.post('/api/chat-ia', async (req, res) => {
    const { mensaje, rol, id_usuario } = req.body;
    let stats = null;

    try {
        if (id_usuario) {
            if (rol === 'docente') {
                const query = `
                    SELECT a.nombre as clase, COALESCE(al.nombre, 'Práctica General (Toda la clase)') as alumno, d.palabra, SUM(p.aciertos) as aciertos
                    FROM progreso p
                    JOIN diccionario d ON p.id_signo = d.id
                    LEFT JOIN alumnos al ON p.id_alumno = al.id
                    LEFT JOIN aulas a ON (p.id_aula = a.id OR al.id_aula = a.id)
                    WHERE a.id_profesor = $1
                    GROUP BY a.nombre, al.nombre, d.palabra
                `;
                const resDB = await pool.query(query, [id_usuario]);
                if (resDB.rows.length > 0) {
                    const datosAgrupados = {};
                    resDB.rows.forEach(row => {
                        const clase = row.clase || 'Clase Desconocida';
                        if (!datosAgrupados[clase]) datosAgrupados[clase] = {};
                        if (!datosAgrupados[clase][row.alumno]) datosAgrupados[clase][row.alumno] = [];
                        datosAgrupados[clase][row.alumno].push(`${row.palabra} (${row.aciertos} aciertos)`);
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
            body: JSON.stringify({ mensaje, rol, stats })
        });

        if (!respuestaPython.ok) throw new Error("Fallo en Flask");
        const data = await respuestaPython.json();
        res.json({ respuesta: data.respuesta });

    } catch (error) {
        console.error("Error conectando con IA:", error);
        res.status(500).json({ error: 'La IA está dormida. Enciende ia_siju.py' });
    }
});

// --- ENVÍO DE INFORME INDIVIDUAL (alumno → tutor) ---
app.post('/api/enviar-informe', async (req, res) => {
    const { pdf_base64, nombre_alumno, id_alumno, nombre_docente } = req.body;
    try {
        // Primero buscamos el email_tutor directo en alumnos
        const resAlumno = await pool.query(
            `SELECT a.email_tutor, u.email as email_usuario, u.nombre as nombre_tutor
             FROM alumnos a
             LEFT JOIN usuarios u ON a.id_tutor = u.id
             WHERE a.id = $1`,
            [id_alumno]
        );

        if (resAlumno.rows.length === 0) return res.status(404).json({ error: 'Alumno no encontrado.' });

        const fila = resAlumno.rows[0];
        const emailDestino = fila.email_tutor || fila.email_usuario;
        const nombreTutor = fila.nombre_tutor || 'Familia de ' + nombre_alumno;

        if (!emailDestino) {
            return res.status(404).json({ error: 'Este alumno no tiene email de tutor registrado. Edítalo en Gestionar Alumnos.' });
        }

        const fecha = new Date().toLocaleDateString('es-ES');
        const pdfBuffer = Buffer.from(pdf_base64, 'base64');

        await transporter.sendMail({
            from: '"SIJU · Signa Jugando" <asanchezri.inf@upsa.es>',
            to: emailDestino,
            subject: `Informe de progreso de ${nombre_alumno} – ${fecha}`,
            html: `
                <div style="font-family:Inter,sans-serif; max-width:600px; margin:auto; padding:30px; border:1px solid #eaeaea; border-radius:12px;">
                    <h2 style="color:#0056b3; margin-top:0;">SIJU · Informe de Progreso</h2>
                    <p>Hola <strong>${nombreTutor}</strong>,</p>
                    <p>Te enviamos el informe de progreso de <strong>${nombre_alumno}</strong>, generado el ${fecha} por ${nombre_docente}.</p>
                    <p>Encontrarás el informe completo adjunto con el análisis detallado de las actividades realizadas y recomendaciones personalizadas.</p>
                    <hr style="border:none; border-top:1px solid #eaeaea; margin:25px 0;">
                    <p style="color:#999; font-size:13px;">Mensaje enviado automáticamente desde la plataforma SIJU.</p>
                </div>
            `,
            attachments: [{
                filename: `Informe_${nombre_alumno}_${fecha}.pdf`,
                content: pdfBuffer,
                contentType: 'application/pdf'
            }]
        });

        res.json({ mensaje: `Informe enviado correctamente a ${emailDestino}` });
    } catch (error) {
        console.error("Error enviando email:", error);
        res.status(500).json({ error: 'Error al enviar el email: ' + error.message });
    }
});

// --- ENVÍO DE INFORME GENERAL (aula → todos los tutores) ---
app.post('/api/enviar-informe-aula', async (req, res) => {
    const { pdf_base64, nombre_aula, id_aula, nombre_docente } = req.body;
    try {
        const resAlumnos = await pool.query(
            `SELECT al.nombre as nombre_alumno,
                    COALESCE(al.email_tutor, u.email) as email,
                    COALESCE(u.nombre, 'Familia') as nombre_tutor
             FROM alumnos al
             LEFT JOIN usuarios u ON al.id_tutor = u.id
             WHERE al.id_aula = $1
             AND (al.email_tutor IS NOT NULL OR u.email IS NOT NULL)`,
            [id_aula]
        );

        if (resAlumnos.rows.length === 0) {
            return res.status(404).json({ error: 'No hay familias con email registrado en esta aula. Edita los alumnos para añadir emails.' });
        }

        const fecha = new Date().toLocaleDateString('es-ES');
        const pdfBuffer = Buffer.from(pdf_base64, 'base64');

        await Promise.all(resAlumnos.rows.map(fila =>
            transporter.sendMail({
                from: '"SIJU · Signa Jugando" <asanchezri.inf@upsa.es>',
                to: fila.email,
                subject: `Informe general del aula – ${nombre_aula} – ${fecha}`,
                html: `
                    <div style="font-family:Inter,sans-serif; max-width:600px; margin:auto; padding:30px; border:1px solid #eaeaea; border-radius:12px;">
                        <h2 style="color:#0056b3; margin-top:0;">SIJU · Informe General del Aula</h2>
                        <p>Hola <strong>${fila.nombre_tutor}</strong>,</p>
                        <p>Te enviamos el informe general del aula <strong>${nombre_aula}</strong>, generado el ${fecha} por ${nombre_docente}.</p>
                        <p>Encontrarás el informe adjunto con el análisis completo del progreso del grupo.</p>
                        <hr style="border:none; border-top:1px solid #eaeaea; margin:25px 0;">
                        <p style="color:#999; font-size:13px;">Mensaje enviado automáticamente desde la plataforma SIJU.</p>
                    </div>
                `,
                attachments: [{
                    filename: `Informe_Aula_${nombre_aula}_${fecha}.pdf`,
                    content: pdfBuffer,
                    contentType: 'application/pdf'
                }]
            })
        ));

        res.json({ mensaje: `Informe enviado a ${resAlumnos.rows.length} familia(s) del aula.` });
    } catch (error) {
        console.error("Error enviando emails del aula:", error);
        res.status(500).json({ error: 'Error al enviar los emails: ' + error.message });
    }
});

app.listen(port, () => {
    console.log(`🚀 SIJU funcionando en http://localhost:${port}`);
});