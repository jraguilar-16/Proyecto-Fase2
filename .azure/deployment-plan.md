# Plan de despliegue: Validador de facturas

> **Estado:** Deployed

## 1. Objetivo y alcance

Desplegar el chatbot existente en la instancia de Azure App Service que ya corresponde al proyecto. No se crearán ni eliminarán grupos, planes ni sitios.

## 2. Requisitos y contexto de Azure

| Atributo | Valor |
|---|---|
| Clasificación | POC/proyecto de curso (confirmado) |
| Escala | Pequeña, menos de 1,000 usuarios (confirmada) |
| Presupuesto | Reutilizar el plan B1 existente; no crear capacidad de cómputo adicional (confirmado) |
| Suscripción | Azure for Students (`ae68cb76-cc0d-4c4e-b097-96fc51f450aa`), confirmada |
| Región del App Service | West US (`westus`), confirmada |
| Grupo del App Service | `Proyecto-Fase2`, ya existe; sus metadatos están en Central US |
| Grupo de Foundry | `rg-jraguilarmontes-ia-7847` |
| Cumplimiento/residencia | Sin requisitos adicionales conocidos (confirmado) |

El App Service y su plan ya están ubicados en West US; la ubicación Central US del grupo de recursos no cambia la ubicación de los recursos existentes.

**Aprobación:** El usuario aprobó actualizar el sitio existente, reemplazar el contenido publicado y realizar los cambios de identidad, RBAC y configuración enumerados en este plan.

## 3. Componentes detectados

| Componente | Tecnología | Ubicación |
|---|---|---|
| Chat web y API | Node.js 24 LTS, Express 5, HTML/CSS/JavaScript | `server.js`, `public/` |
| App Service existente | Linux, `NODE|24-lts`, plan Basic B1, una instancia | `Agente-Validador-Facturas` |
| Proyecto Foundry existente | Proyecto `jraguilarmontes-ia-5710` | Recurso `jraguilarmontes-ia-5710-resource` |
| Agente | Agente prompt habilitado `Agente-Validacion-Facturas` | Proyecto Foundry existente |

## 4. Receta

**Seleccionada:** Azure CLI para actualizar recursos existentes y desplegar el paquete ZIP.

**Motivo:** El sitio y el plan solicitados ya existen. No se requiere generar infraestructura nueva ni cambiar de SKU.

## 5. Arquitectura y cambios propuestos

1. Reutilizar `Agente-Validador-Facturas` y `ASP-ProyectoFase2-ac48` (Linux B1, `westus`).
2. Activar la identidad administrada asignada por el sistema del sitio.
3. Asignar el rol integrado **Foundry User** a esa identidad en el ámbito del proyecto Foundry, para limitar el permiso al proyecto.
4. Configurar `FOUNDRY_PROJECT_ENDPOINT`, `FOUNDRY_AGENT_NAME` y `NODE_ENV=production` como App Settings; el endpoint y el nombre se obtuvieron localmente y no se guardarán aquí. No se configurarán claves.
5. Habilitar Always On en el plan B1 para mantener activo el proceso del servidor.
6. Desplegar el código como ZIP excluyendo `.env`; utilizar las dependencias de producción del `package-lock.json`.
7. Verificar `GET /health`, rechazo 422 para mensaje vacío y una interacción seguida por otra conservando `conversation_id`.

El ZIP reemplaza el contenido actualmente publicado en el sitio. No se cambiarán el SKU, el número de instancias, la región ni el grupo de recursos. El gasto recurrente del plan B1 ya existente continuará; este plan no crea recursos de cómputo facturables adicionales.

## 6. Políticas, capacidad y permisos

### Políticas

- La asignación de política `Allowed resource deployment regions` permite `westus`.
- La política de grupo de administración bloquea West Europe, que no es el destino solicitado.
- Hay políticas de MFA para acciones de escritura de recursos; las operaciones de escritura deberán cumplirlas.

### Inventario y límites

| Tipo de recurso | Nuevos recursos | Existentes relevantes | Límite/capacidad |
|---|---:|---|---|
| `Microsoft.Web/sites` | 0 | 1 sitio, en ejecución, `westus` | No se solicita nueva asignación de cuota |
| `Microsoft.Web/serverFarms` | 0 | 1 plan Basic B1, una instancia, `westus` | No se solicita nuevo plan ni cambio de SKU |
| `Microsoft.CognitiveServices/accounts/projects` | 0 | Cuenta y proyecto existentes, Central US | Sin cambios |
| `Microsoft.Authorization/roleAssignments` | 1 asignación propuesta | No se encontró una asignación directa en el ámbito de la cuenta/proyecto | RBAC, no consume cuota regional de recursos |

West US está disponible para App Service y figura entre las regiones permitidas por la política. Como no se crea ni escala ningún recurso regional, la cuota de aprovisionamiento no es aplicable a este cambio.

### Estado observado antes de desplegar

- El sitio existente está en ejecución; no se encontraron los App Settings `FOUNDRY_PROJECT_ENDPOINT` ni `FOUNDRY_AGENT_NAME`.
- No se observó una identidad administrada asignada al sitio.
- No se encontró una asignación directa de `Foundry User` en el ámbito de la cuenta o del proyecto Foundry.
- El agente prompt existente está habilitado.

## 7. Validation Proof — criterios de aceptación y evidencia

**Resultado:** Validated; todas las comprobaciones aplicables pasaron. **Fecha UTC:** `2026-11-06T04:12:38Z`.

**Pruebas posteriores realizadas:**

- `https://agente-validador-facturas-fjdgdzfeapg8btcf.westus-01.azurewebsites.net/health` responde HTTP 200 con `{"status":"ok"}`.
- Un mensaje vacío a `POST /api/chat` responde HTTP 422.
- Una pregunta y su seguimiento reciben respuesta usando la misma conversación.
- La identidad del App Service tiene `Foundry User` en el ámbito del proyecto Foundry.
- Se configuraron los App Settings requeridos sin API keys; sus valores no se imprimieron.

La aplicación mantiene el rastreo de retención de archivos en memoria; los reinicios del proceso pueden afectar la limpieza best-effort. No se cambia ese comportamiento en este despliegue.

| Comprobación | Evidencia | Resultado |
|---|---|---|
| Sesión Azure | `az account show --query "{id:id,name:name}" -o json` | Azure for Students; ID coincide con la suscripción confirmada |
| Sitio y plan | `az webapp show` y `az appservice plan show` para el destino aprobado | Running, West US, Linux, Basic B1, una instancia |
| Runtime | `az webapp config show --query "{linuxFxVersion:linuxFxVersion,alwaysOn:alwaysOn}" -o json` (antes del despliegue) | `NODE|24-lts`; Always On estaba desactivado y se habilitó durante el despliegue |
| Rol | `az role definition list --name "Foundry User"` | Rol encontrado; GUID `53ca6127-db72-4b80-b1b0-d745d6d5456d`; asignable a `/` |
| Sintaxis/dependencias | `node --check` para los tres archivos JS y `npm ls --depth=0` | Correcto; dependencias directas presentes |
| Salud local | `Invoke-RestMethod http://localhost:3000/health` | `{"status":"ok"}` |
| Conversación local | Dos solicitudes `POST /api/chat` con el `conversation_id` anterior | Ambas respondieron `listo`; mismo identificador |
| Validación de entrada | `POST /api/chat` con `message=""` | HTTP 422 |
| Política/ubicación | Política de regiones y disponibilidad de `Microsoft.Web/sites`/`serverFarms` | West US permitido y disponible |
| Infraestructura Bicep | No se crea infraestructura ni cambia el SKU/ubicación | No aplicable; no se ejecutó compilación ni what-if |

## 8. Preparación completada

- Análisis del proyecto y configuración actual: completado.
- Requisitos, suscripción, ubicación y alcance: confirmados por el usuario.
- Investigación de App Service, Foundry, políticas y capacidad: completada.
- Infraestructura: no se genera; se reutilizan el sitio y el plan existentes.
- Funcionalidad local: verificada.
  - `node --check` para `server.js`, `scripts/create-agent.js` y `public/app.js`: correcto.
  - `npm ls --depth=0`: todas las dependencias directas presentes.
  - `GET http://localhost:3000/health`: `{"status":"ok"}`.
  - Chat de dos turnos: ambos turnos respondieron `listo` y conservaron el mismo `conversation_id`.
  - Mensaje vacío: HTTP 422.
- Lista predespliegue: suscripción, ubicación, grupo existente y recurso objetivo verificados; pasos exclusivos de AZD omitidos porque no hay `azure.yaml` y la receta seleccionada es CLI directa.
- Cambios en Azure: completados y verificados.

## All validation checks pass

### Comprobaciones definidas para esta actualización in-place

1. **CLI, sesión y destino:** la CLI está instalada; la sesión corresponde a la suscripción confirmada; el sitio y el plan existentes pertenecen al grupo esperado y están en West US.
2. **Aplicación:** sintaxis de Node validada; dependencias directas presentes; `/health` devuelve `ok`; una conversación de dos turnos conserva su identificador; el mensaje vacío devuelve 422.
3. **Política y capacidad:** West US está permitido y disponible; no se crean ni escalan recursos, por lo que no se consume cuota regional adicional.
4. **RBAC:** la definición integrada `Foundry User` existe, acepta ámbito `/`, y el ámbito propuesto se limita al proyecto Foundry. El código usa `DefaultAzureCredential` y referencia el agente existente.
5. **Infraestructura como código:** compilación Bicep y what-if no aplican porque esta ejecución no crea ni actualiza recursos mediante una plantilla; se reutilizan el sitio y plan existentes y se configuran mediante App Service CLI.

## 9. Registro de ejecución y verificación

**Completado:** `2026-11-06T04:28:32Z`.

- Sitio: `Agente-Validador-Facturas`, Running, West US, Node `24-lts`, plan B1 sin cambio de SKU.
- Identidad administrada del sistema activa: principal `06c08db8-d0b5-4c6a-b934-379f374efaad`.
- RBAC: `Foundry User` asignado al principal anterior en el proyecto `jraguilarmontes-ia-5710`; assignment `f9135af3-654f-41cc-a0c7-aa790cdad07f`.
- App Settings configurados: `FOUNDRY_PROJECT_ENDPOINT`, `FOUNDRY_AGENT_NAME`, `NODE_ENV` y `SCM_DO_BUILD_DURING_DEPLOYMENT`. Solo se verificaron los nombres, no se imprimieron valores.
- Always On: habilitado.
- ZIP Deploy: completado con `RuntimeSuccessful`, 1 instancia correcta, 0 fallidas; deployment `402700cb-ffbb-4e2b-8f9a-806d8c3923fc`. El paquete excluyó `.env`, `.azure/` y `node_modules/`.
- Salud remota: `GET /health` devolvió HTTP 200 y `{"status":"ok"}`.
- Chat remoto: dos turnos devolvieron `listo` y conservaron el mismo `conversation_id`, confirmando acceso de la identidad administrada a Foundry.
- Entrada inválida remota: mensaje vacío devolvió HTTP 422.
- UI remota: cargó el chatbot y mostró el botón para adjuntar archivos.
- URL: `https://agente-validador-facturas-fjdgdzfeapg8btcf.westus-01.azurewebsites.net/`.
