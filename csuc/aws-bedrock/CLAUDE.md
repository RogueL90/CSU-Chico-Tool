# AWS Bedrock Knowledge Base Integration — Context

Context for the Bedrock Knowledge Base integration on `feat/bedrock-expo-go`. Read this before modifying the Bedrock setup or debugging AWS SDK issues in the Expo app.

## What this is

The app queries an AWS Bedrock Knowledge Base (RAG) via `RetrieveAndGenerateCommand`:

- `aws-bedrock/client.js` — exports a configured `BedrockAgentRuntimeClient` (region + credentials from env)
- `aws-bedrock/knowledgeBase.js` — exports `askKnowledgeBase(query, knowledgeBaseId?, modelArn?)`; defaults come from env; returns the full response (answer text is `response.output.text`, citations in `response.citations`)
- `App.js` — minimal demo UI (TextInput → Ask button → answer)
- `.env` (project root, gitignored) — `EXPO_PUBLIC_*` variables; Expo inlines these **at bundle time**

Knowledge Base ID: `EVLCAIRVMQ`, model: Claude 3 Haiku, region: `us-west-2`.

## Environment variables (`csuc/.env`)

```
EXPO_PUBLIC_AWS_REGION=us-west-2
EXPO_PUBLIC_KNOWLEDGE_BASE_ID=EVLCAIRVMQ
EXPO_PUBLIC_MODEL_ARN=arn:aws:bedrock:us-west-2::foundation-model/anthropic.claude-3-haiku-20240307-v1:0
EXPO_PUBLIC_AWS_ACCESS_KEY_ID=...
EXPO_PUBLIC_AWS_SECRET_ACCESS_KEY=...
EXPO_PUBLIC_AWS_SESSION_TOKEN=...   # only for temporary creds (AWS Academy / Learner Lab)
```

Rules:
- Only `EXPO_PUBLIC_`-prefixed vars are visible to app code. dotenv is NOT used (doesn't work in RN; Expo loads root `.env` natively).
- Values are baked in when Metro starts → **restart the dev server after editing `.env`** (`npx expo start --clear`).
- Keys ship inside the JS bundle. Dev-only approach; for production switch to Cognito Identity Pool or a backend proxy.
- `.env` is gitignored — every developer/branch needs their own copy.

## Problems hit and how they were fixed (do not undo these)

### 1. Metro bundled the SDK's Node build → `import "node:https"` failure
The AWS SDK's `main` entry is `dist-cjs` (Node-only, pulls in `@smithy/node-http-handler`). Its React Native support only exists via the `module` (`dist-es`) build + a `react-native` runtimeConfig substitution.
**Fix:** `metro.config.js` has a custom `resolveRequest` that prefers `module` over `main` **only for `@aws-sdk/*` and `@smithy/*`** imports.

### 2. Making that resolver change global broke the app (`Cannot read property 'decode' of undefined`)
A first attempt set `resolverMainFields = ['react-native','browser','module','main']` globally. That silently switched `punycode` (a dep of Expo's built-in URL support) to its ES build, which lacks the `ucs2` object → `punycode.ucs2.decode` crashed at startup ("runtime not ready" errors). **Lesson: never apply the `module`-preference globally; keep it scoped to AWS packages.**

### 3. Hermes is missing globals the SDK expects
Crashes: `TextDecoder` undefined at bundle load; `crypto.getRandomValues` needed per request; RN's `Blob` has no `.arrayBuffer()` → `blob.arrayBuffer is not a function` when reading the HTTP response.
**Fix:** `polyfills.js` (imported FIRST in `index.js`) provides:
- `fast-text-encoding` → TextEncoder/TextDecoder
- `react-native-get-random-values` → crypto.getRandomValues
- hand-written `Blob.prototype.arrayBuffer` via `FileReader.readAsArrayBuffer`

`import './polyfills'` must stay the first import in `index.js`.

### 4. Phone couldn't reach Metro ("could not connect to server")
Campus/public Wi-Fi client isolation blocks LAN connections to the dev server.
**Fix:** tunnel mode — `npx expo start --tunnel`. `@expo/ngrok` is installed as a local devDependency (the global install wasn't found by Expo's resolver).

### 5. `UnrecognizedClientException: The security token included in the request is invalid`
Means the credentials in `.env` are missing/placeholder/expired — not a code bug. Put valid IAM keys in `.env` (all three values incl. session token if using Learner Lab; those expire each lab session) and restart the dev server.

## Still to do

- [ ] Put valid AWS credentials in `.env` (last blocker when this doc was written; everything else verified through Metro bundling and on-device testing up to the credentials error)
- [ ] Production credential story: Cognito Identity Pool or backend proxy instead of keys in the bundle

## Key files

| File | Purpose |
|------|---------|
| `metro.config.js` | Scoped AWS SDK resolution (see #1/#2) |
| `polyfills.js` | Hermes globals for the SDK (see #3) |
| `index.js` | Imports polyfills first, then registers App |
| `aws-bedrock/client.js` | Bedrock client (region/creds from env) |
| `aws-bedrock/knowledgeBase.js` | `askKnowledgeBase()` RAG query |
| `.env` | Not committed — must be recreated per checkout |

Dependencies added to `package.json`: `@aws-sdk/client-bedrock-agent-runtime`, `fast-text-encoding`, `react-native-get-random-values`, `@expo/ngrok` (dev).
