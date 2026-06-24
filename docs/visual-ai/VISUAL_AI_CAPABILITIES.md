# Visual AI Capabilities — Design Document

**Version:** 1.0  
**Date:** 2026-06-03  
**Status:** Design  
**Team:** Dr. Yuna Park (Applied Scientist, multimodal AI), Nicolas Dubois (Staff ML Engineer), Mei-Ling Zhou (UX Lead), Raj Patel (Frontend, Canvas/WebGL), Omar Abdullah (Backend, FastAPI), Dr. Carmen Rivera (XM Expert, visual feedback), Michael Tanaka (Enterprise Customer), Emma Thompson (Platform Expert), Priscilla Wang (Crystal AI Lead), David Foster (Product)

---

## Table of Contents

1. [Executive Vision](#1-executive-vision)
2. [Visual AI Capability Areas](#2-visual-ai-capability-areas)
3. [Technical Architecture](#3-technical-architecture)
4. [New Survey Question Types](#4-new-survey-question-types)
5. [Frontend Technical Design](#5-frontend-technical-design)
6. [Privacy & Ethics Framework](#6-privacy--ethics-framework)
7. [Crystal AI Prompt Design](#7-crystal-ai-prompt-design)
8. [Backend API Design](#8-backend-api-design)
9. [Database Schema](#9-database-schema)
10. [Competitive Positioning](#10-competitive-positioning)
11. [Implementation Roadmap](#11-implementation-roadmap)
12. [ASCII Wireframes](#12-ascii-wireframes)

---

## 1. Executive Vision

### Why Visual AI Changes Experience Management

> **Dr. Yuna Park (Applied Scientist):** "Text is only a fraction of human experience. A customer who photographs a dirty hotel room is telling us something that words alone cannot fully convey. A product reviewer who uploads an unboxing photo is communicating packaging quality, first impressions, and emotional response simultaneously. Experience management platforms that ignore visual signals are missing half the signal."

> **Michael Tanaka (Head of Digital CX, retail chain):** "Our customers post 800 photos per day on our in-app feedback. Right now those images sit in storage and nobody looks at them. I want Crystal to tell me: are those photos showing happy customers or frustrated ones? Are they showing clean stores or messy ones?"

> **David Foster (Product):** "Every XM platform generates the same charts. Crystal should be able to generate the *right* chart — the one that tells the story the data is trying to tell — without the user having to know what chart type to pick."

### The Vision Statement

**"Experient's Visual AI transforms every image, chart, and visual signal into an experience insight. Crystal sees what your customers see, draws the charts that tell the truth, and generates reports that executives understand at a glance."**

### Core Capabilities

1. **AI Chart Generation** — Crystal draws the right chart from natural language
2. **Image Analysis in Surveys** — analyze what customers photograph
3. **Visual Survey Builder AI Assist** — Crystal helps design better-looking surveys
4. **AI Chart Interaction** — "Ask Crystal about this chart"
5. **Visual Insight Reports** — Crystal-generated PDF/PPT reports
6. **Real-Time Visual Analytics** — animated, live-updating visualizations
7. **Video & Audio Analysis** (Future) — transcription + sentiment + key moment extraction

---

## 2. Visual AI Capability Areas

### 2.1 AI-Generated Data Visualization (Crystal Charts)

Crystal can generate charts autonomously from:
- Natural language query: *"Show me NPS trend by region as a bar chart"*
- Insight output: Crystal selects the visualization that best illustrates what it found
- Report generation: Crystal assembles the best charts for an executive report

**The Natural Language → Chart Pipeline:**

```
User: "Show me NPS trend by region for Q4"
              ↓
Crystal (LLM): Parse intent + identify required data
              ↓
Crystal: SELECT data from analytics API
              ↓  
Crystal: Generate Vega-Lite JSON specification
              ↓
Frontend: Render Vega-Lite chart (react-vega)
              ↓
Crystal: Add annotation: "Southeast NPS is 12pts above Northeast — 
         likely driven by our new regional support team rollout"
```

**Chart Type Selection AI:**
Crystal chooses the right chart for the data:
- Time series → line chart
- Distribution → histogram or box plot
- Comparison → bar chart or grouped bar
- Correlation → scatter plot
- Composition → donut or stacked bar
- Geographic → map (if region data available)
- Topic relationships → bubble chart or network graph

**Visual Insight Cards:**
Crystal generates a self-contained card: chart + headline + 1-sentence explanation. These are the atomic unit of Crystal's visual intelligence:

```
┌─────────────────────────────────────────────┐
│  📊 Crystal Insight                         │
│                                             │
│  [chart rendered here — NPS by region]      │
│                                             │
│  Southeast NPS leads by 12 points           │
│  "Regional support rollout in Q3 correlates │
│   with the Northeast-Southeast divergence   │
│   that appeared in October."                │
│                                      85% ✓  │
└─────────────────────────────────────────────┘
```

### 2.2 Image Analysis in Surveys

Respondents can upload images as part of their survey response. Crystal analyzes those images at multiple levels:

**Per-image analysis:**
- **Object detection**: What's in the photo? (product, food, receipt, facility, person)
- **Sentiment from visual**: Is the environment/product shown positively or negatively?
- **Brand element detection**: Is the company logo present? Correctly used?
- **Quality assessment**: Food quality, facility cleanliness, product condition
- **OCR / text extraction**: Read text from receipts, signage, packaging
- **Facial expression analysis**: Positive/neutral/negative (only with explicit consent + GDPR compliance)
- **Safety flag**: Detect potentially unsafe content (NSFW, violence) and block before storage

**Aggregate analysis (across all survey responses):**
- *"35% of submitted photos show a clean store environment, 12% show cleanliness issues concentrated in the food section"*
- Image clustering: group similar photos together (all receipt photos, all food photos, etc.)
- Trend analysis: are the images getting more positive or negative over time?
- Verbatim-to-image correlation: do respondents who submit images have different NPS scores?

**Example survey question types that use image upload:**
- "Take a photo of your recent purchase packaging"
- "Show us a photo of your experience today"
- "Upload your receipt to receive support"
- "Take a photo of the issue you experienced"

### 2.3 Visual Survey Builder AI Assist

Crystal enhances the survey creation experience with visual intelligence:

**Screenshot-to-Survey:**
- Upload a photo of a paper survey or a screenshot of a competitor survey
- Crystal extracts the questions, formats them as Experient question types
- User reviews and edits before publishing

**Brand Asset Analysis:**
- Upload your brand logo and primary colors
- Crystal configures the survey theme to match
- Crystal checks if the survey design meets accessibility contrast requirements

**Layout Suggestions:**
- Crystal recommends question groupings and page breaks based on survey length
- Crystal flags questions that are visually confusing (e.g., double-barreled, too many scale options)
- Crystal suggests progress bar placement and thank-you page design

### 2.4 AI-Powered Chart Interaction ("Talk to Your Charts")

Every chart in Experient has a Crystal AI overlay mode:

**Crystal explains any chart:**
Click any chart → "Ask Crystal" button → Crystal narrates what the chart shows, what's unusual, and what it means.

**Natural language queries about a chart:**
- "Why is NPS low this month?" → Crystal analyzes contributing factors
- "What drove the spike on May 22?" → Crystal identifies the event/cause
- "How does this compare to industry?" → Crystal adds benchmark context
- "Is this statistically significant?" → Crystal runs significance test and explains

**Crystal anomaly markers:**
Crystal places visual markers on charts at points of interest:
- Red triangle: significant negative anomaly
- Green circle: significant positive event  
- Purple diamond: Crystal's predicted point (future)
- Blue star: externally explained event (e.g., "Product launch happened here")

**Predictive overlays:**
On trend charts, Crystal adds:
- Dashed line: predicted continuation (14 days)
- Shaded band: confidence interval (e.g., 80% CI)
- Tooltip: "Crystal is 82% confident NPS will be between 35-43 by June 15"

### 2.5 Visual Insight Reports

Crystal generates complete visual reports with no human effort:

**Report types:**
- **Executive Brief (PDF, 2 pages)**: Top 5 metrics + Crystal's 3-paragraph narrative + recommended actions
- **Analyst Report (PDF, 8-10 pages)**: Full metric breakdown + topic analysis + verbatim highlights + trend charts + Crystal commentary per section
- **Board Presentation (PPTX, 5 slides)**: Executive-ready slides, brand-themed, Crystal-narrated speaker notes
- **Weekly Digest (HTML email)**: Crystal selects the 3 most important developments + supporting charts

**Crystal-generated report elements:**
- Title: Crystal writes a descriptive title (not "Q4 Report" but "Q4 Results: NPS Holds at 42 Despite Shipping Headwinds")
- Chart selection: Crystal picks the charts that best tell the story
- Caption: Crystal writes a caption for every chart
- Narrative: Crystal writes the full prose narrative
- Recommendations section: Crystal provides 3 specific, actionable recommendations

### 2.6 Real-Time Visual Analytics

Animated, live-updating visualizations for the dashboard:

**Live Sentiment Heatmap:**
- Color-coded grid (rows = hours, columns = days)
- Color updates as new responses arrive
- From green (positive) to red (negative)
- Crystal annotation appears when a cell turns dramatically negative

**Animated NPS Gauge:**
- Speedometer-style gauge
- Needle moves smoothly as NPS updates in real time
- Zone coloring: red (0-29), yellow (30-49), green (50+)
- Crystal tooltip on hover: current drivers

**Response Volume Pulse:**
- Live heartbeat visualization (area chart that breathes with incoming responses)
- Spike animations when volume increases rapidly

**Topic Emergence Cloud:**
- Animated word cloud: new topics fade in as they emerge
- Size grows proportional to mention count
- Color shifts as sentiment changes
- Crystal labels: "New" badge on newly detected topics

### 2.7 Video & Rich Media Analysis (Future — Phase 5+)

**Video Response Analysis:**
- Survey question type: "Record a short video about your experience"
- Crystal pipeline:
  1. Transcribe audio (Whisper API)
  2. Analyze transcript for sentiment + topics (existing Crystal NLP)
  3. Extract key moments (timestamps where sentiment is most intense)
  4. Generate a 30-second highlight clip
  5. Detect facial expressions in video frames (consent required)

**Audio Tone Analysis:**
- Detect customer emotion from voice (frustrated, happy, neutral, confused)
- Complement text sentiment with vocal sentiment
- Useful for voice-of-customer programs, call center integration

---

## 3. Technical Architecture

### 3.1 Vision AI Pipeline

```
┌─────────────────────────────────────────────────────────────────────┐
│                        IMAGE INPUT                                  │
│  [Survey upload]  [Screenshot]  [URL]  [Base64]                     │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      PREPROCESSING                                   │
│  • Resize to max 4096×4096 (API limit)                              │
│  • Format normalization (HEIC → JPEG, WebP → JPEG)                  │
│  • EXIF data strip (remove GPS, device info)                         │
│  • NSFW safety screen (Google Vision SafeSearch)                    │
│  • PII detection (face blur toggle, document detection)             │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    VISION MODEL ROUTING                              │
│                                                                      │
│  Task: General analysis → Claude claude-sonnet-4-6 Vision (default) │
│  Task: Object detection → Google Vision API                         │
│  Task: OCR/Text extraction → Google Vision OCR                      │
│  Task: Face expression → Azure Face API (consent-gated)             │
│  Task: Safety screening → Google Vision SafeSearch                  │
│                                                                      │
│  Routing logic: cost × capability × latency optimization            │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                  CRYSTAL VISUAL ANALYST AGENT                        │
│                  (crystalos/agents/visual_analyst.py)               │
│                                                                      │
│  Tools:                                                              │
│  • analyze_image(url, analysis_type) → ImageAnalysisResult          │
│  • extract_text_from_image(url) → str                               │
│  • detect_objects(url) → list[DetectedObject]                       │
│  • classify_sentiment_from_image(url) → SentimentResult            │
│  • generate_chart(data, chart_type, style) → VegaLiteSpec           │
│  • generate_visual_insight_card(insight) → InsightCard             │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    RESULT STORAGE                                    │
│  • Raw analysis → media_analysis table (Postgres)                   │
│  • Feature vectors → (future: vector DB for similarity search)      │
│  • Generated charts → generated_charts table (Postgres + S3)        │
│  • Visual insights → visual_insights table (Postgres)               │
└─────────────────────────────────────────────────────────────────────┘
```

### 3.2 Crystal VisualAnalystAgent

```python
# crystalos/agents/visual_analyst.py

from langgraph.graph import StateGraph
from pydantic import BaseModel

class VisualAnalysisState(BaseModel):
    image_url: str
    analysis_type: str  # 'survey_response' | 'brand_check' | 'quality_assessment'
    org_context: dict
    results: dict = {}

class VisualAnalystAgent:
    """Crystal agent specialized in image and visual data analysis."""
    
    def __init__(self):
        self.graph = self._build_graph()
    
    async def analyze_image(self, image_url: str, analysis_type: str, context: dict) -> dict:
        """Main entry point for image analysis."""
        state = VisualAnalysisState(
            image_url=image_url,
            analysis_type=analysis_type,
            org_context=context
        )
        return await self.graph.ainvoke(state)
    
    async def generate_chart(self, data: dict, description: str) -> dict:
        """Generate a Vega-Lite chart specification from data + natural language description."""
        prompt = self._chart_generation_prompt(data, description)
        spec = await self.llm.agenerate(prompt)
        return json.loads(spec)  # Returns Vega-Lite JSON
    
    async def generate_insight_card(self, insight: dict) -> dict:
        """Generate a visual insight card (chart + headline + explanation)."""
        chart_spec = await self.generate_chart(insight['data'], insight['description'])
        headline = await self._generate_headline(insight)
        explanation = await self._generate_explanation(insight)
        return {
            'chartSpec': chart_spec,
            'headline': headline,
            'explanation': explanation,
            'confidence': insight.get('confidence', 0.8)
        }
```

### 3.3 Chart Generation: Natural Language → Vega-Lite

The chart generation pipeline converts Crystal's analysis into Vega-Lite specifications that the frontend renders:

```python
CHART_GENERATION_SYSTEM_PROMPT = """
You are a data visualization expert. Given data and a description, generate a Vega-Lite 
JSON specification for the optimal chart. Follow these rules:

1. Choose the chart type that best reveals the pattern described
2. Use Experient's color palette: primary=#6366f1, positive=#22c55e, negative=#ef4444, neutral=#94a3b8
3. Include descriptive axis labels and a clear title
4. Add data transformations if needed (e.g., calculate NPS from counts)
5. Make the chart accessible (colorblind-friendly palettes for categorical data)
6. Output ONLY valid Vega-Lite JSON, no prose

Data schema will be provided. Output must be parseable JSON.
"""
```

Vega-Lite is ideal because:
- Lightweight JSON specification
- Frontend renders with `react-vega` or `vega-embed`
- Crystal can generate it reliably (well-documented, structured)
- Supports export to SVG/PNG
- Works in emails/PDFs

---

## 4. New Survey Question Types

### 4.1 Image Upload Question

**Respondent experience:**
```
┌─────────────────────────────────────────────────────────┐
│  Q4. Take a photo of your experience today              │
│                                                         │
│  ┌───────────────────────────────────────────────────┐  │
│  │                                                   │  │
│  │     [📷 Camera]    [🖼 Upload from library]       │  │
│  │                                                   │  │
│  │     or drag & drop an image here                 │  │
│  │                                                   │  │
│  └───────────────────────────────────────────────────┘  │
│  Max 5 images · JPG, PNG, HEIC · Under 10MB each       │
│                                                         │
│  ☐ Optional question — skip if you prefer              │
└─────────────────────────────────────────────────────────┘
```

After upload (respondent view):
```
┌────────────────────────────────────────────────┐
│  [thumbnail]  ✓ Uploaded                  [×]  │
│  [thumbnail]  ✓ Uploaded                  [×]  │
│  [+] Add another image                         │
│                                                │
│  🤖 Crystal is analyzing your image...         │
│  (Privacy: your photo is analyzed securely     │
│   and not shared publicly)                     │
└────────────────────────────────────────────────┘
```

**Admin/Analyst experience (image gallery):**
```
┌─────────────────────────────────────────────────────────┐
│  Q4 Images — 147 submissions        [Filter ▾] [Export] │
├─────────────────────────────────────────────────────────┤
│  Crystal Summary:                                       │
│  "62% show clean environments. 18% show cleanliness     │
│  issues (concentrated in food prep areas). 12% show     │
│  signage. 8% show staff interactions."                  │
├─────────────────────────────────────────────────────────┤
│  [img] [img] [img] [img] [img] [img] [img] [img]       │
│  🟢     🔴    🟢    🟢    🔴    🟢    🟡    🟢          │
│                                                         │
│  Filter: [All ▾] [Positive ▾] [Negative ▾]            │
│          [Contains: food ▾] [High NPS respondents ▾]  │
└─────────────────────────────────────────────────────────┘
```

### 4.2 Image Choice Question (Visual Multiple Choice)

```
┌─────────────────────────────────────────────────────────┐
│  Q2. Which of these best describes your experience?     │
│                                                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │
│  │   [image1]  │  │   [image2]  │  │   [image3]  │     │
│  │             │  │             │  │             │     │
│  │  Excellent  │  │    Good     │  │  Needs work │     │
│  └─────────────┘  └─────────────┘  └─────────────┘     │
│       ○                 ○                 ○             │
└─────────────────────────────────────────────────────────┘
```

Crystal enhancement: Crystal can generate the option images from text descriptions if the survey creator provides image prompts. No stock photos required.

Aggregate view: Shows which image was selected most, with Crystal commentary on what the distribution reveals.

### 4.3 Annotation Question (Click-on-Image)

```
┌─────────────────────────────────────────────────────────┐
│  Q5. Click where you had trouble on this screen         │
│                                                         │
│  ┌───────────────────────────────────────────────────┐  │
│  │  [screenshot of product page displayed here]      │  │
│  │                                                   │  │
│  │         ✕ ← respondent clicked here               │  │
│  │                                                   │  │
│  │                                                   │  │
│  └───────────────────────────────────────────────────┘  │
│  Click anywhere on the image to mark the trouble area   │
│  (Click again to remove)                               │
└─────────────────────────────────────────────────────────┘
```

Aggregate view: Heat map of click coordinates overlaid on the image. Crystal identifies what UI element most respondents clicked on (using object detection on the base image).

### 4.4 Emoji/Visual Rating Scale

```
Q3. How are you feeling about your experience?

   😠     😞     😐     😊     😄
    1      2      3      4      5
   [○]    [○]    [○]    [●]    [○]
```

More expressive than a numbered scale, culturally transferable, faster to answer on mobile.

---

## 5. Frontend Technical Design

### 5.1 New UI Components

**`<ImageUploadQuestion>`**
```typescript
interface ImageUploadQuestionProps {
  question: Question;
  maxImages?: number;          // default: 5
  maxSizeMB?: number;          // default: 10
  acceptedFormats?: string[];  // default: ['image/jpeg', 'image/png', 'image/heic', 'image/webp']
  showCrystalAnalysisProgress?: boolean;
  onUpload: (files: File[]) => void;
}
```

Implementation notes:
- Use browser's `FileReader` API for preview
- Upload to backend via multipart form
- Show upload progress per file
- Privacy disclosure shown before first upload (not every time)

**`<VisualInsightCard>`**
```typescript
interface VisualInsightCardProps {
  chartSpec: VegaLiteSpec;    // Crystal-generated Vega-Lite JSON
  headline: string;
  explanation: string;
  confidence: number;          // 0-1
  onAskCrystal?: () => void;  // Opens Crystal panel for this card
  onExport?: (format: 'png' | 'svg' | 'csv') => void;
}
```

**`<ChartWithCrystalAnnotations>`**
Wraps any Recharts component and adds Crystal annotation markers:
```typescript
interface ChartAnnotation {
  date: string;
  type: 'anomaly' | 'prediction' | 'event';
  crystalNote: string;
  confidence: number;
}

interface ChartWithCrystalAnnotationsProps {
  children: React.ReactElement;  // Recharts chart
  annotations: ChartAnnotation[];
  showPrediction?: boolean;
  onAnnotationClick?: (annotation: ChartAnnotation) => void;
}
```

**`<ImageGallery>`**
Grid view of survey-submitted images with Crystal tags:
- Lazy loads images (Intersection Observer)
- Sentiment badge overlay per image (green/yellow/red dot)
- Click → lightbox with Crystal analysis sidebar
- Filter bar (by sentiment, by Crystal-detected object, by NPS score)

**`<AnimatedNPSGauge>`**
```typescript
// Uses SVG arc + React Spring for smooth animation
// No canvas needed — pure SVG for SEO + accessibility
```

**`<CrystalChartQuery>`**
Natural language → chart generation interface:
```
┌──────────────────────────────────────────────────────────┐
│ 🤖 Ask Crystal to draw a chart                           │
│                                                          │
│ [Show me NPS by region for Q4 as a bar chart_______]    │
│                                             [Generate →] │
│                                                          │
│ Recent:                                                  │
│ • "NPS trend last 90 days" →  [View]                    │
│ • "Topic sentiment by segment" →  [View]                │
└──────────────────────────────────────────────────────────┘
```

### 5.2 Canvas vs SVG vs WebGL

| Use case | Technology | Why |
|----------|-----------|-----|
| Standard charts (line, bar, donut) | SVG (Recharts) | Accessible, scalable, CSS-styleable |
| Topic bubble chart | D3 force (SVG) | Dynamic positioning algorithm |
| Volume heatmap (static) | SVG grid | Simple, exportable |
| Volume heatmap (animated, real-time) | Canvas 2D | Performance for high-frequency updates |
| Annotation question (click tracking) | Canvas 2D | Precise coordinate capture |
| Animated NPS gauge | SVG + React Spring | Smooth, accessible |
| 1000+ point scatter plot | WebGL (deck.gl) | GPU-accelerated for large datasets |

---

## 6. Privacy & Ethics Framework

### 6.1 Image Data Principles

**Default privacy posture:**
- All uploaded images are analyzed server-side only — never stored in the browser
- Images are encrypted at rest (AES-256) and in transit (TLS 1.3)
- Retention: images deleted after configurable period (default: 90 days, aligned with org data retention policy)
- GDPR/CCPA: respondents can request deletion of their uploaded images separately from the response record

**Face detection and blurring:**
- By default: if Crystal detects human faces in uploaded images, faces are automatically blurred before storage
- Survey creators can opt-out of face blurring for use cases where faces are expected (e.g., employee photo submissions)
- Facial expression analysis (sentiment from face): DISABLED by default, requires explicit respondent consent flow + org-level feature flag

**PII detection in images:**
- Crystal scans images for: credit card numbers, government IDs, handwritten personal info, license plates
- Detected PII: image flagged for admin review, PII region pixelated in stored version
- Org admin notified via alert type C-01

### 6.2 Consent Flow for Facial Analysis

When org enables facial expression analysis:

Survey displays before any image question:
```
┌────────────────────────────────────────────────────────┐
│  📷 About your photo submission                        │
│                                                        │
│  With your consent, we'll use AI to analyze the        │
│  visual content of photos you submit, including        │
│  facial expressions if visible.                        │
│                                                        │
│  • Your photos are stored securely                     │
│  • Faces are blurred unless you consent below          │
│  • You can request deletion at any time                │
│                                                        │
│  □ I consent to facial expression analysis            │
│  ■ I do not consent (faces will be blurred)           │
│                                                        │
│                             [Continue →]               │
└────────────────────────────────────────────────────────┘
```

### 6.3 Content Moderation

Safety screening pipeline (runs BEFORE storage):
1. Google Vision SafeSearch API → flag NSFW content
2. If flagged: image blocked, respondent shown error ("Image cannot be processed"), admin notified
3. All safety flags logged for compliance audit

---

## 7. Crystal AI Prompt Design

### 7.1 Image Sentiment Analysis Prompt

```python
IMAGE_SENTIMENT_PROMPT = """
Analyze the sentiment and quality indicators in this image from a customer experience survey.

Provide a JSON response with:
{
  "overall_sentiment": "positive" | "neutral" | "negative",
  "sentiment_score": float,  // -1.0 to 1.0
  "key_observations": [str],  // up to 3 specific observations
  "detected_objects": [str],  // what's visible in the image
  "quality_indicators": {
    "cleanliness": "high" | "medium" | "low" | "not_applicable",
    "organization": "high" | "medium" | "low" | "not_applicable",
    "professional_presentation": "high" | "medium" | "low" | "not_applicable"
  },
  "text_extracted": str | null,  // any text visible in image
  "concerns": [str],  // any concerning elements (safety, quality, etc.)
  "confidence": float  // 0.0 to 1.0
}

Be specific and objective. Do not make assumptions beyond what is visible.
"""
```

### 7.2 Chart Generation Prompt

```python
CHART_GENERATION_PROMPT = """
You are a data visualization expert. Generate a Vega-Lite JSON specification.

User request: {user_request}

Available data:
{data_schema}

Sample data:
{data_sample}

Rules:
1. Choose the most effective chart type for this data and request
2. Use these colors: positive=#22c55e, negative=#ef4444, neutral=#94a3b8, primary=#6366f1
3. Make it readable without a legend when possible
4. Add a descriptive title (not just the metric name — tell the insight)
5. Include only axes, marks, and encodings required by the chart
6. Output ONLY valid Vega-Lite JSON v5 schema

Available chart types: bar, line, area, point, arc (donut/pie), rect (heatmap), rule, tick
"""
```

### 7.3 Visual Insight Card Generation Prompt

```python
VISUAL_INSIGHT_CARD_PROMPT = """
Generate a visual insight card from the following analysis result.

Analysis: {insight_data}

Create:
1. A chart specification (as Vega-Lite JSON) that best visualizes the key finding
2. A headline (max 10 words, describes what's interesting, not just what's shown)
3. A one-sentence explanation (references specific numbers, explains significance)

Format:
{
  "chart_spec": { ... Vega-Lite JSON ... },
  "headline": "Southeast NPS leads by 12 points",
  "explanation": "The regional gap widened in Q4 correlating with the new support team rollout in October.",
  "cta": "See what drove the Southeast improvement →"
}
"""
```

### 7.4 "Explain This Chart" Prompt

```python
EXPLAIN_CHART_PROMPT = """
You are analyzing the following chart for a CX/XM professional.

Chart type: {chart_type}
Chart title: {chart_title}
Current data: {chart_data}
Current filter: {filter_context}

User question: {user_question}

Provide a clear, specific answer:
- Reference actual numbers from the data
- Identify the most interesting pattern or anomaly
- Suggest one action the user could take based on this information
- Keep your response under 150 words
- Write for a business audience (avoid technical jargon)
"""
```

---

## 8. Backend API Design

### 8.1 New Endpoints

```
POST /api/visual/analyze                  -- submit image for Crystal analysis
GET  /api/visual/analysis/:id            -- get analysis result (polling or webhook)
POST /api/visual/generate-chart          -- generate chart from data + description
POST /api/visual/generate-report         -- generate full visual report (PDF/PPTX)
GET  /api/surveys/:id/images             -- get all submitted images for a survey
GET  /api/surveys/:id/images/analysis    -- Crystal's aggregate analysis of all images
POST /api/visual/explain-chart           -- Crystal explains a chart (Q&A)
POST /api/visual/chart-query             -- natural language → chart (Crystal Draws)
```

### 8.2 Endpoint Details

**`POST /api/visual/analyze`**
```json
// Request
{
  "imageUrl": "https://storage.../uploads/org-1/survey-abc/resp-123/image1.jpg",
  "analysisType": "survey_response",
  "context": {
    "surveyId": "abc123",
    "questionId": "q4",
    "respondentNps": 4
  },
  "options": {
    "extractText": true,
    "detectObjects": true,
    "analyzeSentiment": true,
    "blurFaces": true
  }
}

// Response (async — returns job ID immediately)
{
  "analysisId": "vis-uuid",
  "status": "queued",
  "estimatedMs": 8000
}
```

**`POST /api/visual/generate-chart`**
```json
// Request
{
  "description": "Show NPS trend by region for Q4 as a bar chart",
  "data": {
    "columns": ["region", "nps", "responseCount"],
    "rows": [["Northeast", 38, 423], ["Southeast", 50, 312], ...]
  },
  "style": "default"  // "default" | "executive" | "brand"
}

// Response
{
  "chartSpec": { ...Vega-Lite JSON... },
  "chartId": "chart-uuid",
  "headline": "Southeast NPS Leads All Regions by 12 Points",
  "explanation": "The Southeast region outperforms the Northeast by 12 NPS points in Q4.",
  "exportUrls": {
    "png": "/api/visual/charts/chart-uuid/png",
    "svg": "/api/visual/charts/chart-uuid/svg"
  }
}
```

**`POST /api/visual/chart-query`** (Natural language → chart)
```json
// Request
{ "query": "Show me NPS trend by region for the last 90 days" }

// Response
{
  "interpretation": "NPS trend over 90 days, broken down by geographic region",
  "dataQuery": "SELECT region, date_trunc('week', submitted_at) as week, calculated_nps FROM ...",
  "chartSpec": { ...Vega-Lite JSON... },
  "headline": "...",
  "confidence": 0.91
}
```

---

## 9. Database Schema

```sql
-- Survey media submissions (images, video, audio)
CREATE TABLE survey_media (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id),
  survey_id       UUID NOT NULL REFERENCES surveys(id),
  response_id     UUID REFERENCES responses(id),
  question_id     TEXT NOT NULL,
  
  media_type      VARCHAR(16) NOT NULL,  -- 'image' | 'video' | 'audio'
  original_url    TEXT NOT NULL,          -- Firebase Storage URL
  processed_url   TEXT,                   -- URL after processing (faces blurred, etc.)
  
  file_size_bytes BIGINT,
  mime_type       VARCHAR(64),
  width_px        INTEGER,
  height_px       INTEGER,
  
  -- Privacy
  faces_blurred   BOOLEAN DEFAULT TRUE,
  pii_detected    BOOLEAN DEFAULT FALSE,
  safety_flagged  BOOLEAN DEFAULT FALSE,
  consent_given   BOOLEAN DEFAULT FALSE,  -- for facial expression analysis
  
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);

CREATE INDEX idx_survey_media_survey ON survey_media(survey_id, created_at DESC);
CREATE INDEX idx_survey_media_response ON survey_media(response_id);


-- Crystal analysis results for individual media items
CREATE TABLE media_analysis (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  media_id        UUID NOT NULL REFERENCES survey_media(id),
  
  analysis_type   VARCHAR(32) NOT NULL,   -- 'sentiment' | 'objects' | 'text' | 'face'
  
  -- Results
  overall_sentiment   VARCHAR(16),        -- 'positive' | 'neutral' | 'negative'
  sentiment_score     DECIMAL(4, 3),      -- -1.000 to 1.000
  
  detected_objects    TEXT[],
  extracted_text      TEXT,
  
  quality_indicators  JSONB DEFAULT '{}',
  concerns            TEXT[],
  
  raw_result      JSONB DEFAULT '{}',     -- Full model output
  confidence      DECIMAL(4, 3),
  model_used      VARCHAR(64),            -- which vision model was used
  
  status          VARCHAR(16) NOT NULL DEFAULT 'pending',  -- pending|complete|failed
  error_message   TEXT,
  
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at    TIMESTAMPTZ
);

CREATE INDEX idx_media_analysis_media ON media_analysis(media_id);
CREATE INDEX idx_media_analysis_status ON media_analysis(status, created_at);


-- Aggregate visual insights (Crystal's analysis across all images in a survey)
CREATE TABLE visual_insights (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id),
  survey_id       UUID NOT NULL REFERENCES surveys(id),
  question_id     TEXT,
  
  image_count     INTEGER NOT NULL,
  
  -- Aggregate findings
  sentiment_breakdown     JSONB,   -- {positive: 0.62, neutral: 0.20, negative: 0.18}
  top_objects             TEXT[],  -- most common detected objects
  quality_summary         JSONB,   -- aggregate quality indicators
  emerging_themes         TEXT[],  -- Crystal-detected visual themes
  
  crystal_narrative       TEXT,    -- Crystal's prose summary of the images
  
  generated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  UNIQUE(survey_id, question_id)
);


-- Crystal-generated charts (stored for reuse and history)
CREATE TABLE generated_charts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id),
  
  query           TEXT,           -- original natural language query
  vega_lite_spec  JSONB NOT NULL, -- the chart specification
  
  headline        TEXT,
  explanation     TEXT,
  
  png_url         TEXT,           -- pre-rendered PNG for emails/PDFs
  svg_url         TEXT,
  
  data_snapshot   JSONB,          -- the data used to generate the chart (for reproducibility)
  filter_state    JSONB,          -- the filter context when generated
  
  created_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_generated_charts_org ON generated_charts(org_id, created_at DESC);
```

---

## 10. Competitive Positioning

| Capability | Qualtrics | Medallia | Dovetail | UserTesting | **Experient** |
|------------|-----------|----------|----------|-------------|---------------|
| Image upload in surveys | ✓ | Partial | ✓ | ✓ | ✓ |
| AI image sentiment analysis | ✗ | ✗ | Partial | ✗ | **✓ Crystal** |
| AI-generated charts | ✗ | ✗ | ✗ | ✗ | **✓ Crystal** |
| Natural language → chart | ✗ | ✗ | ✗ | ✗ | **✓ Crystal Unique** |
| Chart annotation by AI | ✗ | ✗ | ✗ | ✗ | **✓ Crystal Unique** |
| Predictive chart overlays | ✗ | ✗ | ✗ | ✗ | **✓ Crystal Unique** |
| "Ask AI about chart" | Limited | ✗ | ✗ | ✗ | **✓ Crystal** |
| AI-generated reports/PPT | ✓ | Partial | ✗ | ✗ | **✓ Crystal** |
| Image annotation question | ✗ | ✗ | ✓ | ✓ | ✓ |
| Video response analysis | ✗ | ✗ | ✓ | ✓ | Future |
| Privacy-first face blurring | ✗ | ✗ | ✗ | ✗ | **✓ Default** |

**Category-defining capabilities:**
1. Crystal generates any chart from natural language — no other XM platform does this
2. Crystal narrates every chart it generates AND every existing chart
3. Image analysis is integrated into the insight pipeline — not siloed
4. Privacy-by-default face blurring is unique in the market
5. Visual insight cards (chart + headline + explanation) as atomic Crystal outputs

---

## 11. Implementation Roadmap

### Phase 1 — AI Chart Generation (Weeks 1-3)
- [ ] Crystal chart generation tool (Vega-Lite JSON output)
- [ ] `POST /api/visual/generate-chart` endpoint
- [ ] `<VisualInsightCard>` React component
- [ ] Crystal Draws interface (`<CrystalChartQuery>`)
- [ ] Chart export (PNG, SVG)
- [ ] `generated_charts` database table

### Phase 2 — Chart Intelligence (Weeks 4-6)
- [ ] Crystal anomaly annotations on existing charts
- [ ] Chart predictive overlay (dashed line + confidence band)
- [ ] "Ask Crystal about this chart" panel
- [ ] Crystal chart narration (explain any chart on demand)
- [ ] `POST /api/visual/explain-chart` endpoint

### Phase 3 — Image Upload Questions (Weeks 7-9)
- [ ] `<ImageUploadQuestion>` survey component
- [ ] Image preprocessing pipeline (resize, EXIF strip, format normalize)
- [ ] Safety screening (Google Vision SafeSearch)
- [ ] `survey_media` and `media_analysis` database tables
- [ ] `POST /api/visual/analyze` async endpoint
- [ ] Privacy disclosure flow

### Phase 4 — Image Analytics Dashboard (Weeks 10-12)
- [ ] `<ImageGallery>` component
- [ ] Crystal aggregate analysis of survey images
- [ ] `GET /api/surveys/:id/images/analysis` endpoint
- [ ] Image annotation question type (click-on-image heatmap)
- [ ] PII detection + face blurring in pipeline

### Phase 5 — Advanced Vision (Months 4-6)
- [ ] Object detection (Google Vision API integration)
- [ ] OCR / text extraction from images
- [ ] Facial expression analysis (with consent flow)
- [ ] Image clustering (group similar photos)
- [ ] Crystal image-to-insight narrative generation

### Phase 6 — Video Analysis (Months 6+)
- [ ] Video response question type
- [ ] Audio transcription (Whisper API)
- [ ] Video sentiment analysis
- [ ] Key moment extraction
- [ ] Audio tone analysis

---

## 12. ASCII Wireframes

### 12.1 Image Upload Survey Question (Respondent View)

```
┌─────────────────────────────────────────────────────────────────────┐
│  Q4 of 6                                              ●●●●○○  67%  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Take a photo of your recent experience                             │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                                                               │  │
│  │                                                               │  │
│  │         [📷]                    [🖼]                         │  │
│  │     Take a photo            Upload image                     │  │
│  │                                                               │  │
│  │              — or drag & drop here —                         │  │
│  │                                                               │  │
│  └───────────────────────────────────────────────────────────────┘  │
│  JPG, PNG, HEIC up to 10MB per image · Up to 5 images              │
│                                                                     │
│  🔒 Images are analyzed privately and never shared publicly         │
│                                                                     │
│  ──────────────────── Skip this question ──────────────────────    │
│                                                   [Next →]          │
└─────────────────────────────────────────────────────────────────────┘
```

### 12.2 Image Gallery in Analyst View

```
┌───────────────────────────────────────────────────────────────────────┐
│  Q4 Images — 147 submissions         [Filter ▾]  [Export CSV]         │
├───────────────────────────────────────────────────────────────────────┤
│  🤖 Crystal Summary                                                   │
│  "Of 147 submitted images, 62% show positive environments (clean,     │
│  well-organized). 18% show concerns (primarily in the food prep       │
│  area — 26 photos). 12% contain signage. Top detected objects:        │
│  food (44%), packaging (31%), staff (18%), store interior (7%)."      │
│  [View full analysis →]                                               │
├───────────────────────────────────────────────────────────────────────┤
│  [All] [Positive 🟢 91] [Neutral 🟡 27] [Negative 🔴 29]  [Search]   │
├──────┬──────┬──────┬──────┬──────┬──────┬──────┬──────┬──────┬──────┤
│ [img]│ [img]│ [img]│ [img]│ [img]│ [img]│ [img]│ [img]│ [img]│ [img]│
│  🟢  │  🔴  │  🟢  │  🟢  │  🔴  │  🟢  │  🟡  │  🟢  │  🔴  │  🟢  │
│      │      │      │      │      │      │      │      │      │      │
│ [img]│ [img]│ [img]│ [img]│ [img]│ [img]│ [img]│ [img]│ [img]│ [img]│
│  🟢  │  🟢  │  🔴  │  🟡  │  🟢  │  🟢  │  🔴  │  🟢  │  🟢  │  🟡  │
├──────┴──────┴──────┴──────┴──────┴──────┴──────┴──────┴──────┴──────┤
│  [1] [2] [3] ... [15]    Showing 1-20 of 147                         │
└───────────────────────────────────────────────────────────────────────┘
```

### 12.3 Crystal Chart Query Interface

```
┌─────────────────────────────────────────────────────────────────────┐
│  🤖 Crystal Draws                                          [×]      │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Ask Crystal to create a chart:                                     │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ Show me NPS trend by region for Q4 as a bar chart          │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                     [Generate →]   │
│                                                                     │
│  ─────────────────────────────────────────────────────────────     │
│                                                                     │
│  🤖 Here's your chart:                                              │
│                                                                     │
│  "Southeast NPS Leads All Regions by 12 Points"                    │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  NE  ████████████████████████████████████     38           │   │
│  │  SE  ████████████████████████████████████████████████  50  │   │
│  │  MW  ██████████████████████████████████████     44         │   │
│  │  SW  █████████████████████████████████████████   47        │   │
│  │  W   ████████████████████████████████████████    46        │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  "The Northeast region lags by 12 NPS points. Crystal attributes   │
│  this gap to higher 'long wait times' mention rates in NE (31%    │
│  vs 8% in other regions)."                                         │
│                                                                     │
│  [Add to Dashboard]  [Export PNG]  [Ask follow-up...]              │
└─────────────────────────────────────────────────────────────────────┘
```

### 12.4 Visual Insight Card

```
┌────────────────────────────────────────────────────────┐
│  📊 Crystal Insight                     [🤖 Ask] [⤡]  │
│  ─────────────────────────────────────────────────────  │
│                                                        │
│  NPS TREND WITH CRYSTAL ANNOTATIONS                    │
│                                                        │
│  50 ┤    ╭────╮    ╭──                                │
│  45 ┤   ╭╯    ╰───╯  ╰──── ▲  ▲                      │
│  40 ┤──╮╯                  ╱                          │
│  35 ┤  ╰───────────────────                           │
│     └───────────────────────────                      │
│       Apr   May    Jun (pred)                         │
│                                                        │
│  ▲ = Crystal anomaly marker                           │
│  — = Crystal prediction (dashed)                      │
│                                                        │
│  ─────────────────────────────────────────────────────  │
│  Shipping Delays Are Driving the NPS Decline           │
│                                                        │
│  "The May 22 drop corresponds to a 3× spike in         │
│  shipping delay verbatims. Crystal predicts NPS        │
│  will stabilize if delays resolve within 2 weeks."     │
│                                                        │
│  Confidence: 85%                   [View full insight] │
└────────────────────────────────────────────────────────┘
```

---

*Document prepared by the Visual AI Capabilities cross-functional team — Experient Platform Design Series, June 2026.*
