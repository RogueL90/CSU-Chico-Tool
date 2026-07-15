import { BedrockAgentRuntimeClient } from "@aws-sdk/client-bedrock-agent-runtime";

export const client = new BedrockAgentRuntimeClient({
  region: process.env.EXPO_PUBLIC_AWS_REGION,
  credentials: {
    accessKeyId: process.env.EXPO_PUBLIC_AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.EXPO_PUBLIC_AWS_SECRET_ACCESS_KEY,
    // Only needed for temporary credentials (e.g. AWS Academy / Learner Lab)
    sessionToken: process.env.EXPO_PUBLIC_AWS_SESSION_TOKEN || undefined,
  },
});
