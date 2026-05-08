# Radiance — Frontend Documentation

> **App:** `apps/web`  
> **Framework:** Next.js 14 · App Router · Static Export  
> **Runtime:** TypeScript · React 18

---

## Table of Contents

1. [Overview](#1-overview)
2. [Tech Stack](#2-tech-stack)
3. [Directory Structure](#3-directory-structure)
4. [Routing & Pages](#4-routing--pages)
5. [Global State Management](#5-global-state-management)
6. [API Service Layer](#6-api-service-layer)
7. [AI WebWorker](#7-ai-webworker)
8. [Component Library](#8-component-library)
9. [User Flows](#9-user-flows)
10. [Authentication](#10-authentication)
11. [Gallery FSM](#11-gallery-fsm)
12. [Workspace Editor](#12-workspace-editor)
13. [Build & Deployment](#13-build--deployment)

---

## 1. Overview

The frontend is a **Next.js 14 static export** served via Amazon S3 + CloudFront CDN. It has no server-side rendering — all pages are statically generated and run entirely in the browser.

The app implements two distinct CV enhancement flows:

1. **Legacy / Quick Enhance** — Upload CV PDF + paste JD → API analyzes → dashboard shows score/gaps/red flags → one-click enhance → workspace editor
2. **Strategic Gallery Mode** — Paste JD → client-side AI (WebWorker) ranks saved projects → user reviews + selects → API rewrites CV with the selected projects → workspace editor

Both flows converge at the **Workspace Editor**, a split-pane interface with a live form builder on the left and an A4 PDF preview on the right.

---

## 2. Tech Stack

| Technology | Version | Role |
|------------|---------|------|
| **Next.js** | 14.2.5 | React framework, App Router, static export (`output: 'export'`) |
| **React** | 18 | UI rendering |
| **TypeScript** | 5 | End-to-end type safety |
| **Tailwind CSS** | 3.4 | Utility-first styling |
| **Zustand** | latest | Global state management (`useCVStore.ts`) |
| **@huggingface/transformers** | v3 | WebWorker — `all-MiniLM-L6-v2` embeddings + `SmolLM2-135M-Instruct` reasoning |
| **@monaco-editor/react** | latest | JSON editor in workspace |
| **Lucide Icons** | latest | Icon library |
| **Supabase JS** | latest | Auth client (magic link, OAuth) |

**Build strategy:** `next.config.mjs` with `output: 'export'` → static HTML/CSS/JS to `apps/web/out/`. Deployed to S3, served via CloudFront. Zero server cost.

**Styling:** Brutalist neo-minimal design — thick black borders (`border-4 border-black`), box shadows (`shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]`), flat hover animations (translate + shadow collapse), yellow accent `#FDC800`, cream background `#FBFBF9`, dark navy text `#1C293C`.

---

## 3. Directory Structure

```
apps/web/
├── app/
│   ├── layout.tsx                          # Root layout — Supabase auth listener
│   ├── page.tsx                            # Landing page (/)
│   ├── login/
│   │   ├── page.tsx                        # Login page wrapper
│   │   └── login-client.tsx                # Supabase auth UI
│   ├── auth/
│   │   └── callback/
│   │       ├── page.tsx                    # Auth callback SSR
│   │       └── auth-callback-client.tsx    # Token exchange + redirect
│   └── (authenticated)/
│       ├── layout.tsx                      # Auth guard layout
│       ├── dashboard/
│       │   ├── layout.tsx                  # Dashboard layout with sidebar
│       │   ├── page.tsx                    # Main enhance page (/dashboard)
│       │   ├── gallery/
│       │   │   └── page.tsx                # Project Gallery (/dashboard/gallery)
│       │   └── history/
│       │       └── page.tsx                # CV History (/dashboard/history)
│       └── workspace/
│           └── page.tsx                    # CV Editor (/workspace)
├── components/
│   ├── dashboard/
│   │   ├── AnalysisDashboard.tsx           # Score + gaps + red flags container
│   │   ├── CVHistory.tsx                   # History list + restore to workspace
│   │   ├── ProjectGallery.tsx              # Gallery CRUD UI
│   │   ├── ProjectSelectionHub.tsx         # AI-ranked project selection UI
│   │   ├── ScoreGauge.tsx                  # Circular ATS score gauge
│   │   ├── SkillGaps.tsx                   # Skill gap cards by importance
│   │   ├── RedFlags.tsx                    # Red flag cards by severity
│   │   └── Sidebar.tsx                     # Dashboard sidebar nav
│   ├── editor/
│   │   ├── CVFormBuilder.tsx               # Section-based CV form editor
│   │   ├── CVPreview.tsx                   # A4 HTML + PDF preview
│   │   └── MonacoEditorWrapper.tsx         # JSON editor fallback
│   ├── landing/
│   │   ├── LandingPage.tsx                 # Full landing page
│   │   ├── MatchingAnimation.tsx           # Hero animation
│   │   ├── SkillGapAnimation.tsx           # Feature demo animation
│   │   └── StarAnimation.tsx               # STAR method animation
│   ├── auth/
│   │   └── RequireAuth.tsx                 # Auth guard component
│   └── ui/
│       ├── AnalyzingOverlay.tsx            # Loading overlay (legacy flow)
│       ├── CVDropzone.tsx                  # PDF drag-and-drop upload
│       ├── JDTextarea.tsx                  # Job description text input
│       ├── NavBar.tsx                      # Step breadcrumb navigation
│       ├── PDFPreview.tsx                  # PDF iframe viewer
│       └── SupabaseAuthListener.tsx        # Syncs auth state → Zustand
├── services/
│   ├── api.ts                              # Core API client + types
│   ├── aiClientService.ts                  # WebWorker bridge + fallback
│   ├── projectApi.ts                       # Project Gallery API
│   ├── historyApi.ts                       # CV History API
│   └── mockData.ts                         # Loading step labels
├── store/
│   └── useCVStore.ts                       # Zustand global store
├── workers/
│   └── ai.worker.ts                        # Transformers.js WebWorker
├── lib/
│   ├── supabase/
│   │   ├── client.ts                       # Browser Supabase client
│   │   └── server.ts                       # Server-side Supabase client
│   └── readApiJson.ts                      # Safe JSON response reader
├── hooks/                                  # Custom React hooks (if any)
├── public/                                 # Static assets
├── next.config.mjs
├── tailwind.config.ts
├── tsconfig.json
└── package.json
```

---

## 4. Routing & Pages

All routes live under `app/` using Next.js 14 App Router.

### Route Map

| Route | Component | Description |
|-------|-----------|-------------|
| `/` | `LandingPage` | Marketing landing page |
| `/login` | `LoginPage` | Supabase auth (magic link / OAuth) |
| `/auth/callback` | `AuthCallbackClient` | OAuth token exchange → redirect to `/dashboard` |
| `/dashboard` | `EnhanceCVPage` | Main page: CV upload, JD input, analysis, enhancement mode selection |
| `/dashboard/gallery` | `ProjectGallery` | Project Gallery CRUD |
| `/dashboard/history` | `CVHistory` | CV enhancement history list |
| `/workspace` | `WorkspacePage` | Split-pane CV editor + PDF preview |
| `/workspace?id=<uuid>` | `WorkspacePage` | Restore workspace from history entry |

### Authenticated Layout

`app/(authenticated)/layout.tsx` wraps all dashboard and workspace routes with `RequireAuth`. Unauthenticated users are redirected to `/login`.

### Dashboard Layout

`app/(authenticated)/dashboard/layout.tsx` provides the `Sidebar` nav + dashboard content area. The sidebar links to: Enhance (main), Gallery, History.

---

## 5. Global State Management

All application state is in a single **Zustand store** at `store/useCVStore.ts`.

### State Shape

#### Auth State

| Field | Type | Description |
|-------|------|-------------|
| `user` | `User \| null` | Current Supabase user object |
| `authHydrated` | `boolean` | True after first client-side session check |

#### Core Analysis State

| Field | Type | Description |
|-------|------|-------------|
| `cvFile` | `File \| null` | Uploaded CV PDF file |
| `jdText` | `string` | Job description text |
| `jobId` | `string \| null` | Current async job ID |
| `analysisResult` | `AnalysisResultState \| null` | Full analysis result from backend |
| `cvData` | `CVResumeSchema \| null` | Enhanced CV JSON (workspace data) |
| `pdfUrl` | `string` | Presigned S3 URL of rendered PDF |

#### UI Phase

| Field | Type | Values |
|-------|------|--------|
| `phase` | `AppPhase` | `'upload'` \| `'analyzing'` \| `'dashboard'` \| `'workspace'` |
| `loadingStepIndex` | `number` | Current loading step (0–4) |
| `loadingSteps` | `typeof LOADING_STEPS` | Step label array |
| `inputReviewMode` | `boolean` | True when reviewing inputs before analysis |

#### Gallery FSM State

| Field | Type | Description |
|-------|------|-------------|
| `galleryPhase` | `GalleryPhase` | FSM state (see Gallery FSM section) |
| `galleryLoadingStep` | `0 \| 1 \| 2` | WebWorker progress sub-step |
| `projectGallery` | `ProjectItem[]` | Cached project gallery for current user |
| `galleryOwnerUserId` | `string \| null` | User ID that `projectGallery` belongs to |
| `recommendedProjects` | `ClientAIResult[]` | Top-5 ranked projects from WebWorker |
| `selectedProjectIds` | `string[]` | Project IDs user checked in SelectionHub |
| `galleryError` | `string` | Error message when `galleryPhase === 'ERROR'` |

### Key Actions

```typescript
// Auth
setUser(user: User | null)
setAuthHydrated(hydrated: boolean)

// Analysis
setCvFile(file: File | null)
setJdText(text: string)          // FSM guard: resets gallery if CONSULTING_GALLERY
setJobId(id: string | null)
setAnalysisResult(result)
setCvData(data: CVResumeSchema | null)
setPdfUrl(url: string)
setPhase(phase: AppPhase)
setLoadingStepIndex(index: number)
reset()                          // Preserves user auth + gallery cache

// Gallery FSM
startGalleryAnalysis()           // IDLE → ANALYZING
consultGallery(results)          // ANALYZING → CONSULTING_GALLERY
setSelectedProjectIds(ids)       // Update selection
finalizeGallery()                // CONSULTING_GALLERY → FINALIZING
resetGallery()                   // Any → IDLE (clear gallery state)
completeGallery()                // FINALIZING → IDLE (preserve selectedProjectIds)
setGalleryError(message)         // Any → ERROR
setProjectGallery(items, userId) // Populate + cache gallery
setGalleryLoadingStep(step)      // Update progress
```

### Reset Behaviour

`reset()` clears CV analysis state but **preserves**:
- `user` + `authHydrated` (avoid re-auth)
- `projectGallery` + `galleryOwnerUserId` (avoid re-fetch)

---

## 6. API Service Layer

### `services/api.ts` — Core API Client

All backend communication. Uses `fetch` with Supabase Bearer token injection.

#### Types

Mirrors backend Pydantic models exactly:

- `CVResumeSchema` — full structured CV (personal_info, summary, experiences, education, projects, skill_groups, awards_certifications, recommended_actions)
- `AnalysisResultDTO` — matching_score, missing_skills, red_flags, enhanced_cv_json, pdf_url
- `AnalysisStatusResponse` — id, status, error, result
- `ProjectItem` — id, title, description, tech_stack
- `ClientAIResult` — project_id, fit_score, client_reasoning
- `GalleryPhase` — `'IDLE' | 'ANALYZING' | 'CONSULTING_GALLERY' | 'FINALIZING' | 'ERROR'`

#### `AnalysisService`

```typescript
AnalysisService.getUploadUrl(fileName, contentType)  // → ResumeUploadUrlResponse
AnalysisService.uploadToS3(file, uploadUrl)          // Direct S3 PUT
AnalysisService.triggerAnalysis(s3Key, jdText, ...)  // → CreateAnalysisResponse (jobId)
AnalysisService.pollJobStatus(jobId)                 // → AnalysisStatusResponse
```

#### `uploadAndAnalyze(cvFile, jdText, onStep?)` — Orchestrated Legacy Flow

Runs the full 5-step sequence with optional step-callback for UI progress:
```
Step 0 → getUploadUrl()
Step 1 → uploadToS3()
Step 2 → triggerAnalysis()
Step 3 → (polling begins)
Step 4 → pollJobStatus() (every 2s, up to 300 attempts = ~10 min)
```

Returns `{ jobId, status, result, error }`.

#### Gallery APIs

```typescript
callFallbackClientAI(request)    // POST /api/v1/fallback/client-ai → ClientAIResult[]
enhanceFromGallery(request)      // POST /api/v1/analyses/enhance-from-gallery → CreateAnalysisResponse
renderCvToPdf(cvData)            // POST /api/v1/editor/renders → EditorRenderResponse
```

### `services/aiClientService.ts` — WebWorker Bridge

Spawns `ai.worker.ts` and handles the message protocol. Falls back to `callFallbackClientAI` if:
- Worker constructor fails (SSR, unsupported environment)
- Worker posts `FALLBACK_REQUIRED` (OOM, no WebGPU)
- Worker runtime error

Output normalization via `normalizeClientResults()`:
- Strips leading/trailing quotes and backticks
- Detects repeating 4-gram loops (SmolLM2 hallucination artifact) → replaces with default
- Ensures minimum length of 15 characters

### `services/projectApi.ts`

```typescript
getProjects()                              // GET /api/v1/projects
createProject(payload)                     // POST /api/v1/projects
deleteProject(projectId)                   // DELETE /api/v1/projects/{id}
```

### `services/historyApi.ts`

```typescript
getHistory()                               // GET /api/v1/history
getHistoryItem(historyId)                  // GET /api/v1/history/{id}
updateHistoryItem(historyId, payload)      // PATCH /api/v1/history/{id}
deleteHistoryItem(historyId)               // DELETE /api/v1/history/{id}
```

---

## 7. AI WebWorker

### `workers/ai.worker.ts`

Runs entirely in the browser, **off the UI thread**. Uses `@huggingface/transformers` v3 (Transformers.js) to run two quantized models locally without any API cost.

### Two-Phase Pipeline

```
IN: { type: 'ANALYZE', jd: string, gallery: ProjectItem[] }

Phase 1 — Embedding & Ranking
  Model: Xenova/all-MiniLM-L6-v2 (quantized)
  Task: feature-extraction
  ─────────────────────────────────────────
  1. Embed JD text
  2. Embed each project (title + description + tech_stack)
  3. Compute cosine similarity (JD embedding vs each project)
  4. Sort descending; take Top 5

  → self.postMessage({ type: 'PROGRESS', step: 1 })

Phase 2 — Reasoning
  Model: HuggingFaceTB/SmolLM2-135M-Instruct (dtype: q4)
  Task: text-generation (chat mode)
  ─────────────────────────────────────────
  For each Top-5 project:
    1. Build extractive reasoning (deterministic, JD+project vocab grounded)
    2. Run SmolLM2 with chat template (system + user prompt)
    3. Apply faithfulness gate — reject generated tokens that aren't
       traceable to JD or project source vocabulary
    4. If gate passes, append generated sentence to extractive reasoning

  → self.postMessage({ type: 'PROGRESS', step: 2 })

OUT: { type: 'RESULT', data: ClientAIResult[] }
     { type: 'FALLBACK_REQUIRED', reason: string }  ← on any failure
     { type: 'ERROR', message: string }
```

### Faithfulness Gate

The 135M SmolLM2 model frequently hallucinates tech names and proper nouns. The faithfulness gate:
1. Builds a **source vocabulary** from JD text + project title/description/tech_stack
2. For each token in the generated sentence, checks if it is:
   - In the source vocabulary (OK)
   - In the generic allowlist (OK) — English glue words, common verbs, project domain terms
   - A pure number (OK)
   - A sentence-initial capitalised word (OK)
   - Any other mixed-case/digit-bearing/separator-bearing token (hallucination → REJECT)
3. If any token is rejected, the entire sentence is discarded and only the deterministic extractive reasoning is used

### Models

| Model | Size | Task | Quantization |
|-------|------|------|-------------|
| `Xenova/all-MiniLM-L6-v2` | ~23 MB | Sentence embeddings | Quantized |
| `HuggingFaceTB/SmolLM2-135M-Instruct` | ~90 MB | Text generation | q4 |

Both models are loaded from HuggingFace Hub via browser cache (`env.useBrowserCache = true`).

### Security

The worker is **read-only** — it never writes to any storage. Fit scores are advisory only. The backend re-verifies all project IDs against Supabase before passing any data to Gemini.

---

## 8. Component Library

### Dashboard Components

#### `AnalysisDashboard`

Container component that renders all three analysis panels side-by-side:
- `ScoreGauge` — circular progress ring for matching score (0–100), colour-coded: ≥70 green, ≥50 amber, <50 red
- `SkillGaps` — card grid of missing skills, grouped by `importance` (critical / recommended / nice-to-have)
- `RedFlags` — card list of structural issues with severity badges (high / medium / low)

Props: `result: AnalysisResultDTO`, `onEnhanceWithAI: () => void`

#### `ProjectSelectionHub`

The core UI for the Strategic Gallery flow. Displayed when `galleryPhase === 'CONSULTING_GALLERY'`.

- Shows AI-ranked Top-5 projects with `fit_score` badges and `client_reasoning`
- Checkbox selection per project
- "Enhance CV with Selected Projects" CTA button — calls `enhanceFromGallery()` → sets `galleryPhase = 'FINALIZING'`

Props: `onJobQueued: (jobId: string) => void`

#### `ProjectGallery`

Full CRUD interface for the user's project gallery (`/dashboard/gallery`):
- List all projects with title, description, tech stack chips
- Add project modal (title, description, technologies)
- Delete project with confirmation
- Empty state CTA

Uses `projectApi.ts` directly.

#### `CVHistory`

History list page (`/dashboard/history`):
- Table of past CV enhancements (job title, company, matching score, date)
- "Open in Editor" → navigates to `/workspace?id=<history_id>`
- Delete entry with confirmation
- Rename (PATCH) job title / company name inline

Uses `historyApi.ts`.

#### `Sidebar`

Dashboard navigation sidebar:
- Links: Enhance (/dashboard), Gallery (/dashboard/gallery), History (/dashboard/history)
- Active link highlighting
- User avatar + email display
- Sign out button

### Editor Components

#### `CVFormBuilder`

Section-based form editor for `CVResumeSchema`. Each section (Personal Info, Summary, Experiences, Education, Projects, Skills, Awards) has dedicated form fields with inline editing.

- React-controlled form bound to `cvData` from Zustand store
- onChange callback propagates changes up to `WorkspacePage`
- AI-recommended project indices displayed with sparkle badge (for gallery-enhanced CVs)

Props: `cvData: CVResumeSchema`, `onChange: (updated) => void`, `aiRecommendedProjectIndices: number[]`

#### `CVPreview`

Live A4 HTML preview of the CV:
- **HTML mode** (default) — renders `cvData` directly in a styled `<div>` at A4 dimensions (210mm × 297mm)
- **PDF mode** — when `pdfUrl` is set, shows `<iframe src={pdfUrl}>` (presigned S3 URL)

Props: `cvData: CVResumeSchema`, `pdfUrl: string`, `isRendering: boolean`

#### `MonacoEditorWrapper`

Monaco Editor wrapper for raw JSON editing of `cvData`. Provides syntax highlighting, validation, and IntelliSense for `CVResumeSchema`.

### UI Components

#### `CVDropzone`

Drag-and-drop PDF upload zone:
- Accepts only `application/pdf`
- Shows file name + size on selection
- `reviewMode` prop makes the dropzone read-only (shows existing file, no re-upload)
- Calls `useCVStore.setCvFile()` on file selection

#### `JDTextarea`

Job description multi-line textarea:
- Character count display
- Minimum 50 characters for analysis to unlock
- `readOnly` prop for review mode

#### `AnalyzingOverlay`

Full-screen loading overlay for the legacy analysis flow. Displays animated step labels from `LOADING_STEPS` progressing from 0 to 4.

#### `NavBar`

3-step breadcrumb navigation bar:
1. Upload
2. Analysis
3. Editor

`activeStep` prop controls which step is highlighted. `onStepClick(step)` handles backwards navigation with state preservation.

#### `SupabaseAuthListener`

Invisible component in root layout that subscribes to `supabase.auth.onAuthStateChange` and syncs the Supabase session to Zustand (`setUser`, `setAuthHydrated`).

---

## 9. User Flows

### Flow A: Legacy / Quick Enhance

```
1. User lands on /dashboard
2. Uploads CV PDF (CVDropzone) → setCvFile()
3. Pastes JD text (JDTextarea) → setJdText()
4. Clicks "Analyze & Enhance CV"
5. handleAnalyze() called:
   a. setPhase('analyzing') → AnalyzingOverlay shown
   b. uploadAndAnalyze(cvFile, jdText, onStep):
      - GET /api/v1/resumes/upload-urls → presigned URL + s3_key
      - PUT direct to S3 (browser → S3)
      - POST /api/v1/analyses → jobId
      - Poll GET /api/v1/analyses/{jobId} every 2s
   c. On complete: setAnalysisResult(result) + setPhase('dashboard')
6. AnalysisDashboard shown: score gauge, skill gaps, red flags
7. User clicks "Quick Enhance (ATS-Friendly)":
   - setCvData(result.enhanced_cv_json)
   - setPdfUrl(result.pdf_url)
   - setPhase('workspace')
   - router.push('/workspace')
8. WorkspacePage: split-pane editor + PDF preview
```

### Flow B: Strategic Gallery Enhancement

```
1. User is in /dashboard with analysis results
2. Clicks "Optimize with Project Gallery ✨"
3. handleStrategicAnalyze() called:
   a. startGalleryAnalysis() → galleryPhase: ANALYZING
   b. analyzeProjectsWithClientAI(jdText, projectGallery, onProgress):
      - Spawns ai.worker.ts
      - Phase 1: Embeds JD + all projects → cosine similarity → Top-5
      - Phase 2: SmolLM2 generates reasoning for each Top-5 project
      - If WebWorker fails: fallbackClientAI() → POST /api/v1/fallback/client-ai
   c. consultGallery(results) → galleryPhase: CONSULTING_GALLERY
4. ProjectSelectionHub shown:
   - AI-ranked projects with scores + reasoning
   - User selects/deselects projects
5. User clicks "Enhance CV with Selected Projects":
   a. enhanceFromGallery({ cv_text, jd_text, client_results })
      → POST /api/v1/analyses/enhance-from-gallery
      → returns jobId
   b. finalizeGallery() → galleryPhase: FINALIZING
   c. Poll GET /api/v1/analyses/{jobId} every 2s
6. On complete:
   - setCvData(result.enhanced_cv_json)
   - setPdfUrl(result.pdf_url)
   - setPhase('workspace')
   - router.push('/workspace')
7. WorkspacePage shows "Strategic Mode" badge
   - All current projects marked with AI badge
   - "Optimize with Gallery" button available for re-optimization
```

### Flow C: History Restore

```
1. User navigates to /dashboard/history
2. CVHistory component fetches GET /api/v1/history → summary list
3. User clicks "Open in Editor" on a past entry
4. Router navigates to /workspace?id=<history_id>
5. WorkspacePage:
   a. Detects ?id= param + empty cvData → historyLoading = true
   b. getHistoryItem(historyId) → GET /api/v1/history/{id}
   c. setCvData(entry.enhanced_cv_json)
   d. setJdText(entry.jd_text)
   e. setPhase('workspace')
6. Editor opens with historical CV data
7. Optional: user can re-run gallery optimization from workspace
```

---

## 10. Authentication

### Supabase Auth

- Provider: Supabase Auth (magic link + OAuth)
- Token: JWT stored in Supabase session (`localStorage` / cookie)
- Token type: Bearer token sent in `Authorization` header to backend

### Flow

1. User visits `/login` → Supabase Auth UI
2. After successful auth, Supabase redirects to `/auth/callback?code=...`
3. `AuthCallbackClient` exchanges code → session → redirects to `/dashboard`
4. `SupabaseAuthListener` (root layout) detects session → `setUser(user)` + `setAuthHydrated(true)`
5. All API calls inject `Authorization: Bearer <access_token>` via `getSupabaseToken()`

### Protected Routes

`app/(authenticated)/layout.tsx` uses `RequireAuth` to check `authHydrated` + `user`. Unauthenticated users are redirected to `/login`.

Static-export caveat: auth checks run client-side only. `authHydrated` guards against flash of incorrect state during initial hydration.

---

## 11. Gallery FSM

The Gallery FSM runs **parallel** to the legacy `phase` AppPhase. It has 5 states:

```
                ┌─────────────────────────┐
                │                         │
    ┌───────────▼──────────┐              │
    │         IDLE          │              │
    └───────────┬──────────┘              │
                │ startGalleryAnalysis()  │
                ▼                         │
    ┌───────────────────────┐             │
    │       ANALYZING        │             │
    │  (WebWorker running)   │             │
    └───────────┬───────────┘             │
                │ consultGallery(results) │
                ▼                         │
    ┌───────────────────────┐             │
    │  CONSULTING_GALLERY    │─────────────┘ resetGallery()
    │  (ProjectSelectionHub) │
    └───────────┬───────────┘
                │ finalizeGallery()
                ▼
    ┌───────────────────────┐
    │      FINALIZING        │
    │  (polling backend job) │
    └───────────┬───────────┘
                │ completeGallery()
                ▼
              IDLE ◄──────────── setGalleryError() → ERROR
```

### FSM Guards

- `setJdText()` has an FSM side-effect: if `galleryPhase === 'CONSULTING_GALLERY'`, it resets the gallery automatically. This prevents stale AI reasoning from being shown when the JD changes.
- `reset()` (new analysis) resets gallery to IDLE but **preserves** `projectGallery` + `galleryOwnerUserId` cache.
- `completeGallery()` (on successful backend job) resets FSM to IDLE but **preserves** `selectedProjectIds` so the Strategic Mode badge and AI-injected project indicators remain visible in the editor.

---

## 12. Workspace Editor

`/workspace` — the split-pane CV editing environment.

### Layout

```
┌──────────────────────────────────────────────────────────────────┐
│  NavBar (step breadcrumbs: 1. Upload | 2. Analysis | 3. Editor)  │
├──────────────────────────────────────────────────────────────────┤
│  Toolbar: [← Back] [CV Editor] [Strategic Mode?] [Gallery][Render][JSON][PDF] │
├─────────────────────────────┬─────────────────────────────────────┤
│                             │                                     │
│   CVFormBuilder             │   CVPreview                         │
│   (section form editor)     │   (HTML live preview / PDF iframe)  │
│                             │                                     │
│   ← resizable divider →    │                                     │
├─────────────────────────────┴─────────────────────────────────────┤
│  Toast notifications (bottom-right)                              │
└──────────────────────────────────────────────────────────────────┘
```

### Resizable Split Pane

The split pane uses a drag handle with mouse events:
- Default width: 48% left / 52% right
- Drag range: 30%–70%
- `isResizing` state prevents content interaction during drag

### Toolbar Actions

| Button | Action |
|--------|--------|
| ← Back | Navigate back (dashboard or history list) |
| Gallery | `handleOptimizeWithGallery()` — triggers gallery FSM overlay |
| Render PDF / Sync Changes | `renderCvToPdf(cvData)` → POST `/api/v1/editor/renders` → updates `pdfUrl` |
| JSON | `handleDownloadJson()` — download `cvData` as JSON file |
| PDF | `handleDownloadPDF()` — download from `pdfUrl` (must render first) |

### Strategic Mode in Workspace

When `selectedProjectIds.length > 0`:
- "Strategic Mode" badge shown in toolbar
- "Sync Changes" label replaces "Render PDF"
- All current projects marked with AI badge in `CVFormBuilder` (indices from `aiRecommendedProjectIndices`)
- "Optimize with Gallery" button available to re-run gallery flow

### History Restore Mode

When `/workspace?id=<uuid>`:
- On mount: fetch `getHistoryItem(historyId)` → populate `cvData`, `jdText`
- "← Back" navigates to history list
- Step 1 click → `/workspace?id=<uuid>&view=jd` — shows JD text panel
- Step 2 click → `/dashboard` — back to analysis dashboard

### Gallery FSM Overlay in Workspace

`GalleryOverlay` component renders as a fixed full-screen modal overlay when `galleryPhase !== 'IDLE'`, showing:
- **ANALYZING** — loading spinner + step progress (same as dashboard flow)
- **CONSULTING_GALLERY** — `ProjectSelectionHub` embedded in overlay
- **FINALIZING** — polling spinner
- **ERROR** — error panel with dismiss button

---

## 13. Build & Deployment

### Build

```bash
cd apps/web
npm install
npm run build
# Output: apps/web/out/ (static HTML/CSS/JS)
```

### Environment Variables

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_API_URL` | Backend API base URL (e.g. `https://api.radiance.app`) |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous (public) key |

All `NEXT_PUBLIC_*` variables are embedded at build time into the static bundle.

### Deployment

```bash
# CI/CD via .github/workflows/frontend-deploy.yml
# 1. npm run build → out/
# 2. aws s3 sync out/ s3://<frontend-bucket>/ --delete
# 3. aws cloudfront create-invalidation --distribution-id <id> --paths "/*"
```

Static files served via CloudFront CDN with `OAC → S3` configuration (no public S3 access).

### WebWorker Build

Next.js 14 automatically bundles `workers/ai.worker.ts` as a separate Web Worker chunk when referenced via `new Worker(new URL('../workers/ai.worker.ts', import.meta.url), { type: 'module' })`.

The Transformers.js models are **not** bundled — they are loaded from HuggingFace Hub at runtime and cached in the browser (`env.useBrowserCache = true`).
