# Call Willie 🐾

An AI campus assistant for CSU Chico. Ask about campus services, buildings, hours, or resources and Willie answers with grounded information, interactive maps with live turn-by-turn navigation, and tap-to-call contact cards.

Runs as a **native iOS app** (Expo Go) and a **web app** ([hosted on CloudFront](https://d3gmrc21asm6ic.cloudfront.net)) from a single React Native codebase.

## Features

- **RAG chatbot** — Claude (Sonnet) on AWS Bedrock retrieves from a Bedrock Knowledge Base of university content; answers are formatted in markdown with verified links only (no hallucinated URLs — sources are grounded and dead links stripped server-side)
- **Interactive maps** — answers that mention a place include a map card that expands to a full-screen Google map with walking/driving routes, alternate route selection, ETAs, and a Google-Maps-style bottom sheet
- **Live navigation** — Start button begins GPS turn-by-turn: heading-up camera follow, maneuver banner, step advancement, off-route re-routing, screen kept awake
- **Place details** — business hours (open/closed + weekly schedule), summaries, and a call button, pulled live from Google Places
- **Safety-aware** — emergency and safety questions proactively surface the right phone numbers (911, University Police, Counseling); Bedrock Guardrails block prompt-injection attempts
- **Follow-up aware** — resolves "is it open right now?" style follow-ups from conversation history, and offers clarifying choices when a question is ambiguous

## Architecture

```
┌─────────────────────────┐
│  React Native (Expo)    │  iOS via Expo Go · Web via react-native-web
│  csuc/                  │  (S3 + CloudFront, OAC, HTTPS)
└───────────┬─────────────┘
            │ POST /ask, GET /directions
┌───────────▼─────────────┐
│  Amazon API Gateway     │  HTTP API, CORS
└───────────┬─────────────┘
┌───────────▼─────────────┐
│  AWS Lambda (Python)    │  backend/ — Strands agent orchestrator
│  ┌───────────────────┐  │
│  │ Claude Sonnet     │◄─┼── Bedrock Guardrails (prompt-attack, PII)
│  │ (Bedrock)         │  │
│  └───┬───────────┬───┘  │
│      ▼           ▼      │
│  Bedrock KB   Google    │
│  (retrieve)   Places    │
└─────────────────────────┘
```

- **Native maps**: `react-native-maps` (Google provider) with custom polylines, markers, and a `@gorhom/bottom-sheet` card
- **Web maps**: platform-forked components (`*.web.js`) render the Google Maps JavaScript API with the same UI; Google's Directions REST API blocks browser CORS, so web routes go through the Lambda `/directions` proxy

## Repo structure

```
csuc/               Expo app (React Native 0.81 / Expo SDK 54)
  src/chatbot/      Chat screen, message bubbles, output components
    components/outputs/
      MapOutput.js        native full-screen map + navigation
      MapOutput.web.js    web fork (Maps JavaScript API)
      PhoneOutput.js      tap-to-call card
  maps-api/         Google Maps modules (directions, places, location)
  deploy-web.sh     build + deploy the web app to S3/CloudFront
backend/            Python Lambda (also runs locally)
  agent.py          Strands agent, system prompt, response sanitizers
  tools/            retrieve_from_kb (Bedrock KB) · lookup_place (Places)
  lambda_function.py  HTTP handler: /health, /ask, /directions proxy
  server.py         local FastAPI dev server
```

## Setup

### Prerequisites

- Node 20+, Python 3.13+, AWS CLI
- An AWS account with Bedrock access (Knowledge Base + Claude models) — this project runs in an AWS Academy Learner Lab account
- A Google Maps Platform API key with: Places API (New), Directions API, Maps JavaScript API

### Environment

Create `csuc/.env` (never commit it):

```
EXPO_PUBLIC_BACKEND_URL=<API Gateway base URL>
EXPO_PUBLIC_GOOGLE_MAPS_API_KEY=<Google Maps key>
EXPO_PUBLIC_AWS_REGION=us-west-2
EXPO_PUBLIC_KNOWLEDGE_BASE_ID=<Bedrock KB id>
# Only needed to run the backend locally:
EXPO_PUBLIC_AWS_ACCESS_KEY_ID=...
EXPO_PUBLIC_AWS_SECRET_ACCESS_KEY=...
EXPO_PUBLIC_AWS_SESSION_TOKEN=...
```

> **Learner Lab note:** AWS credentials rotate every lab session. Update `~/.aws/credentials` (for CLI/deploys) and the env values above (for local backend dev) after each restart. `EXPO_PUBLIC_*` values are baked into the app bundle at build time — restart Metro after changing them.

### Run the app (iOS via Expo Go)

```bash
cd csuc
npm install
npx expo start --tunnel --clear
```

Scan the QR code with the Expo Go app. The chat talks to the deployed Lambda, so no local backend is needed.

### Run the web app locally

```bash
cd csuc
npx expo start        # then press "w"
```

### Run the backend locally (optional)

```bash
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
uvicorn server:app --reload   # http://localhost:8000
```

## Deployment

### Backend (Lambda)

The agent runs on Lambda `call-willie-backend` (us-west-2) behind API Gateway. To ship backend changes: build a deployment zip with dependencies installed for `manylinux2014_x86_64` / Python 3.13, then:

```bash
aws lambda update-function-code --function-name call-willie-backend \
  --zip-file fileb://lambda-deploy.zip --region us-west-2
```

### Web frontend (S3 + CloudFront)

```bash
cd csuc
./deploy-web.sh
```

Builds the static export, syncs to the private S3 bucket (immutable caching for hashed assets, no-cache for `index.html`), and invalidates CloudFront. Live at `https://d3gmrc21asm6ic.cloudfront.net`.

## API

| Route | Method | Description |
|---|---|---|
| `/health` | GET | liveness check |
| `/ask` | POST | `{ query, conversation_history?, user_location? }` → answer text, optional map/phone payloads, follow-up choices |
| `/directions` | GET | Google Directions proxy for browsers (`origin`, `destination`, `mode`) |

## AWS services used

**Bedrock** (Claude Sonnet, Knowledge Base retrieval, Guardrails) · **Lambda** · **API Gateway** (HTTP API) · **S3** · **CloudFront** (Origin Access Control) · **IAM** · **CloudWatch Logs**

## Team

Built by CSU Chico students for the AWS summer program.
