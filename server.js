import path from "node:path";
import express from "express";
import multer from "multer";
import { AIProjectClient } from "@azure/ai-projects";
import { DefaultAzureCredential } from "@azure/identity";

const app = express();
const port = Number(process.env.PORT) || 3000;
const agentName = process.env.FOUNDRY_AGENT_NAME;
const projectEndpoint = process.env.FOUNDRY_PROJECT_ENDPOINT;
const publicDirectory = path.join(import.meta.dirname, "public");
const foundryConfigured = Boolean(agentName && projectEndpoint);
const maxFileSize = 10 * 1024 * 1024;
const fileRetentionSeconds = 24 * 60 * 60;
const allowedFiles = new Map([
  [".pdf", "application/pdf"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".png", "image/png"],
]);
const conversationFiles = new Map();

let openAIClient;

class UploadValidationError extends Error {}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: maxFileSize,
    files: 1,
    fields: 2,
    fieldNameSize: 64,
    fieldSize: 8192,
  },
  fileFilter: (_request, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    if (allowedFiles.get(extension) !== file.mimetype) {
      callback(new UploadValidationError("Adjunta un archivo PDF, JPG o PNG válido."));
      return;
    }

    callback(null, true);
  },
});

function logFoundryFailure(error) {
  const message = error instanceof Error ? error.message : "Unknown Foundry error.";
  const safeMessage = message
    .replaceAll(projectEndpoint ?? "", "[project endpoint]")
    .replaceAll(agentName ?? "", "[agent name]")
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[token redacted]")
    .slice(0, 500);

  console.error("Foundry request failed", {
    name: error?.name,
    code: error?.code,
    statusCode: error?.statusCode ?? error?.status,
    message: safeMessage,
  });
}

function getErrorStatus(error) {
  return error?.statusCode ?? error?.status ?? error?.response?.status;
}

function logCleanupFailure(error, fileId) {
  console.error("No se pudo limpiar un archivo de Foundry.", {
    fileId,
    name: error?.name,
    code: error?.code,
    statusCode: getErrorStatus(error),
  });
}

function isValidFileSignature(file) {
  if (file.mimetype === "application/pdf") {
    return file.buffer.subarray(0, 5).toString("ascii") === "%PDF-";
  }

  if (file.mimetype === "image/png") {
    return file.buffer.subarray(0, 8).equals(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
  }

  if (file.mimetype === "image/jpeg") {
    return file.buffer.length >= 3
      && file.buffer[0] === 0xff
      && file.buffer[1] === 0xd8
      && file.buffer[2] === 0xff;
  }

  return false;
}

function getSafeFilename(originalName) {
  const basename = path.basename(originalName).replace(/[^A-Za-z0-9._-]/g, "_");
  return basename.slice(-120) || "invoice";
}

function trackConversationFile(conversationId, fileId) {
  const files = conversationFiles.get(conversationId) ?? [];
  files.push({ id: fileId, expiresAt: Date.now() + fileRetentionSeconds * 1000 });
  conversationFiles.set(conversationId, files);
}

async function cleanupExpiredFiles() {
  if (!openAIClient) {
    return;
  }

  const now = Date.now();
  for (const [conversationId, files] of conversationFiles) {
    const remainingFiles = [];
    for (const file of files) {
      if (file.expiresAt > now) {
        remainingFiles.push(file);
        continue;
      }

      try {
        await openAIClient.files.delete(file.id);
      } catch (error) {
        if (getErrorStatus(error) !== 404) {
          logCleanupFailure(error, file.id);
          remainingFiles.push(file);
        }
      }
    }

    if (remainingFiles.length) {
      conversationFiles.set(conversationId, remainingFiles);
    } else {
      conversationFiles.delete(conversationId);
    }
  }
}

if (foundryConfigured) {
  const projectClient = new AIProjectClient(
    projectEndpoint,
    new DefaultAzureCredential(),
  );
  openAIClient = projectClient.getOpenAIClient();
  const cleanupInterval = setInterval(() => {
    cleanupExpiredFiles().catch((error) => {
      console.error("Falló la limpieza programada de archivos de Foundry.", {
        name: error?.name,
        code: error?.code,
      });
    });
  }, 15 * 60 * 1000);
  cleanupInterval.unref();
}

app.use(express.json({ limit: "16kb" }));
app.use(express.static(publicDirectory));

const healthHandler = (_request, response) => {
  response.json({ status: "ok" });
};

app.get("/health", healthHandler);
app.get("/api/health", healthHandler);

app.post("/api/chat", upload.single("file"), async (request, response) => {
  const message = typeof request.body?.message === "string"
    ? request.body.message.trim()
    : "";

  if ((!message && !request.file) || message.length > 2000) {
    response.status(422).json({ error: "El mensaje debe tener entre 1 y 2000 caracteres." });
    return;
  }

  if (request.file && !isValidFileSignature(request.file)) {
    response.status(422).json({ error: "El contenido no coincide con un PDF, JPG o PNG válido." });
    return;
  }

  const suppliedConversationId = request.body?.conversation_id;
  if (suppliedConversationId != null && typeof suppliedConversationId !== "string") {
    response.status(422).json({ error: "El identificador de conversación no es válido." });
    return;
  }

  if (!openAIClient) {
    response.status(502).json({ error: "No fue posible procesar la solicitud de chat." });
    return;
  }

  try {
    const conversationId = suppliedConversationId?.trim()
      || (await openAIClient.conversations.create()).id;
    let input = message;

    if (request.file) {
      const file = await openAIClient.files.create({
        file: new File(
          [request.file.buffer],
          getSafeFilename(request.file.originalname),
          { type: request.file.mimetype },
        ),
        purpose: "assistants",
      });

      trackConversationFile(conversationId, file.id);
      const text = message || "Revisa este archivo de factura y resume los datos principales, importes y posibles inconsistencias.";
      const fileInput = request.file.mimetype === "application/pdf"
        ? { type: "input_file", file_id: file.id }
        : { type: "input_image", file_id: file.id, detail: "auto" };

      input = [{
        role: "user",
        content: [
          { type: "input_text", text },
          fileInput,
        ],
      }];
    }

    const result = await openAIClient.responses.create(
      {
        conversation: conversationId,
        input,
      },
      {
        body: {
          agent_reference: { name: agentName, type: "agent_reference" },
        },
      },
    );

    response.json({
      reply: result.output_text,
      conversation_id: conversationId,
    });
  } catch (error) {
    logFoundryFailure(error);
    response.status(502).json({ error: "No fue posible procesar la solicitud de chat." });
  }
});

app.post("/api/chat/cleanup", async (request, response) => {
  const conversationId = request.body?.conversation_id;
  if (typeof conversationId !== "string" || !conversationId.trim()) {
    response.status(422).json({ error: "El identificador de conversación no es válido." });
    return;
  }

  const trackedFiles = conversationFiles.get(conversationId) ?? [];
  const failedFiles = [];
  for (const file of trackedFiles) {
    try {
      await openAIClient.files.delete(file.id);
    } catch (error) {
      if (getErrorStatus(error) !== 404) {
        logCleanupFailure(error, file.id);
        failedFiles.push(file);
      }
    }
  }

  if (failedFiles.length) {
    conversationFiles.set(conversationId, failedFiles);
    response.status(502).json({ error: "No se pudieron limpiar todos los archivos de la conversación." });
    return;
  }

  conversationFiles.delete(conversationId);
  response.json({ status: "ok" });
});

app.use((error, _request, response, _next) => {
  if (error instanceof SyntaxError && "body" in error) {
    response.status(400).json({ error: "El cuerpo de la solicitud no contiene JSON válido." });
    return;
  }

  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      response.status(413).json({ error: "El archivo supera el límite de 10 MB." });
      return;
    }

    response.status(422).json({ error: "Solo se permite un archivo PDF, JPG o PNG por mensaje." });
    return;
  }

  if (error instanceof UploadValidationError) {
    response.status(422).json({ error: error.message });
    return;
  }

  if (error?.type === "entity.too.large") {
    response.status(413).json({ error: "El cuerpo de la solicitud es demasiado grande." });
    return;
  }

  console.error("Error al procesar la solicitud", {
    name: error?.name,
    code: error?.code,
  });
  response.status(500).json({ error: "Ocurrió un error interno." });
});

app.listen(port, () => {
  console.log(`Servidor escuchando en el puerto ${port}.`);
});