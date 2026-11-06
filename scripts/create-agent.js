import { AIProjectClient } from "@azure/ai-projects";
import { DefaultAzureCredential } from "@azure/identity";

const projectEndpoint = process.env.FOUNDRY_PROJECT_ENDPOINT?.trim();
const agentName = process.env.FOUNDRY_AGENT_NAME?.trim();

function logSafeError(error) {
  const message = error instanceof Error ? error.message : "Error desconocido.";
  const safeMessage = message
    .replaceAll(projectEndpoint ?? "", "[project endpoint]")
    .replaceAll(agentName ?? "", "[agent name]")
    .replace(/Bearer\s+\S+/gi, "[token redacted]")
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[token redacted]")
    .slice(0, 500);

  console.error("No se pudo verificar o crear el agente.", {
    name: error?.name,
    code: error?.code,
    statusCode: error?.statusCode ?? error?.status ?? error?.response?.status,
    message: safeMessage,
  });
}

async function main() {
  if (!projectEndpoint || !agentName) {
    console.error("Configura FOUNDRY_PROJECT_ENDPOINT y FOUNDRY_AGENT_NAME.");
    process.exitCode = 1;
    return;
  }

  const projectClient = new AIProjectClient(
    projectEndpoint,
    new DefaultAzureCredential(),
  );

  try {
    try {
      await projectClient.agents.get(agentName);
      console.log(`El agente "${agentName}" ya existe; no se realizaron cambios.`);
      return;
    } catch (error) {
      const statusCode = error?.statusCode ?? error?.status ?? error?.response?.status;
      if (statusCode !== 404) {
        throw error;
      }
    }

    const model = process.env.FOUNDRY_MODEL_DEPLOYMENT?.trim();
    const instructions = process.env.FOUNDRY_AGENT_INSTRUCTIONS?.trim();
    if (!model || !instructions) {
      console.error(
        "Para crear un agente faltante, configura FOUNDRY_MODEL_DEPLOYMENT y FOUNDRY_AGENT_INSTRUCTIONS.",
      );
      process.exitCode = 1;
      return;
    }

    const agent = await projectClient.agents.createVersion(agentName, {
      kind: "prompt",
      model,
      instructions,
    });

    console.log(`Agente "${agent.name}" creado en la versión ${agent.version}.`);
  } catch (error) {
    logSafeError(error);
    process.exitCode = 1;
  }
}

await main();