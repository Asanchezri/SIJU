from flask import Flask, request, jsonify
from flask_cors import CORS # IMPORTANTE: Añadido para que Node.js pueda conectarse sin error de seguridad
import time
import json
from llama_cpp import Llama
from sentence_transformers import SentenceTransformer
import chromadb

app = Flask(__name__)
# Habilitamos CORS para aceptar peticiones desde el localhost:3000
CORS(app)

print("1. Cargando base de conocimiento de SIJU...")
# Este modelo es ideal para español y muy ligero
embedder = SentenceTransformer('sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2')
chroma_client = chromadb.Client()
coleccion = chroma_client.create_collection(name="siju_docs")

# LEYENDO TU NUEVO ARCHIVO DE CONOCIMIENTO INTEGRAL (TXT)
try:
    with open("conocimiento_siju.txt", "r", encoding="utf-8") as f:
        texto_completo = f.read()

    # Separamos el texto por párrafos (doble salto de línea)
    parrafos = [p for p in texto_completo.split('\n\n') if len(p.strip()) > 20]
    
    for i, parrafo in enumerate(parrafos):
        coleccion.add(
            embeddings=[embedder.encode(parrafo).tolist()],
            documents=[parrafo],
            ids=[f"id_{i}"]
        )
    print(f"✅ Manual SIJU procesado: {len(parrafos)} bloques de conocimiento inyectados en la base vectorial.")
except Exception as e:
    print(f"⚠️ Atención: No se encontró conocimiento_siju.txt o hubo un error: {e}")

print("2. Despertando a la Bestia de SIJU (Llama 3.1 - 8B)...")
llm = Llama(
    model_path="Meta-Llama-3.1-8B-Instruct-Q4_K_M.gguf", # EL NUEVO CEREBRO DE META
    n_ctx=4096, # Contexto amplio para que quepa el RAG y las estadísticas
    n_gpu_layers=-1, 
    verbose=False
)

@app.route("/chat", methods=["POST"])
def chat():
    datos = request.json
    mensaje = datos.get("mensaje", "")
    rol = datos.get("rol", "familia") # Obtenemos el rol (docente o familia)
    stats = datos.get("stats", None)  # Obtenemos las estadísticas del alumno

    if not mensaje:
        return jsonify({"error": "Mensaje vacío"}), 400

    print(f"📩 Petición recibida de [{rol.upper()}]: {mensaje}")

    # 1. Buscamos contexto en ChromaDB (RAG)
    resultados = coleccion.query(query_embeddings=[embedder.encode(mensaje).tolist()], n_results=3)
    
    contexto = ""
    if resultados['documents'] and len(resultados['documents'][0]) > 0:
        # Unimos los 3 mejores párrafos encontrados
        contexto = "\n---\n".join(resultados['documents'][0])
    
    # 2. CONSTRUIMOS EL PROMPT DE SISTEMA SEGÚN EL ROL
    if rol == "docente":
        prompt_sistema = """Eres el asesor pedagógico de SIJU para docentes. Tono: profesional y resolutivo. 
        REGLAS DE FORMATO Y COMPORTAMIENTO:
        1. NUNCA te presentes al empezar a hablar ni digas tu rol. Ve directo al grano y a la respuesta.
        2. Usa párrafos MUY cortos (máximo 2 o 3 líneas).
        3. Usa listas con viñetas (-) para separar puntos clave.
        4. Usa emojis sutiles para estructurar (📊, 📚, 💡).
        REGLA DE ORO: Basate SIEMPRE y ÚNICAMENTE en la información del manual proporcionado. No inventes signos."""
    else:
        prompt_sistema = """Eres el guía de SIJU para familias. Tono: cálido, natural y cercano.
        REGLAS DE FORMATO Y COMPORTAMIENTO:
        1. NUNCA te presentes diciendo "Soy el asistente empático" ni repitas el mismo saludo. Actúa como un humano en una conversación continua. Empieza respondiendo directamente.
        2. Usa párrafos MUY cortos para no cansar al lector.
        3. Si das ejemplos o consejos, usa listas con viñetas.
        4. Usa bastantes emojis amigables y divertidos (✨, 👋, 👶, 👐).
        REGLA DE ORO: Basate SIEMPRE y ÚNICAMENTE en la información del manual proporcionado. NUNCA inventes signos que no estén en el texto."""

    # Inyectamos el contexto encontrado
    prompt_sistema += f"\n\nINFORMACIÓN DEL MANUAL DE SIJU (USAR LITERALMENTE):\n{contexto}"

    # Si se han enviado estadísticas, las inyectamos
    if stats:
        prompt_sistema += f"\n\nDATOS ESTADÍSTICOS DEL ALUMNO A ANALIZAR:\n{json.dumps(stats, ensure_ascii=False)}"

    # 3. ENSAMBLAMOS EL FORMATO EXACTO PARA LLAMA 3.1
    prompt = f"<|begin_of_text|><|start_header_id|>system<|end_header_id|>\n\n{prompt_sistema}<|eot_id|><|start_header_id|>user<|end_header_id|>\n\n{mensaje}<|eot_id|><|start_header_id|>assistant<|end_header_id|>\n\n"
    
    try:
        # 🔥 LA MAGIA ESTÁ AQUÍ: LOS PARÁMETROS DEL NUEVO CEREBRO 🔥
        salida = llm(
            prompt, 
            max_tokens=600, 
            stop=["<|eot_id|>", "<|end_of_text|>"], # Token oficial de parada de Llama 3
            temperature=0.35,      # Inteligente pero seguro
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