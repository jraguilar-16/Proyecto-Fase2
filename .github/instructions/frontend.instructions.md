---
name: 'Frontend del chat'
description: 'Usar al crear o modificar la interfaz web del chatbot.'
applyTo: 'public/**'
---
# Reglas del frontend
* Solo HTML, CSS y JavaScript vanilla (ES2020+). Sin frameworks ni CDNs.
* Inserta el texto del bot con `textContent`, nunca con `innerHTML` (evita XSS).
* Guarda el `conversation_id` en una variable de JS; se reinicia al recargar.
* Deshabilita el botón de enviar mientras espera respuesta y muestra "Escribiendo…".
* Diseño responsivo: debe verse bien a 360 px de ancho.
* Usa variables CSS en `:root` para colores y soporta `prefers-color-scheme: light`.
* Permite adjuntar un PDF/JPG/PNG de hasta 10 MB y enviar el formulario como `multipart/form-data`; el texto puede omitirse si hay un archivo.
* Muestra el nombre del archivo seleccionado y permite quitarlo antes de enviarlo.