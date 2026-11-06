const chatForm = document.querySelector("#chat-form");
const messageInput = document.querySelector("#message-input");
const messageList = document.querySelector("#message-list");
const sendButton = document.querySelector("#send-button");
const statusMessage = document.querySelector("#status-message");
const fileInput = document.querySelector("#file-input");
const attachButton = document.querySelector("#attach-button");
const selectedFileElement = document.querySelector("#selected-file");
const selectedFileName = document.querySelector("#selected-file-name");
const removeFileButton = document.querySelector("#remove-file-button");
const newChatButton = document.querySelector("#new-chat-button");
const maxFileSize = 10 * 1024 * 1024;
const allowedExtensions = new Set([".pdf", ".jpg", ".jpeg", ".png"]);

let conversationId = null;
let isWaiting = false;
let selectedFile = null;

function updateSendButton() {
  sendButton.disabled = isWaiting || (!messageInput.value.trim() && !selectedFile);
  attachButton.disabled = isWaiting;
  removeFileButton.disabled = isWaiting;
  newChatButton.disabled = isWaiting;
}

function addMessage(text, role, extraClass = "", attachmentName = "") {
  const message = document.createElement("div");
  message.className = `message message-${role}${extraClass ? ` ${extraClass}` : ""}`;
  const paragraph = document.createElement("p");
  paragraph.textContent = text;
  message.append(paragraph);
  if (attachmentName) {
    const attachment = document.createElement("span");
    attachment.className = "message-attachment";
    attachment.textContent = `Adjunto: ${attachmentName}`;
    message.append(attachment);
  }
  messageList.append(message);
  messageList.scrollTop = messageList.scrollHeight;
  return message;
}

function updateSelectedFile(file) {
  selectedFile = file;
  fileInput.value = "";
  selectedFileElement.hidden = !file;
  selectedFileName.textContent = file?.name ?? "";
  updateSendButton();
}

function resetConversationView() {
  conversationId = null;
  messageList.replaceChildren();
  addMessage(
    "Hola, soy tu asistente de validación de facturas. Cuéntame qué necesitas revisar.",
    "assistant",
  );
  messageInput.value = "";
  updateSelectedFile(null);
  statusMessage.textContent = "";
}

messageInput.addEventListener("input", updateSendButton);

attachButton.addEventListener("click", () => {
  if (!isWaiting) {
    fileInput.click();
  }
});

fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  if (!file) {
    return;
  }

  const extension = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
  if (!allowedExtensions.has(extension)) {
    statusMessage.textContent = "Selecciona un archivo PDF, JPG o PNG.";
    updateSelectedFile(null);
    return;
  }

  if (file.size > maxFileSize) {
    statusMessage.textContent = "El archivo supera el límite de 10 MB.";
    updateSelectedFile(null);
    return;
  }

  updateSelectedFile(file);
  statusMessage.textContent = "";
});

removeFileButton.addEventListener("click", () => {
  updateSelectedFile(null);
  statusMessage.textContent = "";
});

messageInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    if (!sendButton.disabled) {
      chatForm.requestSubmit();
    }
  }
});

chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const message = messageInput.value.trim();
  if ((!message && !selectedFile) || isWaiting) {
    return;
  }

  addMessage(
    message || "Revisa el archivo adjunto.",
    "user",
    "",
    selectedFile?.name ?? "",
  );
  messageInput.value = "";
  statusMessage.textContent = "";
  isWaiting = true;
  messageInput.disabled = true;
  updateSendButton();
  const typingMessage = addMessage("Escribiendo…", "assistant", "message-typing");
  const fileToSend = selectedFile;

  try {
    const formData = new FormData();
    formData.append("message", message);
    if (conversationId) {
      formData.append("conversation_id", conversationId);
    }
    if (fileToSend) {
      formData.append("file", fileToSend);
    }

    const response = await fetch("/api/chat", {
      method: "POST",
      body: formData,
    });
    const result = await response.json();

    typingMessage.remove();
    if (!response.ok) {
      throw new Error(
        typeof result.error === "string"
          ? result.error
          : "No se pudo procesar el mensaje. Inténtalo de nuevo.",
      );
    }

    if (typeof result.reply !== "string" || typeof result.conversation_id !== "string") {
      throw new Error("El servidor devolvió una respuesta no válida.");
    }

    conversationId = result.conversation_id;
    addMessage(result.reply, "assistant");
    if (fileToSend === selectedFile) {
      updateSelectedFile(null);
    }
  } catch (error) {
    typingMessage.remove();
    const errorText = error instanceof Error
      ? error.message
      : "No se pudo conectar con el asistente. Inténtalo de nuevo.";
    addMessage(errorText, "assistant", "message-error");
    statusMessage.textContent = "Puedes volver a intentarlo.";
  } finally {
    isWaiting = false;
    messageInput.disabled = false;
    updateSendButton();
    messageInput.focus();
  }
});

newChatButton.addEventListener("click", async () => {
  if (isWaiting) {
    return;
  }

  isWaiting = true;
  statusMessage.textContent = "";
  updateSendButton();

  try {
    if (conversationId) {
      const response = await fetch("/api/chat/cleanup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversation_id: conversationId }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(
          typeof result.error === "string"
            ? result.error
            : "No se pudo limpiar la conversación.",
        );
      }
    }

    resetConversationView();
  } catch (error) {
    statusMessage.textContent = error instanceof Error
      ? error.message
      : "No se pudo limpiar la conversación. Inténtalo de nuevo.";
  } finally {
    isWaiting = false;
    updateSendButton();
  }
});

updateSendButton();
