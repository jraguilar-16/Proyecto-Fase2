---
name: 'Backend Express'
description: 'Usar al crear o modificar el backend Node.js que llama a Microsoft Foundry.'
applyTo: 'server.js,scripts/**'
---
# Reglas del backend
* Crea el `AIProjectClient` y el cliente de OpenAI una sola vez al iniciar, no en cada request.
* Referencia al agente en cada `responses.create` con
 `{ body: { agent_reference: { name: AGENT_NAME, type: "agent_reference" } } }`.
* Usa `async/await` y envuelve las llamadas al SDK en `try/catch` → 502 genérico.
* Resuelve rutas de archivos con `import.meta.dirname`, no con el directorio actual.
* No agregues dependencias nuevas sin mencionarlas en el plan.
* Para adjuntos, limita la carga a un PDF/JPG/PNG de hasta 10 MB, valida extensión, MIME y firma; sube el archivo a Foundry solo desde el backend.
* Programa la limpieza de archivos tras 24 horas y al iniciar una conversación nueva; el seguimiento en memoria es best-effort, no almacenamiento durable.