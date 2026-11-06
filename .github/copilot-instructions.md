# Instrucciones del proyecto: Chatbot Foundry Validacion-Facturas en App Service

## Qué es este proyecto
Página web de una sola vista con un chatbot con IA para la fase 2 del curso de IA con Microsoft. El frontend (HTML, CSS y JS sin frameworks) llama a un backend node.js con Express y el backend conversa con un agente de Microsoft Foundry. Se despliega en Azure App Services (Linux, Node 24 LTS).

## Entorno de desarrollo
- Windows 11 con PowerShell 7.
- Node.js 24 y npm. Nada de TypeScript ni builders.

## Stack y versiones
- Express 5, ES Modules ("type": "module"), 'async/await'.
- SDK de Foundry: '@azure/ai-projects' 2.x (API "Foundry projects (new)").
No uses '@azure/ai-agents' ni la API 1.x.
- Autenticación: 'DefaultAzureCredential' de '@azure/identity'.
- Variables de entorno en local con 'node--env-file-if-exists=.env' (sin dotenv).

## Arquitectura (no la cambies sin preguntar)
- 'server.js': sirve 'public/' en '/', expone 'POST /api/chat', 'POST /api/chat/cleanup', 'GET /health' y 'GET /api/health'.
- El navegador NUNCA habla directo con Foundry, solo con el backend.
- Conversación multi-turno: 'openai.conversations.create()' y
- 'openai.responses.create({ conversation, input }, agentRef)' donde
'agentRef = { body: { agent_reference: { name, type: "agent_reference" } } }'.
- 'POST /api/chat' acepta JSON para mensajes de texto o multipart/form-data con texto opcional y un archivo. El 'conversation_id' viaja entre frontend y backend.
- El servidor escucha en 'process.env.PORT' (App Service lo define).

# Seguridad
- Nunca escribas llaves, tokens ni endpoints reales en el código.
Todo sale de variables de entorno: `FOUNDRY_PROJECT_ENDPOINT`, `FOUNDRY_AGENT_NAME`.
- En Azure se usa identidad administrada (managed identity), no API keys.
- Valida mensajes de 1 a 2000 caracteres; puede omitirse el texto si se adjunta un archivo PDF/JPG/PNG de hasta 10 MB.
- Acepta como máximo un archivo por mensaje; valida extensión, tipo MIME y firma del contenido.
- Sube archivos a Foundry solo desde el backend y programa limpieza de 24 horas en el servidor; el seguimiento en memoria es best-effort.
- Si Foundry falla, responde 502 con un mensaje genérico; no filtres trazas.
## Estilo de código
- Comentarios en español neutro; nombres de variables en inglés.
- Cambios mínimos y enfocados: no reescribas archivos completos si basta editar.
## Cómo validar
- Local: `npm run dev` y abrir http://localhost:3000
- Salud: `Invoke-RestMethod http://localhost:3000/health` debe devolver `status: ok`
- Antes de desplegar, confirma que `package.json` incluye todo lo que se importa y que el script `start` es `node server.js`.