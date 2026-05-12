# Design System Specification: The Intelligence Layer

## 1. Overview & Creative North Star
**Creative North Star: "The Cognitive Prism"**
This design system moves away from the flat, static layouts of traditional SaaS and toward a living, "AI-aware" interface. The goal is to make the user feel as though they are interacting with a structured mind rather than a database. We achieve this through **The Cognitive Prism**—a philosophy where data is refracted into clarity using depth, light, and editorial intent.

To break the "template" look, we utilize **Intentional Asymmetry**. Large-scale typography (Manrope) is often offset against dense, functional data grids (Inter), creating a visual rhythm that feels bespoke and high-end. We avoid the rigid "box-in-a-box" layout, instead using overlapping layers and tonal shifts to guide the eye toward intelligence and action.

---

## 2. Colors: The Indigo-Slate Spectrum
The palette is rooted in a sophisticated Indigo (`primary`) and grounded by a versatile Slate (`secondary`). This is an "Enterprise-Light" theme, optimized for long-term productivity and high-level decision-making.

### Surface Hierarchy & Nesting
We reject the use of flat white backgrounds for everything. Instead, use a "Nesting" approach to define importance:
- **Base Layer:** `surface` (#f7f9fb) – The canvas for the entire application.
- **Sectioning:** `surface_container_low` (#f2f4f6) – Used for broad structural sidebars or secondary panels.
- **Content Cards:** `surface_container_lowest` (#ffffff) – Reserved for the primary focus area, creating a "lifted" paper effect.
- **Interactive Elements:** `surface_container_high` (#e6e8ea) – For recessed elements like search bars or inactive tabs.

### The "No-Line" Rule
**Explicit Instruction:** Do not use 1px solid borders to separate sections. Boundaries must be defined solely through background color shifts. For example, a `surface_container_low` sidebar should sit flush against a `surface` main content area. The 8px (`2`) or 16px (`4`) spacing gap is your divider, not a line.

### The "Glass & Gradient" Rule
To inject "soul" into the enterprise environment:
- **Primary CTAs:** Use a subtle linear gradient from `primary` (#2a14b4) to `primary_container` (#4338ca) at a 135-degree angle.
- **AI Overlays:** Use Glassmorphism for floating insights. Apply `surface_container_lowest` at 70% opacity with a `backdrop-blur` of 12px. This ensures the "experience layer" feels integrated into the data beneath it.

---

### 3. Typography: Editorial Authority
We pair **Manrope** (Visionary/Confident) with **Inter** (Grounded/Functional).

- **Display & Headline (Manrope):** Use `display-lg` (3.5rem) for high-impact hero moments and taglines like *"Experience, understood."* The tracking should be slightly tightened (-0.02em) to feel premium.
- **Titles & Labels (Inter):** Use `title-md` (1.125rem) for functional headers. Inter’s high x-height ensures readability in complex data environments.
- **Actionability:** All `label-md` tokens should be uppercase with +0.05em letter spacing when used in buttons or navigation to project confidence.

---

## 4. Elevation & Depth: Tonal Layering
Traditional drop shadows are too "web 2.0." This system uses light and tone to imply physics.

- **The Layering Principle:** Depth is achieved by stacking. A card (`surface_container_lowest`) placed on a background (`surface_container_low`) creates a natural 3D lift without any CSS effects.
- **Ambient Shadows:** For "floating" components like Modals or AI Insight Popovers, use a multi-layered shadow:
  - `box-shadow: 0 4px 20px rgba(25, 28, 30, 0.04), 0 12px 40px rgba(25, 28, 30, 0.08);`
  - The shadow color is a tint of `on_surface`, never pure black.
- **The "Ghost Border":** If a border is required for accessibility in input fields, use `outline_variant` at 20% opacity. 100% opacity borders are prohibited.

---

## 5. Components: The Intelligence Primitives

### Buttons (The Action Layer)
- **Primary:** Gradient fill (`primary` to `primary_container`), white text, `lg` (0.5rem) roundedness. No border.
- **Secondary:** `surface_container_highest` background with `on_surface` text. Feels "carved" into the UI.
- **Tertiary:** No background. `primary` text. Use for low-emphasis actions.

### Cards & Insight Modules
- **Rule:** Forbid divider lines. Use `spacing-6` (1.5rem) to separate the header from the body.
- **Subtle 3D Effect:** Apply a 1px "inner glow" using a white stroke at 10% opacity on the top edge of cards to catch the "light."

### AI Input Fields
- **Styling:** Use `surface_container_low` as the base fill. On focus, transition to `surface_container_lowest` with a "Ghost Border" of `primary` at 20%.
- **Typography:** Placeholder text uses `body-md` in `on_surface_variant`.

### Action Chips
- Used for filtering "Intelligence."
- Style: `surface_container_high` background, `md` (0.375rem) roundedness. When active, shift to `primary` with `on_primary` text.

---

## 6. Do's and Don'ts

### Do:
- **Do** use white space as a structural tool. If the layout feels crowded, increase spacing to `spacing-12` or `spacing-16`.
- **Do** use the tagline *"The experience layer that learns."* in footer or "About" areas using `title-sm` in `secondary` color.
- **Do** overlap elements. An image or chart can slightly break the container boundary to create a high-end editorial feel.

### Don't:
- **Don't** use pure black (#000000). Use `on_surface` (#191c1e) for all "black" text.
- **Don't** use standard 1px borders to separate list items. Use a background color shift of 2% or simply 12px of vertical white space.
- **Don't** use sharp corners. Everything must adhere to the roundedness scale (Default: `0.25rem`, Cards: `lg` 0.5rem) to maintain the "Modern & Grounded" personality.