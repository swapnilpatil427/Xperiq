# Visual AI Capabilities — Design Documents

This directory contains the full design specification for Experient's Visual AI capabilities.

## Documents

- [VISUAL_AI_CAPABILITIES.md](./VISUAL_AI_CAPABILITIES.md) — Full design: AI chart generation, image analysis, visual survey questions, Crystal visual agent, privacy framework

## Summary

Visual AI transforms Experient from a text-and-numbers platform into one that understands images, generates charts autonomously, and produces visual reports.

**7 capability areas:**
1. **AI Chart Generation** — Crystal generates any chart from natural language ("Show me NPS by region as a bar chart")
2. **Image Analysis in Surveys** — Crystal analyzes customer-submitted photos (sentiment, objects, quality, OCR)
3. **Visual Survey Builder AI Assist** — Screenshot-to-survey, brand asset analysis
4. **AI Chart Interaction** — "Ask Crystal" on any chart, anomaly markers, predictive overlays
5. **Visual Insight Reports** — Crystal-generated PDF, PPTX, HTML digest
6. **Real-Time Visual Analytics** — Animated gauges, live sentiment heatmaps, response pulse
7. **Video Analysis** (Future) — Transcription + sentiment + key moment extraction

**New survey question types:** Image Upload, Image Choice, Annotation (click-on-image), Emoji Rating

**Key differentiator:** Crystal generates and narrates every visualization. No competitor offers natural language → chart generation in an XM platform.

**Privacy-first:** Default face blurring, PII detection, GDPR-compliant consent for facial analysis.

**Stack:** CrystalOS VisualAnalystAgent + Claude Vision API + Google Vision API + Vega-Lite (chart rendering) + Canvas/WebGL (frontend)
