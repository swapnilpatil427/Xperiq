# Experient Support Site — Comprehensive Design Prompt
## Complete Visual, Interaction, and Content Design Reference

**Version:** 2.0 (Upgraded)
**Date:** June 2026
**URL:** support.experient.ai
**Purpose:** Complete design specification — sufficient for v0.dev, Bolt.new, Framer, or a senior frontend engineer to implement without asking questions.

---

## PART 1: DESIGN FOUNDATIONS

### Brand Identity

The Experient support site extends the main platform's visual identity. Every design decision — spacing, color, motion, typography — must feel continuous with the app at `app.experient.ai`. A visitor who uses the product and then visits the support site should feel no jarring transition.

- **Primary color:** Indigo — `#6366f1` / `indigo-500` in Tailwind
- **Tertiary color:** Purple — `#a855f7` / `purple-500` in Tailwind
- **Background:** Near-black `#0a0a14` — the default in dark mode; this is not pure black; the slight indigo tint keeps it on-brand
- **Surface (cards, panels):** `#12121f` — one step lighter than the background; glass cards layer on top of this
- **Border:** `rgba(255,255,255,0.08)` — the standard resting border for all glass elements; subtle enough to be invisible at a glance but visible on inspection
- **Text primary:** `rgba(255,255,255,0.95)` — near-white, not pure white; the 5% transparency prevents harshness on OLED screens
- **Text secondary:** `rgba(255,255,255,0.55)` — for metadata, labels, captions, and supporting copy
- **House ease curve:** `cubic-bezier(0.22, 1, 0.36, 1)` — this is the animation signature of the platform; it starts fast and decelerates into a gentle overshoot that reads as confident and alive. Every transition that represents "arrival" or "reveal" uses this curve.
- **Font:** Inter variable (loaded via `next/font` or equivalent). System-ui is the fallback. Never fall back to Arial or Helvetica.
- **Body size:** 15px / line-height 1.65 — slightly larger than typical body copy because support content is dense and read under cognitive load
- **Code font:** JetBrains Mono, with a monospace fallback. Used in all code blocks and inline code spans. 13px for blocks, 13px inline.
- **Heading scale:** H1 52px hero / 36px article; H2 24px; H3 18px; H4 13px uppercase with letter-spacing 0.08em for labels and section dividers

All sizes above are `rem`-convertible. At 16px root: 52px = 3.25rem, 36px = 2.25rem, 24px = 1.5rem, 18px = 1.125rem, 15px = 0.9375rem. Use `rem` in production CSS.

### Glass-Card Pattern

The glass-card is the primary surface component of the support site. It appears as category cards, article cards, trust badges, Crystal answer panels, the cookie banner, and numerous inline UI elements. It must be implemented consistently — not "approximately."

```css
.glass-card {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 16px;
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.3);
  transition:
    border-color 200ms cubic-bezier(0.22, 1, 0.36, 1),
    box-shadow 200ms cubic-bezier(0.22, 1, 0.36, 1),
    transform 200ms cubic-bezier(0.22, 1, 0.36, 1);
}

.glass-card:hover {
  border-color: rgba(99, 102, 241, 0.3);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(99, 102, 241, 0.1);
  transform: translateY(-1px);
}
```

The `backdrop-filter` is critical — without it the card reads as a flat panel, not a glass layer. Always ensure the element has a non-transparent ancestor positioned behind it (the `#0a0a14` body background provides this). In Safari, always include `-webkit-backdrop-filter`.

Hover behavior must not be jarring. The `border-color` shift from `rgba(255,255,255,0.08)` to `rgba(99,102,241,0.3)` is subtle — indigo but translucent. The `translateY(-1px)` is a 1-pixel lift, not a dramatic scale. This communicates interactivity without distracting.

### Three.js Hero Background

The hero background is the most visually distinctive element of the support site. It establishes that this is not a generic Zendesk clone — it is part of the Experient product family.

- **Particle count:** 1,800 particles. Below 1,000 looks sparse; above 2,500 causes frame drops on mid-range hardware.
- **Colors:** Each particle randomly assigned either `#6366f1` (indigo-500) or `#a855f7` (purple-500), with opacity between 0.4 and 0.8 (randomized per particle at initialization)
- **Particle size:** 1.0–2.0px (randomized). Use `THREE.PointsMaterial` with `sizeAttenuation: true` so depth creates natural size variation.
- **Drift:** Rotation at 0.0003 radians per frame around the Y axis. This is slow enough to be atmospheric — not a spinning screensaver.
- **Fog:** Exponential fog. Color matches background `#0a0a14`. Density `0.0018`. This naturally fades distant particles into the background, creating depth without any custom distance calculations.
- **Canvas:** Fills full viewport, `position: fixed`, `z-index: 0`. All page content is `position: relative; z-index: 10` or higher.
- **Responsive:** Canvas resizes via `ResizeObserver` on the window. Camera aspect ratio updates on resize. No interaction (mouse parallax or click effects) required or desired — this is ambient, not interactive.
- **Performance budget:** Target 60fps on a MacBook Air M1. On mobile (< 768px), reduce to 900 particles. Measure with `stats.js` during development.
- **Accessibility:** When `prefers-reduced-motion: reduce` is active, the Three.js canvas is `display: none`. Replace it with a static CSS gradient: `background: radial-gradient(ellipse at 30% 40%, rgba(99,102,241,0.15) 0%, transparent 60%), radial-gradient(ellipse at 70% 60%, rgba(168,85,247,0.1) 0%, transparent 60%), #0a0a14`. This gradient provides visual interest without animation.

---

## PART 2: LAYOUT SYSTEM

### Global Navbar (sticky, height: 56px)

The navbar is present on every page. It is minimal by design — the support site is not a marketing site, and the navbar should not fight with content for attention.

- **Logo:** "experient" wordmark on the far left. 20px Inter 600, white. The wordmark is lowercase — never title-case. If a logomark SVG is available, place it 24px to the left of the wordmark; otherwise wordmark alone is sufficient.
- **Center area:** Empty on desktop. The center of the navbar should be clean negative space. Do not add navigation links, search bar, or breadcrumbs to the center.
- **Right side elements (left to right):** Sun/Moon toggle icon (20px) → Globe language icon (20px) → "Sign In" ghost button → "Get Started" filled indigo button
- **Background:** `rgba(10,10,20,0.85)` with `backdrop-filter: blur(20px)`. At rest (scroll = 0), the border-bottom is `rgba(255,255,255,0.06)`. At scroll > 10px, border-bottom transitions to `rgba(255,255,255,0.12)` in 200ms. This communicates that content is scrolling behind the navbar.
- **Height:** Always 56px. Never let the navbar grow taller on any breakpoint. On mobile, the right-side CTA buttons collapse — show only the globe and the account avatar (or sign-in icon if anonymous).
- **Mobile navbar:** Logo left, hamburger icon right (three lines, 20px). Hamburger opens a full-height drawer from the right side. Drawer is a glass panel.
- **Logged-in state:** "Sign In" and "Get Started" buttons are replaced by a small chip showing "Signed in as [Org Name]" (13px, rgba(255,255,255,0.6)) and a 28px avatar circle. The avatar shows initials if no profile image is set.

### Homepage Hero

The homepage hero is the full emotional statement of the support site. It must feel alive (Three.js), focused (single H1), and immediately useful (Crystal input).

- **Height:** `100svh` — use the Small Viewport Height unit to handle mobile browser chrome correctly. On desktop browsers this is equivalent to `100vh`.
- **Background:** Three.js particle canvas (see Part 1). Content sits above via z-index.
- **Content column:** `max-width: 640px`, centered horizontally and vertically with flexbox. `padding: 0 24px` on mobile.
- **H1:** "Support that knows your data" — 52px Inter 700, `color: rgba(255,255,255,0.95)`. Line height 1.15. No text shadow. The message is direct: Crystal knows the user's org data, not generic docs.
- **Subtitle:** "Crystal answers from your Experient account. Docs that write themselves. Human escalation in one click." — 18px Inter 400, `rgba(255,255,255,0.65)`. Line height 1.6. Maximum 2 lines on desktop.
- **Vertical spacing:** H1 → subtitle gap: 20px. Subtitle → CTAs gap: 32px. CTAs → Crystal input gap: 24px. Crystal input → trust row gap: 20px.
- **Primary CTA:** "Start Free Trial" — filled indigo pill button, 48px height, horizontal padding 24px, border-radius 24px, font 15px semibold. Appears ONLY on this hero section — never on any other page. See Part 4 for full CTA rules.
- **Secondary CTA:** "Browse docs →" — ghost white link. No background, no border. `rgba(255,255,255,0.7)` at rest, `rgba(255,255,255,1)` on hover. The arrow is a unicode rightward arrow or SVG — not an emoji.
- **CTA layout:** Both CTAs on the same row, `gap: 16px`, centered. On mobile: stack vertically, full-width for the primary CTA.

### Unified Crystal Input Field

The Crystal input is the primary interaction point on the support site. It appears in the hero and in the Crystal panel. The design must be consistent across both contexts.

- **Width:** 100%, `max-width: 580px`, horizontally centered
- **Height:** 56px
- **Background:** `rgba(255,255,255,0.06)` — faintly lighter than the page background; a subtle glass effect
- **Border:** `1.5px solid rgba(255,255,255,0.12)` at rest
- **Border-radius:** 28px (pill shape — half of height)
- **Focus state:** Border transitions to `rgba(99,102,241,0.6)` in 150ms. Box shadow adds an outer glow: `0 0 0 3px rgba(99,102,241,0.15)`. The transition uses ease-in-out.
- **Left icon:** Crystal sparkle SVG icon, 18px, `#6366f1` (indigo). Vertically centered, `padding-left: 16px`. Do not substitute a search magnifier icon — the sparkle specifically signals AI.
- **Placeholder text:** Cycles every 4 seconds between the following strings using a fade cross-transition (300ms ease-out fade out, 300ms ease-in fade in):
  1. "How do I configure SAML SSO?"
  2. "Why did my NPS drop this week?"
  3. "What's left in my credit plan?"
  4. "How do I set up a webhook?"
  5. "Can Crystal analyze my latest survey?"
  The cycling is implemented by toggling a CSS `opacity` transition on the placeholder span. The input never shows all options simultaneously — only one at a time.
- **Right side:** Filled indigo circle button, 36px diameter, centered vertically, `margin-right: 10px`. Contains an SVG arrow (→) or send icon, white, 16px. Disabled state when input is empty: `opacity: 0.4`. Enabled (text entered): `opacity: 1`, hover lifts slightly.
- **No visible label above the input.** The placeholder communicates the purpose. Accessible `aria-label="Ask Crystal a question"` on the input element.
- **Keyboard behavior:** Enter key submits. Shift+Enter inserts a newline (the input is single-line on the hero, multi-line in the Crystal panel).

### Footer

The footer appears on every page. It is the last thing a visitor reads and should reinforce trust.

- **Layout:** 3-column grid on desktop (≥1024px), 2-column on tablet (768–1023px), single column on mobile
- **Column 1 — About:** The "experient" wordmark (16px, Inter 600). A one-line tagline: "AI-powered experience intelligence." Social links: LinkedIn icon (20px, SVG), Twitter/X icon (20px, SVG). Icons are `rgba(255,255,255,0.4)` at rest, `rgba(255,255,255,0.8)` on hover.
- **Column 2 — Resources:** Links: Status page, Changelog, API Reference, Careers. Each link is 14px, `rgba(255,255,255,0.6)` at rest, `rgba(255,255,255,0.9)` on hover. Section header is 11px uppercase, letter-spacing 0.1em, `rgba(255,255,255,0.35)`.
- **Column 3 — Legal:** Links: Privacy Policy, Terms of Service, Cookie Policy, DPA, Security. Same styling as Resources column.
- **Bottom bar:** A 1px horizontal rule `rgba(255,255,255,0.06)` above it. Contains: "© 2026 Experient, Inc." (13px, `rgba(255,255,255,0.35)`) | `legal@experient.ai` (13px, indigo link) | SOC 2 badge | GDPR badge. Laid out as a flex row, space-between on desktop, stacked on mobile.
- **Background:** `#080810` — slightly darker than the page background to anchor the page visually
- **Top padding:** 64px. Bottom padding: 48px.
- **Security preview card:** A glass card spanning all 3 columns, positioned above the main footer columns. See Part 3 for full specification.

---

## PART 3: TRUST SIGNALS DESIGN

Trust signals are critical for enterprise buyers evaluating Experient. The support site is often the first deep exposure a prospect has with the product brand. Every trust element must be precise, honest, and non-generic.

### SOC 2 Type II Badge

SOC 2 Type II certification is the most important enterprise trust signal. Display it prominently and correctly.

- **Placement locations:** (1) Homepage hero trust row below the Crystal input, (2) footer bottom bar, (3) `/legal/security` page header
- **Visual design:** Shield SVG icon, 24px, `stroke: #6366f1`, `stroke-width: 1.5`, no fill (outline style). To the right of the icon: "SOC 2 Type II" in 12px Inter 600, `rgba(255,255,255,0.9)`.
- **Container:** Background `rgba(255,255,255,0.04)`, border `1px solid rgba(99,102,241,0.25)`, border-radius 8px, padding `6px 12px`, display inline-flex, align-items center, gap 6px.
- **Hover:** A tooltip appears 4px above the badge after a 300ms delay: "Audited annually. Download report on our Security page." The tooltip is a small glass card, `font-size: 12px`, `max-width: 220px`, centered above the badge.
- **Tooltip arrow:** A small 6px triangle pointing downward, matching the tooltip background. The tooltip fades in at 200ms, fades out at 150ms.
- **Implementation note:** Never use a third-party badge image, a raster PNG, or a downloaded compliance logo. This badge is entirely SVG + CSS. Raster images degrade at high DPI and look unprofessional.

### GDPR Compliant Badge

Same visual language as the SOC 2 badge, differentiated by icon and label.

- **Icon:** Lock SVG (24px, outline style, indigo stroke). The lock communicates privacy and data protection.
- **Label:** "GDPR Compliant" — 12px Inter 600
- **Container:** Identical treatment to SOC 2 badge
- **Hover tooltip:** "Your data rights are protected under GDPR Article 28. Learn more."
- **Links to:** `/legal/privacy` — clicking the badge (not just the tooltip) navigates to the privacy policy

### Uptime SLA Display

The uptime SLA display communicates platform reliability in real-time.

- **Placement:** Homepage hero trust row only. Does not appear in the footer or on article pages.
- **Layout:** Three elements in a row: (1) Animated pulse dot — 8px circle, `#22c55e` (green-500). The pulse is a CSS keyframe: scale 1.0 → 1.6 → 1.0 over 2 seconds, infinite. The outer ring fades from opacity 0.6 → 0. (2) Text: "99.9% uptime" in 13px, `rgba(255,255,255,0.8)`. (3) Linked text "→ Status" in 13px, `#6366f1` with underline on hover.
- **Status link:** Opens `/status` in a new tab (the status page may be an embedded Instastatus or BetterStack widget)
- **When there is an active incident:** The dot color changes to `#f59e0b` (amber-400), the text changes to "Investigating incident", and the "→ Status" link becomes more prominent.

### "AI-drafted, human-reviewed" Badge

This badge is a transparency commitment. It appears only on Crystal-generated content — never on human-authored articles. Its purpose is to signal honesty, not to undermine trust.

- **Visual:** A small chip, display inline-flex, align-items center, gap 4px
- **Background:** `rgba(255,255,255,0.06)`, border `1px solid rgba(255,255,255,0.1)`, border-radius 6px, padding `3px 8px`
- **Icon:** Clock SVG, 14px, `rgba(255,255,255,0.5)`
- **Text:** "AI-drafted · Reviewed [date]" — 11px Inter 400, `rgba(255,255,255,0.5)`. The date is the last human review date, formatted as "Jun 2026" (no full date — month + year is sufficient for trust).
- **Placement:** Top-right area of article card (small chip overlay) AND top of article page body (below the metadata row). The two placements use the same visual component.
- **Absent on:** All human-written content. The absence of the badge implies human authorship.

### Customer Count Display

A simple social proof signal — no logos, no company names without permission.

- **Text:** "Trusted by 2,400+ enterprise teams"
- **Typography:** 13px Inter 400, `rgba(255,255,255,0.5)`, weight 400
- **No logos.** Never display company logos, customer names, or brand marks without explicit written permission from each company's legal/marketing team.
- **Placement:** Homepage hero trust row, inline with badges

### Trust Row Layout

The trust row sits below the Crystal input field in the homepage hero. It is the final element in the hero section before the scrollable content begins.

- **Layout:** `display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 0; column-gap: 24px; row-gap: 12px`
- **Separators:** Between each item, a `1px` vertical line `rgba(255,255,255,0.1)`, height 16px, centered vertically. Implemented as `::after` pseudo-elements on all but the last child, or as explicit `<span>` dividers.
- **Order:** SOC 2 badge → divider → GDPR badge → divider → Uptime SLA → divider → Customer count
- **Mobile (< 768px):** Items wrap into a 2×2 grid, centered. Vertical dividers become horizontal dividers between rows.
- **Vertical spacing from Crystal input:** 20px margin-top

### Security Page Preview Card

A trust-amplifying card in the site footer, spanning the full footer width above the three content columns.

- **Layout:** Full-width glass card, `margin-bottom: 48px` above the three footer columns
- **Left side:** Shield icon (32px, indigo) + H3 "Enterprise Security" (16px, Inter 600)
- **Bullet list:** Four items in a 2×2 grid on desktop, stacked on mobile: "SOC 2 Type II certified", "GDPR compliant", "Data residency options", "SSO + SCIM provisioning". Each bullet has a checkmark icon (12px, indigo) and text at 14px, `rgba(255,255,255,0.75)`.
- **Right side:** CTA link "View security details →" — 14px, indigo, underline on hover. Links to `/legal/security`.
- **Card padding:** 24px

---

## PART 4: CONVERSION DESIGN (AUTHENTICATED VS. ANONYMOUS)

The support site serves two fundamentally different audiences simultaneously: anonymous visitors who may be prospects, and authenticated users who are customers needing help. The design must serve both without compromising either.

### Anonymous Visitor Mode

Anonymous visitors get the full content experience with a single soft conversion touchpoint per article.

- **Soft CTA placement:** Bottom of discovery articles and guide pages only. Specifically: below the article body, above the "Related articles" / "You might also need" section.
- **CTA text:** "See what Experient can do →"
- **CTA style:** Ghost button — `background: rgba(255,255,255,0.08)`, no border (or very subtle `rgba(255,255,255,0.1)` border), `color: rgba(255,255,255,0.75)`. On hover: background lifts to `rgba(255,255,255,0.12)`, color to white. This is deliberately understated — it must not compete with the article content.
- **Excluded pages (CTA never appears on):** API reference pages, troubleshooting articles, error pages (`/404`, `/500`), Crystal answer panels, escalation forms, all `/legal/` pages, `/status` page. The rule is: if the visitor is in "fix mode" (troubleshooting, escalation, legal review), do not interrupt them with commercial messaging.
- **No pop-ups.** No exit-intent modals. No chat widget floating in the corner. No cookie banner with pre-checked advertising preferences. The support site has zero dark patterns.

### Logged-In User Mode

Authenticated users get a pure support experience. Every commercial element disappears.

- **Zero conversion CTAs** anywhere in the UI — no "Start Free Trial", no "See what Experient can do →", no sidebar promotions.
- **"Start Free Trial" button** is removed from the navbar. The right side of the navbar shows the account chip and avatar instead.
- **Article footers** show only "Related articles" — no conversion prompt below the content.
- **Crystal panel** enters full operational mode: it can read the user's organization data (NPS trends, credit balance, workflow status), execute tool calls, and reference org-specific configuration.
- **Crystal panel header text** changes from "Ask Crystal" to "Hi, [First Name] — what can I help with?" — a personalized greeting that costs nothing to implement and meaningfully changes the interaction tone.
- **Detection:** The frontend reads `useUser()` from Clerk. If the session token is present and valid, the user is authenticated. This check happens client-side on mount with a brief loading state (skeleton) to avoid flash-of-wrong-content.

### "Start Free Trial" Button Rules

This button is the single highest-stakes conversion element. Its placement is deliberate and restricted.

- **Appears on:** Homepage hero only. One instance, one location.
- **Never appears on:** Troubleshooting article pages, API docs, error pages (`/404`, `/500`), Crystal answer panels, escalation forms, all `/legal/` pages, `/status` page, category browse pages (`/guides`), search results page (`/search`).
- **Style spec:** Filled indigo background `#6366f1`, white text, 48px height, horizontal padding 24px, border-radius 24px (pill), font 15px Inter 600. On hover: background lightens to `#818cf8` (indigo-400), `transition: background-color 150ms ease`. On press (`:active`): `transform: scale(0.97)`, 100ms ease-out.

### Visual Distinction Without Jarring

The transition between anonymous and authenticated states must feel seamless, not like a page reload or a jarring layout shift.

- **Logged-in navbar right:** A chip "Signed in as [Org Name]" (13px Inter 400, `rgba(255,255,255,0.6)`) followed by a 28px avatar circle. The avatar background is `rgba(99,102,241,0.25)`, showing 2-character initials in white. If a profile image exists in Clerk, use it as a circular crop.
- **Crystal panel greeting:** The header text personalization ("Hi, [First Name]") is the only logged-in-specific UI change in the Crystal panel. The layout, dimensions, and interactions are identical for anonymous and authenticated users.
- **Layout stability:** No columns appear or disappear. No sections shift. The only changes are text content in the navbar and Crystal panel, and the removal of CTA elements. The grid is identical.

---

## PART 5: LEGAL PAGES DESIGN

### /legal/ Section Overview

Legal pages are reference documents. They must be readable, trustworthy, and findable. Many enterprise procurement teams will spend significant time on these pages.

- **URL prefix:** All legal content lives under `/legal/`
- **Shell layout:** Narrow 720px content column (or 720px left + 240px sticky sidebar TOC = 960px total at ≥1024px). No Three.js. No hero.
- **Navbar and footer:** Same as the rest of the site. Do not strip navigation from legal pages — users need to navigate away without using the back button.
- **Effective date convention:** Every legal document's H1 includes an "Effective date" or "Last updated" date immediately below the title. The date is `rgba(255,255,255,0.4)`, 12px.

### Privacy Policy (/legal/privacy)

Enterprise privacy policies are long and often skipped because they are unreadable. The two-column layout solves this.

- **Two-column layout at ≥1024px:** Left column 40% width (plain English summary in glass card), right column 60% width (full legal text).
- **Left column content:** A numbered list of plain-language summaries: "1. We collect survey responses, account data, and usage analytics.", "2. We use your data to provide services, not to sell it.", "3. We share data only with processors necessary to run the platform.", "4. You can export or delete your data at any time.", etc. Font: 14px Inter 400, `rgba(255,255,255,0.75)`, approachable register. Wrapped in a glass card with `position: sticky; top: 80px` so it stays visible as the user scrolls the right column.
- **Right column:** Full legal text, anchor-navigable sections, 15px paragraph body. Section headers are H2 anchors.
- **Sticky jump links at top of right column:** Horizontal pill nav: "What we collect | How we use it | Who we share with | Your rights | Contact". Each item is a `#anchor` link. The active section's pill becomes indigo-filled.
- **"Last updated" timestamp:** Below the H1, 12px, `rgba(255,255,255,0.4)`
- **Mobile layout:** Left column plain-English summaries collapse into an accordion above the full legal text. The accordion items use the standard glass-card style with a chevron expand indicator.

### Cookie Consent Banner

The cookie banner is a legal requirement and a trust signal. Its design communicates honesty.

- **Position:** Fixed to the bottom of the viewport, full width
- **Style:** Dark glass — `background: rgba(10,10,20,0.92)`, `backdrop-filter: blur(20px)`, `border-top: 1px solid rgba(255,255,255,0.08)`
- **Height:** 56px on desktop, 72px on mobile (taller because buttons stack)
- **Content (desktop, single row):** [Info icon 16px] "We use essential cookies only. No tracking or advertising." | [separator] | "Essential only" button (filled indigo) | "Customize" button (ghost)
- **"Essential only" is pre-selected by default** — the filled button indicates the currently active selection. This is the opposite of a dark pattern (dark patterns pre-select "Accept all"). The filled button communicates: "We've already chosen the most privacy-preserving option for you."
- **"Customize"** opens a secondary panel (same bottom bar, expands to 120px) showing checkboxes: ✓ Essential (always on, disabled checkbox) | ☐ Analytics (unchecked by default). Users can opt into analytics; they cannot opt out of essential.
- **Dismiss:** Clicking either button sets `localStorage.setItem('cookie_consent', 'essential')` or `'analytics'`. The banner animates down and off screen at 300ms with house ease.
- **Appears only on:** First visit (no `cookie_consent` key in localStorage). Never during authenticated sessions.

### Terms of Service (/legal/terms)

- **Layout:** Single column, `max-width: 720px`, centered, no left summary column (ToS is authoritative legal text, not a summary document)
- **Section numbering:** Numeric with dot notation — "1. Acceptance of Terms", "2. Description of Services", etc.
- **Required sections and numbering:**
  1. Acceptance of Terms
  2. Description of Services
  3. Account Registration and Responsibilities
  4. Acceptable Use Policy
  5. Billing, Credits, and Payment
  6. Termination and Suspension
  7. Disclaimer of Warranties
  8. Limitation of Liability
  9. Governing Law and Dispute Resolution
  10. Modifications to Terms
  11. Contact Information
- **Sticky sidebar TOC** at ≥1024px: same component as Privacy Policy sidebar, listing all numbered sections as anchor links
- **"Last updated: [date]"** prominently below H1 — 14px, not in fine print, not in the footer
- **Print stylesheet:** Clean serif font (Georgia or similar), no background colors, no backdrop-filter, black text on white. `@media print { body { font-family: Georgia; color: black; background: white; } }`. Useful for procurement teams who print contracts.

### Security Page (/legal/security)

- **H1:** "Security at Experient"
- **Trust badges section (top of page):** Display SOC 2 Type II, GDPR, and ISO 27001 (if certified) badges in large format — 80px height each, displayed in a row with 32px gap. These use an enlarged version of the badge component from Part 3.
- **"Download SOC 2 Report" button:** Ghost indigo button ("ghost" means white border + indigo text, transparent background). Clicking reveals an inline email gate form — a small glass card expanding below the button with fields: "Work email" (input, 44px height) + "Download" (filled indigo button). No modal. The form inlines into the page at 250ms with house ease. On submit, an email with the PDF link is sent to the provided address.
- **Required sections:**
  1. Data Encryption (at rest: AES-256; in transit: TLS 1.3)
  2. Access Controls (RBAC, SSO/SAML, SCIM provisioning, MFA)
  3. Incident Response (defined SLA for severity levels)
  4. Penetration Testing cadence ("Last penetration test: Q1 2026")
  5. Data Residency options
- **Responsible disclosure form:** H2 "Found a vulnerability?" — inline form directly on the page (no modal): "Your email" + "Description" textarea (min-height 120px) + "Submit" button. On submit: routes to `security@experient.ai`. Show a success state inline: "Thanks — we'll respond within 72 hours." The form is not a mock — it must actually send.
- **Pentest date displayed prominently:** "Last penetration test: Q1 2026" — 14px, `rgba(255,255,255,0.7)`, with a calendar icon.

### DPA (/legal/dpa)

The Data Processing Agreement is a procurement requirement for most enterprise GDPR-covered deals.

- **Layout:** Single column, `max-width: 720px`, clean
- **Top of page actions (side by side):** "Download as PDF" (filled indigo button, 44px) + "Request custom DPA" (ghost button, 44px)
- **GDPR Article 28 compliance statement:** Displayed in a glass card near the top: "This DPA satisfies the requirements of Article 28 of the EU General Data Protection Regulation (GDPR)." — with a small EU flag icon.
- **Effective date:** Large and prominent below the H1. Not in fine print.
- **"Request custom DPA for enterprise" form:** Below the main DPA text. Fields: Company name, Contact email, DPA requirements (textarea, min-height 100px, placeholder "Describe any custom requirements..."), Submit button. On submit, routes to `legal@experient.ai`. Success state inline.

---

## PART 6: CRYSTAL AI TRANSPARENCY UI

Crystal is the platform's AI engine. On the support site, Crystal answers user questions, generates documentation, and suggests next steps. Transparency about Crystal's AI nature is not a legal disclaimer — it is a product value. Users who understand Crystal trust it more.

### "AI-drafted" Article Badge

See Part 3 for the full visual specification. Additional behavioral rules:

- The badge is present on every Crystal-generated support article before its first human review. After human review, the badge updates to show the review date.
- The badge is never added retroactively to human-written content.
- The badge is rendered server-side (ISR/SSR) — it is part of the static HTML, not injected by JavaScript after load. This ensures it appears for users with JavaScript disabled.

### Crystal Answer Attribution

Every Crystal response in the support site must cite its sources. This is non-negotiable.

- **Single source:** "Crystal found this in [Doc Title]" — "Doc Title" is a clickable indigo link to the actual document page
- **Multiple sources:** "Crystal found this in [Doc A] and [Doc B]" — both titles are clickable links
- **Attribution position:** Directly below the Crystal answer text, before the feedback row
- **Source disclosure triangle:** Sources are collapsed by default behind a "Sources (2) ▾" disclosure element. Clicking expands a list of source items. Each source item shows: document title (14px, indigo link), section heading (12px, `rgba(255,255,255,0.5)`), last updated date (11px, `rgba(255,255,255,0.4)`).
- **Collapsed state height:** 24px row, `font-size: 12px`, `rgba(255,255,255,0.45)`. The "▾" rotates to "▸" when expanded (CSS transform, 150ms).

### Uncertainty Signal

Crystal's confidence in its answers should be communicated visually, not hidden.

- **High confidence (score ≥ 0.85):** Answer text at `rgba(255,255,255,0.95)`. No chip. No modifier.
- **Medium confidence (score 0.60–0.84):** Answer text softens to `rgba(255,255,255,0.75)`. An amber chip appears above the answer: amber background `rgba(234,179,8,0.12)`, amber border `rgba(234,179,8,0.3)`, amber text "Crystal is moderately confident" — 11px, Icon: amber warning triangle 12px. This does not alarm users; it invites them to verify.
- **Low confidence (score < 0.60):** Answer text softens to `rgba(255,255,255,0.55)`. An orange chip: "Crystal isn't certain — verify with docs". The escalation link ("Talk to a human →") appears more prominently below the answer at low confidence — larger font, indigo link rather than muted.
- **Confidence is not displayed as a percentage.** The three-tier qualitative system (none / moderately / uncertain) is sufficient and less alarming than "62% confidence."

### Feedback Mechanism

User feedback on Crystal answers feeds the Crystal evaluation pipeline, improving future answers. The UI must make feedback frictionless.

- **Placement:** Below the Crystal answer, above the source disclosure. `margin-top: 16px`.
- **Prompt text:** "Was Crystal's answer accurate?" — 13px, `rgba(255,255,255,0.4)`
- **Two buttons:** "Yes ✓" and "Needs work ✗". Both are ghost buttons (transparent background, no border), 32px height, 12px font. On hover: "Yes" button gets green tint `rgba(34,197,94,0.15)` background; "Needs work" gets red tint `rgba(239,68,68,0.15)`.
- **"Yes" flow:** Instant green checkmark icon appears (replaces button), scale-in animation at 200ms. No further prompt. The positive feedback is recorded silently.
- **"Needs work" flow:** The feedback row expands below at 250ms with house ease, revealing a text field: "What was wrong? (optional)" — 13px placeholder, `max-length: 200`, full-width, 36px height, glass-card style. + "Submit" button (filled indigo, 36px, 100px wide). On submit: the row collapses, shows "Thanks — we'll use this to improve Crystal." in green.
- **API route:** `POST /api/support/feedback` with body `{ answerId, rating: 'positive' | 'negative', comment?: string }`. The backend routes this into the Crystal eval pipeline.

### "How Crystal works" Footer Link

Every Crystal-answered panel must include this link. It is the transparency anchor for the entire Crystal AI experience.

- **Text:** "How Crystal works →"
- **Style:** 12px Inter 400, `rgba(255,255,255,0.35)`, no underline at rest, underline on hover, `transition: color 150ms ease`
- **Placement:** Footer of every Crystal answer panel, below the feedback row. Always the last element.
- **Links to:** `/crystal/overview` — a dedicated page explaining how Crystal works, its data access model, how skills are created and reviewed, and how feedback improves it.
- **Never removed, never overridden.** Even in logged-in mode, even on mobile, even on low-confidence answers.

---

## PART 7: CONTENT DISCOVERY DESIGN

### Category Browse Page (/guides)

The `/guides` page is the structured entry point for users who want to browse rather than search.

- **Page header:** H1 "Documentation & Guides" (28px, Inter 700). Below: "Browse [count] articles across 8 categories" — 14px, `rgba(255,255,255,0.55)`.
- **Grid layout:** 3 columns on desktop (≥1024px), 2 columns on tablet (768–1023px), 1 column on mobile
- **Grid gap:** 20px
- **Category card spec:** Glass card, 200px minimum height. Content: category icon (32px SVG, indigo), category title (H3, 18px Inter 600), article count subtitle ("12 articles", 13px `rgba(255,255,255,0.5)`), last updated timestamp ("Last updated 3 days ago", 11px `rgba(255,255,255,0.4)`). Icon, title, subtitle stacked vertically with 12px gaps. Timestamp at the bottom of the card.
- **Hover:** `border-color` transitions to `rgba(99,102,241,0.4)`, `box-shadow` adds `0 0 20px rgba(99,102,241,0.15)`, `transform: scale(1.02)`. All transitions 200ms with house ease.
- **Categories and their icons:** Getting Started (rocket icon), API Reference (code brackets), Crystal AI (sparkle), Workflows (git-branch), Billing & Credits (credit-card), Team & Permissions (users), Integrations (plug), Troubleshooting (wrench).
- **Category count:** Always 8 in the initial build. The count in the header should be dynamic.

### Search Results Page (/search)

- **Layout:** Left sidebar 240px (sticky, desktop only) + main content column, 24px gap between them
- **URL pattern:** `/search?q=saml+setup` — query is in the URL for shareability and browser back behavior
- **Sidebar filters:**
  - Section heading "Filter by" (11px uppercase, `rgba(255,255,255,0.35)`)
  - **Category:** Checkboxes for each of the 8 categories. Checkbox style: 16px, indigo accent color on check.
  - **Date range:** Radio group — "Last 7 days", "Last 30 days", "Last 90 days", "All time" (default: All time)
  - **Article type:** Checkboxes — "Guide", "API Reference", "Changelog", "Crystal skill"
  - Filters apply immediately on change (no "Apply" button needed). URL updates with filter params.
  - Sidebar sticks at `top: 76px` (below navbar) on desktop scroll.
- **Results:**
  - Each result is a glass card: Article title (H3, 18px, indigo link on hover), category chip (12px, glass style), "AI-drafted" chip if applicable, 2-line excerpt with query terms highlighted (`background: rgba(99,102,241,0.2); border-radius: 2px; padding: 0 2px`), estimated read time (13px, `rgba(255,255,255,0.4)`).
  - Results ordered by relevance (pgvector cosine similarity on embeddings).
  - Pagination: "Load more" button (ghost indigo, 44px, full-width) at the bottom of results. Infinite scroll is acceptable if implemented with IntersectionObserver — not with scroll event listeners.
- **No results state:** Crystal activates automatically. The main content area renders: [Crystal sparkle icon 24px] "Crystal couldn't find a doc for this. Here's what I know:" followed by a Crystal answer panel with the query pre-filled. The sidebar filters remain visible for the user to broaden their search.

### "You might also need" Section

This section provides related content without AI branding. It is structurally similar articles, not AI recommendations.

- **Placement:** Bottom of every article page, after the article body, after the feedback row, before the soft CTA (if anonymous), before the footer.
- **Heading:** H3 "You might also need" (18px, Inter 600)
- **Layout:** 3-column horizontal row on desktop (≥768px), vertical stack on mobile. Gap: 16px.
- **Card spec:** Compact glass card — title (15px Inter 600, link), category chip (11px), 1-line description (13px, `rgba(255,255,255,0.6)`). No read time, no metadata — compact.
- **Similarity algorithm:** pgvector cosine similarity on doc embeddings. 3 most similar articles, excluding the current article.
- **AI branding:** Absent. Do not label these "Crystal suggests" or similar. They are structurally similar articles, identified by vector similarity. No AI attribution on this section.

### "Trending this week" Section (Homepage)

Below the hero, above the featured guides grid.

- **Section heading:** H2 "What teams are asking this week" (24px, Inter 600)
- **Layout:** Horizontal row of 5 pill buttons, centered, `flex-wrap: wrap`, gap 10px
- **Pill style:** Ghost button with glass treatment — `background: rgba(255,255,255,0.06)`, `border: 1px solid rgba(255,255,255,0.12)`, `border-radius: 20px`, `padding: 8px 16px`, `font-size: 13px`, `color: rgba(255,255,255,0.75)`. On hover: border becomes `rgba(99,102,241,0.4)`, text becomes white.
- **Sample pills:** "NPS benchmark", "SAML setup", "credit usage", "webhook events", "survey branching"
- **Click behavior:** Pre-fills the Crystal input field at the top of the page (if visible) or opens the Crystal bottom sheet (on mobile) with the pill text as the input value. Does not navigate away from the homepage.
- **Data source:** Top 5 anonymized search terms from the last 7 days (Plausible custom event aggregation). Updated daily at midnight UTC via a cron job.

### Crystal-Suggested Reading Path

Appears only in Crystal answer panels, not on static article pages.

- **Placement:** Below the Crystal answer text, before the source disclosure, before the feedback row.
- **Heading:** No H-tag heading. Small label row: [sparkle icon 12px, indigo] "Crystal suggests" — 12px Inter 500, `rgba(99,102,241,0.8)`. This IS AI-attributed — the sparkle icon + "Crystal suggests" label is explicit.
- **Content:** 2 article links displayed as compact link rows. Each row: article title (14px, indigo, underline on hover), category chip (11px, glass style, right-aligned).
- **Source:** Crystal's ranking model selects the 2 articles most likely to be helpful given the current answer context (embedding similarity + recency weighting).

---

## PART 8: INTERNATIONAL / MULTI-LANGUAGE UI

### Language Switcher

- **Icon:** Globe SVG (20px, `rgba(255,255,255,0.6)`, outline style). Located in the navbar right side, to the left of the sun/moon toggle.
- **Hover:** Tooltip "Language" appears below the icon, 200ms delay, 12px, glass card style.
- **Click:** Dropdown panel slides down from the icon, 160px wide, glass card (`background: rgba(18,18,31,0.95)`, `backdrop-filter: blur(20px)`). Opens in 150ms with house ease (scaleY from 0.95 + opacity from 0).
- **Options:**
  - 🇺🇸 English — with a 6px indigo dot on the right if currently selected
  - 🇪🇸 Español
  - 🇩🇪 Deutsch
  - 🇫🇷 Français
  Each option: 14px, padding `10px 16px`, `rgba(255,255,255,0.75)` at rest, `rgba(255,255,255,1)` on hover. Hover background: `rgba(255,255,255,0.06)`.
- **URL strategy:** Language prefix in the URL path: `/es/guides`, `/de/legal/privacy`. English (default) has no prefix. Implemented via Next.js i18n routing configuration.
- **Persistence:** `localStorage.setItem('preferred_language', 'es')`. On next visit, redirect to the preferred language prefix automatically.

### Auto-Translate Disclaimer Banner

Machine translation is used for ES, DE, and FR until human translations are available. The banner is honest about this.

- **Placement:** `position: sticky; top: 56px` (directly below the navbar). Full width, 40px height.
- **Style:** Amber glass — `background: rgba(234,179,8,0.08)`, `border-bottom: 1px solid rgba(234,179,8,0.2)`. No border-top (the navbar provides the visual boundary).
- **Content:** [Translate icon 16px, `rgba(234,179,8,0.8)`] "This article was automatically translated." | [Spacer] | "[View original in English]" — the bracketed link is `#6366f1`, underline on hover. Clicking switches to the English URL.
- **Typography:** 13px Inter 400, `rgba(234,179,8,0.9)` for the main text.
- **Not shown on:** Human-translated content. Controlled by a `machine_translated: true` metadata flag on the article.

### RTL Layout Support (Arabic future-proofing)

All layout CSS must use logical properties to support RTL without a separate stylesheet.

- **Required substitutions:** `margin-left` → `margin-inline-start`, `margin-right` → `margin-inline-end`, `padding-left` → `padding-inline-start`, `padding-right` → `padding-inline-end`, `border-left` → `border-inline-start`, `border-right` → `border-inline-end`, `left: 0` → `inset-inline-start: 0`, `right: 0` → `inset-inline-end: 0`
- **Text alignment:** Use `text-align: start` and `text-align: end` — never `text-align: left` or `text-align: right`
- **Flex:** Use `justify-content: flex-start` (not `left`). In RTL mode, this reverses naturally.
- **RTL toggle:** `<html dir="rtl">` on Arabic pages. All logical CSS properties reverse automatically.
- **Navigation arrows:** SVG arrows (→, ←) should be CSS-transformed via `[dir="rtl"] .arrow { transform: scaleX(-1) }` to flip horizontally.
- **Sidebar:** In RTL, the article sidebar moves to the left side automatically via CSS logical properties.
- **Arabic font:** `"Noto Sans Arabic"` loaded conditionally for Arabic locale. Append to the font stack as shown below.

### Language-Specific Font Fallbacks

```css
font-family:
  'Inter Variable',
  'Noto Sans',
  'Noto Sans Arabic',
  'Noto Sans JP',
  system-ui,
  sans-serif;
```

Load `Noto Sans Arabic` and `Noto Sans JP` only for the locales that require them (conditional font loading via `<link rel="preload">` in the locale-specific layout). Do not load all Noto fonts globally — the file sizes are large.

---

## PART 9: MOBILE DESIGN SPEC (Expanded)

### Bottom Navigation Bar

The bottom navigation bar replaces the top navbar's functionality on mobile. The top navbar remains but is simplified; the bottom bar handles primary navigation.

- **Items (left to right):** Home (house icon), Search (magnifier icon), Crystal (sparkle icon), More (3×3 grid icon)
- **Labels:** 12px Inter 400, below each icon. Icon size: 22px.
- **Height:** 60px
- **Background:** `rgba(10,10,20,0.92)`, `backdrop-filter: blur(20px)`, `border-top: 1px solid rgba(255,255,255,0.08)`
- **Safe area:** `padding-bottom: env(safe-area-inset-bottom)` — critical for iPhone notch/Dynamic Island. Without this, the bar clips under the home indicator.
- **Active state:** Active icon fills solid (vs. outline), label becomes `rgba(255,255,255,1)`, icon color becomes `#6366f1`.
- **Crystal badge:** When a Crystal answer is pending or processing, an 8px amber dot (`#f59e0b`) appears top-right of the Crystal sparkle icon with a 2px white ring. This is a standard notification badge.
- **"More" tab:** Opens a drawer from the bottom listing less-frequent links: Settings, Legal, Status, Changelog.

### Crystal as Bottom Sheet

On mobile, the Crystal AI panel opens as a bottom sheet rather than an inline or sidebar panel.

- **Trigger:** Tapping the Crystal icon in the bottom navigation bar
- **Animation:** Slides up from below the bottom nav. Spring animation: `stiffness: 300, damping: 30`. Initial position `translateY(100%)`, final position `translateY(0)`.
- **Initial height:** 70% of the viewport height. The user can drag it to full screen.
- **Drag handle:** A 36×4px pill at the top center of the sheet. `background: rgba(255,255,255,0.2)`, `border-radius: 2px`. `margin: 12px auto`. Provides a visual drag affordance.
- **Full-screen drag:** Dragging the handle upward beyond the current height expands the sheet to `100dvh - env(safe-area-inset-top)`.
- **Dismiss gesture:** Drag down below 30% of sheet height, then release. Or tap the backdrop behind the sheet. Animate out at 250ms with house ease.
- **Backdrop:** `rgba(0,0,0,0.5)` behind the sheet, fades in at 200ms on open. Tapping backdrop dismisses.
- **Input position:** Fixed to the bottom of the sheet (above the keyboard). When the keyboard opens, the input lifts with the keyboard via `env(keyboard-inset-height)` or the `visualViewport` resize event.
- **Answer area:** Scrollable vertically within the sheet. Crystal responses appear from top to bottom, scrolling upward as new content is generated.
- **Background:** `rgba(10,10,20,0.97)` — nearly opaque to separate from whatever is behind the sheet.

### Article Reading Mode

Mobile article reading is the most content-dense experience on the site. It needs dedicated attention.

- **Fullscreen reading:** The top navbar and bottom nav are hidden after 60px of scroll (slide up and down smoothly, 250ms). They return when the user scrolls up or taps the screen.
- **Floating TOC button:** When the navbar is hidden, a floating circle button appears in the bottom-right corner: 44×44px, glass card style, indigo TOC lines icon. `position: fixed; bottom: 24px; right: 16px; z-index: 50`.
- **TOC slide-in:** Tapping the TOC button slides in a 280px panel from the right edge (full height, glass background). Lists all H2/H3 anchors. Tapping an anchor closes the panel and jumps to that section.
- **Font:** 16px body text on mobile (increased from 15px desktop — finger-held reading requires slightly larger type)
- **Line measure:** `max-width: 680px` centered, with `padding: 0 20px` on mobile
- **Code blocks:** `overflow-x: auto`, `WebkitOverflowScrolling: touch`. Minimum 1-finger horizontal scroll on code blocks. Do not truncate code — always allow full-width scroll.

### Swipe Navigation

- **Back gesture:** Swipe right with a starting x-position within 20px of the left edge (simulating iOS edge swipe). Threshold: >100px horizontal, <50px vertical deviation, completed in <600ms.
- **Visual feedback:** As swipe distance increases, a 4px indigo vertical stripe appears at the left edge of the screen, `height: 100%`, `opacity` proportional to swipe progress.
- **Completion:** If released past 50% of screen width, the page navigates back with a 200ms slide-out animation (page slides right out of frame, previous page slides in from left).
- **Cancellation:** Released before 50% — the stripe fades and the page springs back to position.

### Offline Mode

- **Service worker:** Workbox-powered, registered via `next-pwa` or a manual Workbox configuration.
- **Cached resources:** (1) Core app shell: all CSS, fonts, JS bundles — cache-first strategy. (2) Article pages: stale-while-revalidate — serve from cache instantly, revalidate in background. Maximum 20 unique article URLs stored. (3) Homepage: network-first, falls back to cache.
- **Offline indicator:** Amber top banner (same style as machine-translation banner) when `navigator.onLine === false`: "You're offline — showing cached content". Dismissible with an X. Re-appears automatically if connection drops mid-session.
- **Crystal offline behavior:** The Crystal input is visible but disabled. A message appears in the Crystal panel area: "Crystal needs a connection to answer questions. Here are cached articles that might help:" followed by the 3 most recently visited article cards from the cache.
- **Cache staleness:** If a cached article is more than 7 days old, show a small yellow chip: "This cached article may be outdated. [Refresh →]" — the refresh link is disabled when offline (greyed out), active when online.

### Touch Targets

All interactive elements must meet the 44×44px minimum touch target standard (WCAG 2.5.5 Target Size).

- **Implementation method:** Use CSS `min-height: 44px; min-width: 44px` on the element itself when possible. When the element must be visually smaller (e.g., a 16px icon), use a wrapper or `::before` pseudo-element: `content: ''; position: absolute; inset: -12px;` to expand the hit area.
- **Affected elements:** All nav links, category chips in sidebars, the "Sources" disclosure triangle, the feedback Yes/No buttons, language switcher items, article TOC links, trust badge hover targets, code copy buttons, article card links.
- **Bottom nav items:** Already 60px height. Individual items are 25% of screen width. Always meets 44px on any phone ≥176px wide.

---

## PART 10: DARK / LIGHT MODE

### Default Mode

- **Default:** Dark mode. The brand is dark-first.
- **First visit (no stored preference):** Check `prefers-color-scheme`. If `light`: activate light mode. If `dark` or no media query result: activate dark mode.
- **Manual toggle:** Stored in `localStorage.setItem('color_scheme', 'dark' | 'light')`. Persists across sessions.
- **Server-side:** Read the cookie `color_scheme` (set alongside localStorage) in middleware to render the correct theme server-side, preventing flash-of-wrong-theme on first load.

### Toggle Control

- **Icon:** Sun/Moon SVG in the navbar, 20px, `rgba(255,255,255,0.6)` (dark mode shows moon, light mode shows sun).
- **Animation:** On toggle, the icon rotates 180° and cross-fades between moon and sun in 300ms ease. Use CSS `transform: rotate(180deg)` + `opacity` transition on two absolutely-positioned icons.
- **No label.** `aria-label="Toggle dark mode"` / `aria-label="Toggle light mode"` on the button.
- **Theme transition:** The `<html>` element gets `data-theme="light"` or `data-theme="dark"`. A brief CSS transition on `background-color` and `color` (200ms ease) prevents jarring flips.

### Light Mode Palette

```css
[data-theme="light"] {
  --bg:             #ffffff;
  --surface:        #f4f4f8;
  --border:         rgba(0, 0, 0, 0.08);
  --text-primary:   #1a1a2e;
  --text-secondary: rgba(26, 26, 46, 0.55);
  --navbar-bg:      rgba(255, 255, 255, 0.85);
  --footer-bg:      #f0f0f6;
}
```

- Indigo primary `#6366f1` and purple tertiary `#a855f7` are unchanged — they work on both light and dark backgrounds.
- The near-black text `#1a1a2e` is warmer than pure black, maintaining the brand's slight purple tint even on light backgrounds.

### Light Mode Component Overrides

- **Glass cards in light mode:** `background: rgba(255,255,255,0.8)`, `border: 1px solid rgba(0,0,0,0.06)`. The `backdrop-filter` is not useful on a white background — remove it for performance.
- **Three.js hero in light mode:** Option A: Shift fog color to white `#ffffff` and particle colors to `indigo-400/purple-400` (`#818cf8` / `#c084fc`). Option B (recommended for performance): Replace Three.js canvas with a static CSS gradient: `background: radial-gradient(ellipse at 30% 40%, rgba(99,102,241,0.12) 0%, transparent 50%), radial-gradient(ellipse at 70% 60%, rgba(168,85,247,0.08) 0%, transparent 50%), #f8f8ff`. Light mode users are more likely to have performance constraints or `prefers-reduced-motion` set.
- **Code blocks:** Always dark (`background: #1a1a2e`), regardless of mode. Code is always easier to read on dark backgrounds.
- **Crystal answer panel:** `background: #eeeef8`, `border: 1px solid rgba(99,102,241,0.15)`. The panel uses the same glass card border-radius and shadow.
- **Trust badges:** `background: rgba(0,0,0,0.04)`, `border: 1px solid rgba(99,102,241,0.2)`.
- **Footer:** `background: #f0f0f6`. Text at `#1a1a2e`.

### CSS Implementation

```css
:root {
  --bg:             #0a0a14;
  --surface:        #12121f;
  --border:         rgba(255, 255, 255, 0.08);
  --text-primary:   rgba(255, 255, 255, 0.95);
  --text-secondary: rgba(255, 255, 255, 0.55);
  --navbar-bg:      rgba(10, 10, 20, 0.85);
  --footer-bg:      #080810;
}

[data-theme="light"] {
  --bg:             #ffffff;
  --surface:        #f4f4f8;
  --border:         rgba(0, 0, 0, 0.08);
  --text-primary:   #1a1a2e;
  --text-secondary: rgba(26, 26, 46, 0.55);
  --navbar-bg:      rgba(255, 255, 255, 0.85);
  --footer-bg:      #f0f0f6;
}

@media (prefers-color-scheme: light) {
  :root:not([data-theme="dark"]) {
    --bg:             #ffffff;
    --surface:        #f4f4f8;
    --border:         rgba(0, 0, 0, 0.08);
    --text-primary:   #1a1a2e;
    --text-secondary: rgba(26, 26, 46, 0.55);
    --navbar-bg:      rgba(255, 255, 255, 0.85);
    --footer-bg:      #f0f0f6;
  }
}

/* All color references use CSS variables */
body {
  background: var(--bg);
  color: var(--text-primary);
}

.glass-card {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid var(--border);
}

[data-theme="light"] .glass-card {
  background: rgba(255, 255, 255, 0.8);
}
```

---

## PART 11: ARTICLE PAGE DESIGN (Full Spec)

### Article Header

- **H1:** 36px Inter 700, `var(--text-primary)`, `line-height: 1.2`, `margin-bottom: 16px`
- **Category chip:** A small pill — `background: rgba(99,102,241,0.12)`, `border: 1px solid rgba(99,102,241,0.25)`, `border-radius: 20px`, `padding: 4px 12px`, `font-size: 12px`, `font-weight: 600`, `text-transform: uppercase`, `letter-spacing: 0.05em`, `color: #818cf8` (indigo-400). Displayed above the H1.
- **Metadata row:** Flex row, gap 16px, `font-size: 13px`, `color: var(--text-secondary)`. Items: "Last updated [date]" | vertical separator | "10 min read" | vertical separator | AI-drafted badge (if applicable). The read time is calculated as `wordCount / 200` minutes, rounded up.
- **Hero image:** Optional. If present: `max-width: 600px`, centered, `border-radius: 12px`, `border: 1px solid var(--border)`, `margin: 24px auto`. Always includes a descriptive `alt` attribute.
- **Vertical rhythm below header:** After the hero image (or metadata row if no image): 40px margin before the article body begins.

### Article Body

Every typographic element in the article body has explicit styles. Do not rely on browser defaults.

- **H2:** 24px Inter 600, `margin-top: 2rem`, `margin-bottom: 0.75rem`, `padding-bottom: 8px`, `border-bottom: 1px solid var(--border)` — the rule under H2 creates clear section breaks.
- **H3:** 18px Inter 600, `margin-top: 1.5rem`, `margin-bottom: 0.5rem`
- **H4:** 13px Inter 600, `text-transform: uppercase`, `letter-spacing: 0.08em`, `color: var(--text-secondary)`, `margin-top: 1.25rem`
- **Body paragraphs:** 15px Inter 400, `rgba(255,255,255,0.85)`, `line-height: 1.7`, `margin-bottom: 1rem`
- **Inline code:** JetBrains Mono 13px, `background: rgba(255,255,255,0.08)`, `border-radius: 4px`, `padding: 1px 5px`. In light mode: `background: rgba(0,0,0,0.06)`.
- **Code blocks:**
  - Container: `background: #0d0d1a`, `border: 1px solid rgba(255,255,255,0.08)`, `border-radius: 12px`, `padding: 20px`, `overflow-x: auto`, `position: relative`
  - Font: JetBrains Mono 13px, `line-height: 1.6`
  - Syntax highlighting: Use Shiki or Prism with a dark theme (atom-one-dark or similar)
  - Copy button: Positioned `position: absolute; top: 12px; right: 12px`. Ghost style: `background: transparent`, `border: 1px solid rgba(255,255,255,0.15)`, `border-radius: 6px`, 32px height, `font-size: 11px`, text "Copy". On click: button text changes to "Copied ✓" for 1.5 seconds, then resets.
  - Code blocks are always dark regardless of the page's dark/light mode setting.
- **Blockquote:** `border-left: 3px solid #6366f1`, `padding-left: 16px`, `font-style: italic`, `color: var(--text-secondary)`, `margin: 1.5rem 0`
- **Tables:** `width: 100%`, `border-collapse: collapse`. Header row: `background: rgba(99,102,241,0.1)`, `font-size: 13px`, `font-weight: 600`, `text-transform: uppercase`, `letter-spacing: 0.04em`, `padding: 12px 16px`. Body rows: `padding: 10px 16px`, `border-bottom: 1px solid var(--border)`. Even rows: `background: rgba(255,255,255,0.02)`.
- **Images in body:** `max-width: 100%`, `border-radius: 8px`, `border: 1px solid rgba(255,255,255,0.06)`, `display: block`, `margin: 1.5rem auto`. Always include `alt` text.
- **Ordered and unordered lists:** `padding-left: 1.5rem`, `margin-bottom: 1rem`. List items: `margin-bottom: 0.4rem`, 15px. Unordered: custom bullet — a 4px indigo circle (`list-style: none; &::before { content: ''; width: 4px; height: 4px; background: #6366f1; border-radius: 50%; position: absolute; left: -1rem; top: 0.55em; }`). Ordered: `list-style: decimal`.

### Article Sidebar (≥1200px)

- **Position:** Sticky on the right side of the article. `position: sticky; top: 80px`. Width: 200px. In a CSS grid with the main content: `grid-template-columns: 1fr 200px; gap: 48px`.
- **Section heading:** "On this page" — 11px Inter 600, uppercase, `letter-spacing: 0.1em`, `color: var(--text-secondary)`, `margin-bottom: 12px`
- **TOC links:** H2 anchor links only (H3 omitted for brevity — they can be included if there are more than 4 H2s). Each link: 13px Inter 400, `color: var(--text-secondary)`, `padding: 4px 0`, display block, hover → `color: var(--text-primary)`.
- **Active section indicator:** The currently visible H2 section (tracked by IntersectionObserver on each H2 element): `color: rgba(255,255,255,0.95)`, preceded by a 6px indigo dot `position: absolute; left: -14px`. The IntersectionObserver threshold is `0.5` with a root margin of `-80px 0px -60% 0px` to trigger at the right scroll position.
- **Responsive:** Hidden below 1200px viewport width. The floating TOC button (mobile) handles this case.

### Article Footer

- **Feedback row:** "Was this article helpful?" — 14px, `rgba(255,255,255,0.55)`. Followed by two ghost buttons: "👍 Yes" and "👎 No" — 32px height, `border: 1px solid rgba(255,255,255,0.15)`. On "Yes": green check animation. On "No": expands a textarea "What could we improve?" (optional). Routes to `POST /api/support/article-feedback`.
- **Crystal teaser (logged-in):** "Have a question about this article? Ask Crystal →" — 13px, indigo link. Clicking opens the Crystal panel with the current article title pre-populated in the query. Does NOT show a CTA for logged-in users.
- **Anonymous soft CTA:** "See what Experient can do →" — ghost button as specified in Part 4. Appears only for anonymous users.
- **"You might also need" section:** 3 related article cards (see Part 7 for spec).
- **"How Crystal works" link:** Present if the article mentions Crystal anywhere in its body. Consistent with Part 6 specification.

---

## PART 12: COMPONENT STATES & MICRO-INTERACTIONS

### Framer Motion Defaults

All animation in the support site uses Framer Motion (or CSS transitions that match the same parameters). The house ease curve `[0.22, 1, 0.36, 1]` is the universal easing for "arrival" animations.

- **Page transitions:** `opacity: 0 → 1`, `translateY: 8px → 0`, duration 250ms, easing: house ease. On exit: `opacity: 1 → 0`, duration 150ms, ease-in. Use `AnimatePresence` with `mode: "wait"` in Next.js `layout.tsx`.
- **Card hover:** `scale: 1.015`, 200ms house ease. Combined with the border-color transition from the glass-card CSS.
- **Button press (`:active`):** `scale: 0.97`, 100ms ease-out. Applied to all filled and ghost buttons.
- **Crystal reasoning trace:** Each step in the "Reading your org's plan... Checking NPS history..." sequence staggered at 0.06s per step. Each step animates: `opacity: 0 → 1`, `translateY: 8px → 0`, 200ms house ease.
- **Bottom sheet:** Spring physics: `stiffness: 300, damping: 30`. Not a CSS transition — the spring gives it the organic feel of a native iOS sheet.
- **Modal (if used):** Scale from `0.96 → 1.0` combined with `opacity: 0 → 1`. Duration 200ms house ease.
- **Accordion expand:** Height from `0 → auto` (use `Framer Motion layout` prop, or measure height in JS). `opacity: 0 → 1`. Duration 250ms.

### Loading States

- **Initial page load:** Skeleton screens — not spinners. The article card skeleton shows a gray shimmer rectangle where the title would be (full width, 20px height, border-radius 4px), a shorter rectangle for the subtitle, and a full-width rectangle for the body excerpt. The shimmer is a CSS gradient animation: `background: linear-gradient(90deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.1) 50%, rgba(255,255,255,0.04) 100%)` animated from left to right, 1.5s infinite.
- **Crystal thinking:** A live progress trace renders in real-time in the Crystal panel. Steps appear one by one: "🔍 Reading your org's survey history...", "📊 Checking NPS trends...", "💡 Composing answer...". Each step uses the stagger animation. This is more informative and engaging than a spinner — it communicates what Crystal is actually doing.
- **Article load (ISR):** No loading state — article HTML is pre-rendered at build time or on first request (ISR). The page should appear fully rendered in the first paint.
- **Search results:** Skeleton cards (3 of them) appear instantly while results fetch. Replace with real results at 200ms minimum (avoid FOUC with instant swap — let the skeleton breathe for at least 200ms even if the API responds faster).

### Empty States

- **No search results:** A centered illustration (simple line SVG — not a mascot, not a stock photo) with the message "No articles match your search." Below: [Crystal sparkle icon] "Crystal can still help:" followed by the Crystal input pre-filled with the search query. The search sidebar filters remain visible.
- **No Crystal answer (offline or error):** "Crystal needs a connection right now." Below: "Here are cached articles that might help:" + 3 article cards from the service worker cache. If the cache is empty: "No cached articles — check our docs when you're back online."
- **Error state (API failure):** An inline error message (not a full-page error): "Something went wrong loading this content." [Retry] button (ghost indigo, 36px) + "Contact support →" link (`mailto:support@experient.ai`).

---

## PART 13: ACCESSIBILITY

### WCAG 2.1 AA Requirements

The support site must meet WCAG 2.1 AA at minimum. The brand palette has been chosen with contrast in mind.

- **Dark mode contrast ratios:**
  - `rgba(255,255,255,0.95)` on `#0a0a14` → contrast ratio ≈18.5:1 (passes AAA)
  - `rgba(255,255,255,0.55)` on `#0a0a14` → contrast ratio ≈6.1:1 (passes AA for body, fails AAA — acceptable)
  - Indigo `#6366f1` on `#0a0a14` → contrast ratio ≈5.2:1 (passes AA for large text, borderline for body — use only for interactive elements, not body text)
- **Light mode contrast ratios:**
  - `#1a1a2e` on `#ffffff` → contrast ratio ≈15.9:1 (passes AAA)
  - `rgba(26,26,46,0.55)` on `#ffffff` → contrast ratio ≈4.8:1 (passes AA)
- **Focus rings:** All interactive elements have a visible focus indicator. Default browser outline is replaced with: `outline: 2px solid #6366f1; outline-offset: 2px`. Applied via `:focus-visible` (not `:focus`, to avoid showing on mouse click). The 2px indigo outline is visible on both dark and light backgrounds.
- **Non-text elements:** All icon buttons have `aria-label`. All decorative images have `alt=""`. All meaningful images have descriptive alt text.

### Keyboard Navigation

Every interactive feature is fully keyboard-accessible. Tab-order is the accessibility contract.

- **Tab order:** Skip-to-main link (first in DOM, visually hidden) → Navbar (left to right) → Hero content (CTA buttons, Crystal input) → Trust row → Main content → Footer
- **Skip-to-main link:** `<a href="#main-content" class="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:bg-indigo-600 focus:text-white focus:px-4 focus:py-2 focus:rounded-lg">Skip to main content</a>`. This link is the very first `<a>` in the `<body>`. It appears only when focused via keyboard.
- **All modals and sheets trap focus.** Use `focus-trap-react` or a manual implementation. Focus should not escape to the page behind a modal.
- **Escape key:** Closes the language dropdown, the dark mode dropdown (if expanded to a panel), the Crystal bottom sheet, and any open modal.
- **Crystal input:** Tab to focus, Enter to submit, Shift+Enter for newline (in multi-line mode).
- **Article TOC sidebar links:** All anchor links, keyboard-navigable, with visible focus rings.

### Screen Reader Support

Screen readers are used by a meaningful portion of enterprise users, particularly in accessibility-mandated procurement contexts.

- **Crystal reasoning trace:** `aria-live="polite"` on the container that receives new reasoning steps. `role="status"`. Screen readers will announce each new step as it appears.
- **Progress indicators:** `role="progressbar"` if a percentage is known, otherwise `role="status"` with `aria-label="Loading..."`.
- **Language switcher dropdown:** `role="listbox"` on the dropdown container. Each option: `role="option"`. `aria-expanded` on the trigger button reflects open/closed state. `aria-activedescendant` tracks the highlighted option.
- **Article reading time:** "10 min read" — wrap in `<span aria-label="Estimated reading time: 10 minutes">` to expand the abbreviation for screen readers.
- **Crystal answer attribution:** The "Sources (2)" disclosure uses `role="button"` with `aria-expanded="false"/"true"` and `aria-controls="sources-panel-id"`. The sources panel has `id="sources-panel-id"`.

### Motion

- **`prefers-reduced-motion: reduce` media query:** This is a hard requirement, not a nice-to-have. When the user has requested reduced motion:
  - All Framer Motion animations are set to their final state immediately (set `transition={{ duration: 0 }}` via a global hook)
  - The Three.js canvas `display: none`, replaced by the static CSS gradient
  - CSS transitions for hover states are removed (set `transition: none`)
  - The Crystal reasoning trace appears without stagger — all steps appear at once
  - The animated pulse dot (uptime SLA) stops pulsing
  - The skeleton shimmer gradient becomes a static color

---

## IMPLEMENTATION NOTES FOR BUILDERS

### If Using v0.dev or Bolt.new

Pass this full document as your system prompt. When v0.dev or Bolt.new generates components, they will have the full context needed to make correct decisions.

Start with the atomic components in this order: (1) CSS variables and tokens from Part 10, (2) the glass-card base component, (3) the navbar, (4) the hero section with Crystal input. Build bottom-up — the tokens and glass-card underpin everything else.

**Critical notes for Tailwind v4:** This spec uses Tailwind v4. Do NOT translate to Tailwind v3 class names. Key differences: Tailwind v4 uses CSS variables natively, `@theme` directive instead of `tailwind.config.js`, no `bg-opacity-*` utilities (use `bg-indigo-500/20` syntax instead). The `backdrop-blur-*` utilities work the same.

Do not hardcode colors. Every color in the UI should reference a CSS variable from Part 10 so dark/light mode switching works without JavaScript.

### If Using Framer

- Import brand tokens from a shared styles page (Framer's equivalent of a design tokens library).
- Set the house ease `[0.22, 1, 0.36, 1]` as a custom easing named "House Ease" in the Framer easing panel.
- For the particle animation: Use Framer's WebGL/Three.js integration if available, otherwise use an SVG particle system with Framer Motion `animate` props as a fallback. The SVG fallback can achieve an approximation with 200–400 circle elements.
- All scroll-triggered animations: Use Framer's `useInView` / `whileInView` with `once: true` (animate on first visibility, do not re-animate on scroll-back).
- The Crystal bottom sheet: Framer's `useMotionValue` + `useDragControls` for the drag behavior, `useTransform` for the opacity of the backdrop.

### If Implementing from Scratch (Next.js + Tailwind v4)

Required packages — install exactly these, no substitutes without good reason:

```bash
# Framework
next@latest
react@19
react-dom@19
typescript

# Styling
tailwindcss@next                # Tailwind v4
framer-motion@latest

# 3D
three
@react-three/fiber
@react-three/drei

# Auth
@clerk/nextjs

# i18n
next-intl

# Service worker / PWA
next-pwa                        # or @ducanh2912/next-pwa for Next.js App Router support

# Analytics (no cookies)
plausible-tracker

# Fonts (Next.js font optimization)
# via next/font — Inter Variable + JetBrains Mono

# Icons
lucide-react                    # Consistent SVG icons matching the outline style spec
```

**Architecture decisions:**
- Use Next.js App Router (not Pages Router). The app should be in `app/`.
- Use ISR (`revalidate: 3600`) for article pages. Most support content does not change within the hour.
- Use server components for all non-interactive article content. Use client components only for: navbar (theme toggle, auth state), Crystal panel, interactive feedback forms, cookie banner, language switcher.
- The Crystal API at `crystalos.experient.ai` is called via a server-side proxy route (`/api/crystal/query`) — never expose the CrystalOS API key to the browser.
- All legal page PDFs are stored in Supabase Storage. The download SOC 2 report flow emails a signed URL that expires in 24 hours.
- Plausible custom events for search queries: `plausible('Search', { props: { query: q, resultCount: n } })`. Aggregated server-side for the trending pills.

**File structure conventions:**
```
app/
  layout.tsx               # Root layout: fonts, theme, analytics
  page.tsx                 # Homepage
  guides/
    page.tsx               # Category browse
    [slug]/
      page.tsx             # Article page
  search/
    page.tsx               # Search results
  legal/
    privacy/page.tsx
    terms/page.tsx
    security/page.tsx
    dpa/page.tsx
  crystal/
    overview/page.tsx
  [lang]/                  # i18n: /es, /de, /fr prefixes
components/
  Navbar.tsx
  Footer.tsx
  GlassCard.tsx
  CrystalInput.tsx
  CrystalPanel.tsx
  TrustRow.tsx
  ArticleBody.tsx
  ArticleSidebar.tsx
  BottomNav.tsx             # Mobile
  BottomSheet.tsx           # Crystal on mobile
lib/
  crystal.ts               # CrystalOS API client
  articles.ts              # Article fetching + pgvector search
  auth.ts                  # Clerk utilities
styles/
  globals.css              # CSS variables, base resets
  theme.css                # Dark/light mode tokens
```

**Environment variables required** (add to `.env.local` and to `docs/ENV_VARS.md`):
```
CRYSTALOS_API_URL           # Internal URL for CrystalOS service
CRYSTALOS_INTERNAL_KEY      # Internal API key
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
CLERK_SECRET_KEY
NEXT_PUBLIC_PLAUSIBLE_DOMAIN # e.g. support.experient.ai
SUPABASE_URL
SUPABASE_ANON_KEY
STRIPE_PUBLISHABLE_KEY      # If billing flows are needed
```

---

## APPENDIX: QUICK REFERENCE TOKENS

```css
/* Colors */
--indigo:           #6366f1;   /* Primary */
--indigo-light:     #818cf8;   /* Hover states */
--purple:           #a855f7;   /* Tertiary */
--green:            #22c55e;   /* Uptime / positive feedback */
--amber:            #f59e0b;   /* Warnings / medium confidence */
--orange:           #f97316;   /* Low confidence / errors */
--bg-dark:          #0a0a14;
--surface-dark:     #12121f;
--surface-darker:   #080810;   /* Footer */
--surface-code:     #0d0d1a;   /* Code blocks */

/* Typography */
--font-body:        'Inter Variable', system-ui, sans-serif;
--font-mono:        'JetBrains Mono', monospace;
--size-body:        15px;
--size-sm:          13px;
--size-xs:          12px;
--size-label:       11px;
--lh-body:          1.65;
--lh-reading:       1.7;

/* Motion */
--ease-house:       cubic-bezier(0.22, 1, 0.36, 1);
--dur-fast:         150ms;
--dur-base:         200ms;
--dur-slow:         300ms;
--dur-page:         250ms;

/* Layout */
--navbar-height:    56px;
--bottom-nav-h:     60px;
--content-max:      720px;
--article-max:      720px;
--hero-max:         640px;
--grid-gap:         20px;

/* Glass */
--glass-bg:         rgba(255, 255, 255, 0.04);
--glass-border:     rgba(255, 255, 255, 0.08);
--glass-blur:       20px;
--glass-radius:     16px;
--glass-shadow:     0 4px 24px rgba(0, 0, 0, 0.3);
--glass-hover-border: rgba(99, 102, 241, 0.3);
```

---

*This document is the single source of truth for the support.experient.ai visual and interaction design. Any ambiguity between this document and other specifications should be resolved in favor of this document. Last updated: June 2026.*
