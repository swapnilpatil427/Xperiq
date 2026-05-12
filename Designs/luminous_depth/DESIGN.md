# Design System Strategy: Dimensional Intelligence

## 1. Overview & Creative North Star
**The Creative North Star: "The Tactile Ether"**

This design system moves beyond the flat, utilitarian nature of traditional SaaS platforms. Since the platform leverages AI to find "depth" in data, the UI must physically represent that depth. We are moving away from "The Web as a Page" and toward **"The Web as a Volume."**

The system achieves a premium, high-end editorial feel through **Atmospheric Layering**. We break the "template" look by using intentional asymmetry—placing 3D-inspired data visualizations partially overlapping glass containers—and utilizing a high-contrast typography scale. By blending the precision of Inter with the architectural character of Manrope, we create an interface that feels like a physical, high-tech instrument rather than a flat website.

---

## 2. Colors & Surface Philosophy
The palette is rooted in a professional "Studio Light" environment. We use cool neutrals as our base and vibrant gradients to signify intelligence and action.

### The Color Tokens
- **Core:** `primary` (#2a4bd9) and `tertiary` (#8329c8) drive the high-energy "AI" insights.
- **Accents:** `secondary` (#00647c) provides a grounding, professional teal for analytical data points.

### The "No-Line" Rule
**Standard 1px borders are strictly prohibited.** To define sections, designers must use tonal shifts.
- To separate a sidebar from a main content area, transition from `surface` (#f5f7f9) to `surface-container-low` (#eef1f3).
- **Boundaries are felt, not seen.**

### Surface Hierarchy & Nesting
Treat the UI as a series of nested, physical layers. 
- **Base Layer:** `surface` (The "Floor").
- **Secondary Containers:** `surface-container` (The "Plinth").
- **Interactive Elements:** `surface-container-lowest` (#ffffff) (The "Elevated Sheet").
By nesting a `#ffffff` card inside a `#e5e9eb` container, you create a natural lift that feels sophisticated and expensive.

### The "Glass & Gradient" Rule
Floating elements (modals, popovers, navigation bars) must use **Glassmorphism**. 
- **Recipe:** Apply `surface` at 70% opacity + 24px backdrop-blur. 
- **Soulful Gradients:** For CTAs and primary highlights, use a linear gradient: `primary` (#2a4bd9) to `primary-container` (#879aff) at a 135-degree angle. This mimics a light source hitting a 3D surface.

---

## 3. Typography: The Editorial Voice
We use a dual-font strategy to balance technical precision with human-centric insights.

- **The Architecture (Manrope):** Used for `display` and `headline` scales. Its geometric nature feels "designed" and high-end. Use `display-lg` (3.5rem) with tighter letter-spacing (-0.02em) for hero moments to create a bold, editorial impact.
- **The Engine (Inter):** Used for `title`, `body`, and `label` scales. Inter provides maximum legibility for complex data.
- **VR Accessibility:** Headings use generous `1.5rem` to `3.5rem` sizes to ensure clarity in spatial environments. Title-md (`1.125rem`) is the default for most interactive text to maintain high readability.

---

## 4. Elevation & Depth
In this system, depth is a functional tool, not just a decoration.

### The Layering Principle
Achieve hierarchy through **Tonal Stacking**. 
1. `surface-container-low` (Deepest)
2. `surface-container`
3. `surface-container-highest` (Closest to the user)
This creates an "extruded" look without using heavy shadows.

### Ambient Shadows
When an object must "float" (e.g., a 3D chart or a primary card):
- **Shadow:** Use the `on-surface` color (#2c2f31) at 6% opacity.
- **Blur:** 40px to 60px.
- **Spread:** -10px (to keep the shadow tucked under the object, mimicking soft studio lighting).

### The "Ghost Border" Fallback
If accessibility requires a container definition, use a **Ghost Border**:
- **Token:** `outline-variant` (#abadaf) at 15% opacity. It should be barely perceptible, serving as a subtle refraction of light on a glass edge.

---

## 5. Components & Interaction

### Tactical Buttons
- **Primary:** Gradient fill (`primary` to `primary-container`). Large rounded corners (`xl`: 3rem).
- **Interaction:** On hover, apply a `tilt` effect (rotateX 5deg) and a subtle `glow` (a shadow using the `primary` color at 20% opacity).
- **Tactile Feedback:** On click, use a slight scale-down (0.98) to mimic a physical button press.

### The 3D Insight Card
- **Structure:** Use `surface-container-lowest` (#ffffff).
- **Rounding:** `md` (1.5rem) for internal cards, `lg` (2rem) for main dashboard containers.
- **Content:** Forbid divider lines. Use `spacing-6` (2rem) to separate the header from the data. Use a `surface-variant` (#d9dde0) background for internal "code" or "data" snippets to create a recessed effect.

### Selection Chips
- **Style:** Pill-shaped (`full` rounding). 
- **State:** Unselected chips use `surface-container-high`. Selected chips use `primary` with `on-primary` text. This "pop" of color against a neutral background signals AI-driven selection.

### Glass Tooltips
- **Visuals:** 80% opacity `inverse-surface` with a heavy backdrop blur. This ensures the tooltip feels like it exists in a 3D space above the data.

---

## 6. Do’s and Don’ts

### Do:
- **Use "Breathing Room":** Always favor the larger end of the spacing scale (`spacing-8` or `12`) between major sections to maintain the editorial feel.
- **Embrace Asymmetry:** Place 3D assets slightly off-center or breaking the container bounds to create energy.
- **Tint Your Shadows:** Always use a hint of the background color in your shadows to avoid a "dirty" grey look.

### Don’t:
- **No Hard Borders:** Never use a 100% opaque border to separate content.
- **No Flat Charts:** Data visualizations should use the `secondary` to `tertiary` gradients and include a subtle "extrusion" (a bottom-heavy shadow) to look 3D.
- **No Pure Greys:** Our neutrals are slightly blue-tinted (`surface`). Avoid using `#000000` or neutral `#555555`.
- **No Tight Nesting:** Ensure internal padding of cards is at least `spacing-4` (1.4rem) to keep the "Light and Airy" promise.