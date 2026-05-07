from flask import Flask, request, jsonify
from flask_cors import CORS
import json
from llama_cpp import Llama
from sentence_transformers import SentenceTransformer
import chromadb

app = Flask(__name__)
CORS(app)

print("1. Cargando base de conocimiento de SIJU...")
embedder = SentenceTransformer('sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2')
chroma_client = chromadb.Client()
coleccion = chroma_client.create_collection(name="siju_docs")

try:
    with open("conocimiento_siju.txt", "r", encoding="utf-8") as f:
        texto_completo = f.read()

    parrafos = [p for p in texto_completo.split('\n\n') if len(p.strip()) > 20]
    
    for i, parrafo in enumerate(parrafos):
        coleccion.add(
            embeddings=[embedder.encode(parrafo).tolist()],
            documents=[parrafo],
            ids=[f"id_{i}"]
        )
    print(f"✅ Manual SIJU procesado: {len(parrafos)} bloques de conocimiento inyectados.")
except Exception as e:
    print(f"⚠️ No se encontró conocimiento_siju.txt o hubo un error: {e}")

print("2. Cargando modelo Llama 3.1...")
llm = Llama(
    model_path="Meta-Llama-3.1-8B-Instruct-Q4_K_M.gguf",
    n_ctx=4096,
    n_gpu_layers=-1,
    verbose=False
)

@app.route("/chat", methods=["POST"])
def chat():
    datos = request.json
    mensaje = datos.get("mensaje", "")
    rol = datos.get("rol", "familia")
    stats = datos.get("stats", None)

    if not mensaje:
        return jsonify({"error": "Mensaje vacío"}), 400

    print(f"📩 Petición recibida de [{rol.upper()}]: {mensaje}")

    resultados = coleccion.query(query_embeddings=[embedder.encode(mensaje).tolist()], n_results=3)
    
    contexto = ""
    if resultados['documents'] and len(resultados['documents'][0]) > 0:
        contexto = "\n---\n".join(resultados['documents'][0])

    if rol == "docente":
        prompt_sistema = """Eres el asesor pedagógico de SIJU para docentes. Tono: profesional y resolutivo.
        REGLAS DE FORMATO Y COMPORTAMIENTO:
        1. NUNCA te presentes ni digas tu rol. Ve directo a la respuesta.
        2. Usa párrafos MUY cortos (máximo 2 o 3 líneas).
        3. Usa listas con viñetas (-) para separar puntos clave.
        4. Usa emojis sutiles para estructurar (📊, 📚, 💡).
        REGLA DE ORO: Basate SIEMPRE y ÚNICAMENTE en los datos estadísticos proporcionados.
        PROHIBIDO ABSOLUTO: No inventes nombres de alumnos bajo ningún concepto. Si en los datos no aparece ningún alumno individual con nombre, habla ÚNICAMENTE de la práctica general del aula. No menciones a 'Juan', 'Lucía' ni ningún nombre que no esté literalmente en los datos recibidos. Si no hay alumnos matriculados individualmente, indícalo de forma clara y habla solo del rendimiento colectivo del aula."""
    else:
        prompt_sistema = """Eres el guía de SIJU para familias. Tono: cálido, natural y cercano.
        REGLAS DE FORMATO Y COMPORTAMIENTO:
        1. NUNCA te presentes. Actúa como un humano en conversación continua. Empieza respondiendo directamente.
        2. Usa párrafos MUY cortos para no cansar al lector.
        3. Si das ejemplos o consejos, usa listas con viñetas.
        4. Usa emojis amigables (✨, 👋, 👶, 👐).
        REGLA DE ORO: Basate SIEMPRE y ÚNICAMENTE en la información del manual proporcionado. NUNCA inventes signos que no estén en el texto."""

    prompt_sistema += f"\n\nINFORMACIÓN DEL MANUAL DE SIJU:\n{contexto}"

    if stats:
        prompt_sistema += f"\n\nDATOS REALES DEL SISTEMA (RESPETA EXACTAMENTE ESTOS DATOS, NO AÑADAS NI INVENTES NADA):\n{json.dumps(stats, ensure_ascii=False)}"
        prompt_sistema += "\n\nADVERTENCIA CRÍTICA: Si en los datos anteriores no aparece ningún alumno con nombre propio, es porque no hay alumnos matriculados individualmente. En ese caso habla SOLO de la práctica general del aula. NUNCA inventes nombres de alumnos."

    prompt = f"<|begin_of_text|><|start_header_id|>system<|end_header_id|>\n\n{prompt_sistema}<|eot_id|><|start_header_id|>user<|end_header_id|>\n\n{mensaje}<|eot_id|><|start_header_id|>assistant<|end_header_id|>\n\n"
    
    try:
        salida = llm(
            prompt,
            max_tokens=600,
            stop=["<|eot_id|>", "<|end_of_text|>"],
            temperature=0.35,
            top_p=0.85,
            repeat_penalty=1.1,
            echo=False
        )
        respuesta = salida['choices'][0]['text'].strip()
        return jsonify({"respuesta": respuesta})
    
    except Exception as e:
        print(f"❌ Error interno del LLM: {e}")
        return jsonify({"error": "Hubo un cortocircuito en mis redes neuronales. Inténtalo de nuevo."}), 500

if __name__ == "__main__":
    print("3. ¡Microservicio IA de SIJU listo! Escuchando en el puerto 5001...")
    app.run(port=5001)