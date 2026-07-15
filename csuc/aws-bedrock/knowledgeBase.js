import { RetrieveAndGenerateCommand } from "@aws-sdk/client-bedrock-agent-runtime";
import { client } from "./client.js";

export async function askKnowledgeBase(
  query,
  knowledgeBaseId = process.env.EXPO_PUBLIC_KNOWLEDGE_BASE_ID,
  modelArn = process.env.EXPO_PUBLIC_MODEL_ARN
) {
  const input = {
    input: {
      text: query,
    },
    retrieveAndGenerateConfiguration: {
      type: "KNOWLEDGE_BASE",
      knowledgeBaseConfiguration: {
        knowledgeBaseId: knowledgeBaseId,
        modelArn: modelArn,
      },
    },
  };

  try {
    const command = new RetrieveAndGenerateCommand(input);
    const response = await client.send(command);

    console.log("Answer:\n", response.output?.text);

    const citations = response.citations;
    if (citations && citations.length > 0) {
      console.log("\nSources:");
      citations.forEach((citation, index) => {
        const sourceText = citation.retrievedReferences?.[0]?.content?.text;
        console.log(`[${index + 1}] Snippet:`, sourceText?.substring(0, 75) + "...");
      });
    }

    return response;
  } catch (error) {
    console.error("Error querying Bedrock:", error);
  }
}
