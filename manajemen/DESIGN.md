---
name: Makalin Neo-Brutalist Ops
colors:
  surface: '#f9f9f9'
  surface-dim: '#dadada'
  surface-bright: '#f9f9f9'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f3f3f3'
  surface-container: '#eeeeee'
  surface-container-high: '#e8e8e8'
  surface-container-highest: '#e2e2e2'
  on-surface: '#1b1b1b'
  on-surface-variant: '#434655'
  inverse-surface: '#303030'
  inverse-on-surface: '#f1f1f1'
  outline: '#747686'
  outline-variant: '#c4c5d7'
  surface-tint: '#2151da'
  primary: '#0037b0'
  on-primary: '#ffffff'
  primary-container: '#1d4ed8'
  on-primary-container: '#cad3ff'
  inverse-primary: '#b7c4ff'
  secondary: '#735c00'
  on-secondary: '#ffffff'
  secondary-container: '#fed01b'
  on-secondary-container: '#6f5900'
  tertiary: '#8f0012'
  on-tertiary: '#ffffff'
  tertiary-container: '#b61722'
  on-tertiary-container: '#ffc8c3'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dce1ff'
  primary-fixed-dim: '#b7c4ff'
  on-primary-fixed: '#001551'
  on-primary-fixed-variant: '#0039b5'
  secondary-fixed: '#ffe083'
  secondary-fixed-dim: '#eec200'
  on-secondary-fixed: '#231b00'
  on-secondary-fixed-variant: '#574500'
  tertiary-fixed: '#ffdad7'
  tertiary-fixed-dim: '#ffb3ad'
  on-tertiary-fixed: '#410004'
  on-tertiary-fixed-variant: '#930013'
  background: '#f9f9f9'
  on-background: '#1b1b1b'
  surface-variant: '#e2e2e2'
typography:
  display-lg:
    fontFamily: Space Grotesk
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 52px
    letterSpacing: -0.03em
  display-lg-mobile:
    fontFamily: Space Grotesk
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 36px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Space Grotesk
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 38px
    letterSpacing: -0.02em
  headline-lg-mobile:
    fontFamily: Space Grotesk
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 30px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Space Grotesk
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 30px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Space Grotesk
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 26px
    letterSpacing: 0em
  body-lg:
    fontFamily: Space Grotesk
    fontSize: 16px
    fontWeight: '500'
    lineHeight: 24px
    letterSpacing: 0em
  body-md:
    fontFamily: Space Grotesk
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
    letterSpacing: 0em
  body-sm:
    fontFamily: Space Grotesk
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
    letterSpacing: 0em
  label-lg:
    fontFamily: Space Grotesk
    fontSize: 14px
    fontWeight: '700'
    lineHeight: 18px
    letterSpacing: 0.05em
  label-md:
    fontFamily: Space Grotesk
    fontSize: 12px
    fontWeight: '700'
    lineHeight: 16px
    letterSpacing: 0.06em
  label-sm:
    fontFamily: Space Grotesk
    fontSize: 10px
    fontWeight: '700'
    lineHeight: 12px
    letterSpacing: 0.08em
spacing:
  gutter: 1.5rem
  gutter-mobile: 1rem
  margin: 2rem
  margin-mobile: 1rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2.5rem
---

## Brand & Style

This design system is tailored for high-velocity internal enterprise operations, project tracking, and resource management within an Indonesian business context. The operational ethos values uncompromising clarity, immediate legibility, functional punch, and brutal honesty over corporate fluff. 

The aesthetic is grounded in **Neo-Brutalism**:
- High-contrast visual architecture featuring crisp, heavy black borders (`#000000`) and rigid boundaries.
- Flat, unblurred directional drop shadows that convey physical weight and tactile clickability without gradients or artificial lighting blurs.
- A foundational off-white textured paper base (`#FAFAF5`) that softens eye fatigue across long working shifts, overlaid with an optional subtle technical coordinate grid or micro-dot pattern.
- High-chroma saturated pop fills deployed surgically across project statuses, metric trackers, priority tags, and interactive surfaces.
- A voice that feels authoritative, utilitarian, energetic, and unapologetically systematic.

## Colors

The palette embraces stark, vibrant neo-brutalist blocking on top of a foundational tactile canvas. Gradients and transparency are strictly prohibited; all color surfaces are rendered with 100% opacity.

### Color Hierarchy & Roles
- **Canvas Base (`#FAFAF5`):** Warm off-white newsprint tone, reducing glare while maintaining stark contrast with pitch black.
- **Structural Black (`#000000`):** Used for all structural borders, typography, hard-edge shadows, and active divide rules.
- **Primary Cobalt (`#1D4ED8`):** Dominant focal color. Used for primary actions, current project stages, active table selections, and critical navigation state flags.
- **Accent Canary Yellow (`#FACC15`):** High-attention utility accent for "In Progress", pending approvals, alerts, and interactive chip hover triggers.
- **Semantic Coral Red (`#EF4444`):** Blocker states, overdue deadlines, critical defects, high-priority issues, and destructive confirm actions.
- **Semantic Mint Green (`#4ADE80`):** Completed initiatives, positive financial delta, approved deliverables, and operational health.
- **Supporting Lilac (`#C4B5FD`):** Cross-functional milestones, sprint retrospectives, product strategy modules, and team assignments.
- **Supporting Vivid Orange (`#FB923C`):** Impending milestones, staging servers, mid-level priority states, and review cycles.

## Typography

Typography relies on the geometric rigor, technical apertures, and punchy presence of **Space Grotesk** across all roles. 

### Typographic Rules
- **Headlines:** Set tight line heights with slightly negative tracking (`-0.02em` to `-0.03em`) to create dense, impactful editorial locks. Never use sentence styling for high-impact metric counters or dashboard titles—lean into bold weights (`700`).
- **Labels & Micro-data:** Render all metadata, status pills, table headers, breadcrumbs, and category tags in uppercase with expanded letter-spacing (`+0.05em` to `+0.08em`) to enforce structural precision.
- **Numbers and Currency (IDR):** Financial and metric figures (such as `Rp 1.450.000.000`) should be set at weight `700` alongside tabular numerals to retain vertical alignment in dense tables.

## Layout & Spacing

The layout is built on a rigid 12-column fluid grid system paired with strict mathematical increments divisible by 4px and 8px.

### Breakpoints & Layout Adapters
- **Desktop (1280px and above):** 12-column grid with `2rem` outer page margins and `1.5rem` internal gutters. Multi-pane dashboard sidebars are fixed-width (`280px`), boxed with a right-hand `3px` solid black border, and fixed against the fluid content area.
- **Tablet (768px – 1279px):** 8-column layout. Gaps condense to `1rem`. Secondary analytical panels collapse into vertical stacks or horizontally swipeable swimlanes.
- **Mobile (< 768px):** 4-column layout with `1rem` edge margin. Hard sidebars convert into full-bleed overlay drawer panels flanked by bold perimeter borders.

### Canvas Grid Background
The viewport background utilizes a repeating technical dot matrix:
- **Dot Pattern:** 1px by 1px dots (`#000000` at 12% alpha) arranged in a strict `24px x 24px` grid pattern across the `#FAFAF5` canvas, establishing the drafting-paper tone.

## Elevation & Depth

This system discards blur-based shadows, ambient lighting diffusion, and Z-axis glass effects entirely. Depth is achieved purely through **Hard Offset Drop Shadows** and **Structural Heavy Outlines**.

### Elevation Scale
- **Level 0 (Flat / Inset):** No shadow, `2.5px` or `3px` solid `#000000` border. Applied to static table cells, form inputs, and muted background groupings.
- **Level 1 (Resting Component):** `3px 3px 0px #000000` offset shadow. Standard state for operational cards, data widgets, badges, and inactive buttons.
- **Level 2 (Interactive Floating / Hover):** `5px 5px 0px #000000` offset shadow. Applied to active popovers, dropdown menus, focused input modules, and hovering action cards.
- **Level 3 (Modal / Critical Dialog):** `8px 8px 0px #000000` offset shadow with an absolute `3px` perimeter border. Modals sit over an off-white `#FAFAF5` backdrop scrim overlaid with a 50% diagonal black hatching or pure `#000000` at 40% opacity.

### Interaction Kinetics
When interactive elements (e.g., buttons, toggles, row actions) are clicked or pressed:
- Translate the element along the X and Y axes toward the shadow: `transform: translate(3px, 3px);`
- Collapse the drop shadow: `box-shadow: 0px 0px 0px #000000;`
- This mimics physical depression of a physical tactile stamp or micro-switch.

## Shapes

The design system enforces architectural geometry.
- **Border Radius:** Default radius is strictly `0px` (sharp). Under select compact touch targets (such as micro-tags), a subtle rounding of no more than `2px` to `4px` is acceptable, but absolute 90-degree corners are preferred throughout.
- **Borders:** Every standalone surface, interactive trigger, modal container, and data-table container must declare a continuous `2.5px` (desktop compact) or `3px` (standard/prominent) solid `#000000` border.
- **Prohibited:** Oval pills, continuous circles for status tags, and soft, modern pill buttons are strictly forbidden.

## Components

### Buttons
- **Primary:** Background `#1D4ED8`, text `#FFFFFF`, `3px` solid `#000000` border, `4px 4px 0 #000000` offset shadow. Font weight `700`, uppercase, with `0.05em` tracking. Hover expands shadow to `5px 5px 0 #000000`; active press translates `translate(4px, 4px)` and clears shadow to `0 0 0`.
- **Secondary / Action:** Solid `#FACC15` (Canary) or `#FAFAF5` (Off-white), text `#000000`, `3px` solid `#000000` border, `4px 4px 0 #000000` shadow.
- **Destructive:** Solid `#EF4444`, text `#FFFFFF`, `3px` solid `#000000` border, `4px 4px 0 #000000` shadow.

### Chips & Status Badges
- Hard rectangular blocks with `2px` solid black borders and `0px` radius.
- Always uppercase text (`label-sm` or `label-md`).
- Fills indicate status:
  - **Active / On Track:** `#4ADE80` (Mint) with `#000000` text.
  - **In Review / Pending:** `#FACC15` (Canary) with `#000000` text.
  - **Blocked / High Priority:** `#EF4444` (Coral) with `#FFFFFF` text.
  - **Discovery / Sprint:** `#C4B5FD` (Lilac) with `#000000` text.
  - **Staging / Attention:** `#FB923C` (Orange) with `#000000` text.

### Data Tables
- Encased within an outer `3px` solid black bounding box with a `4px 4px 0 #000000` shadow.
- **Header Row:** Solid `#000000` background with crisp `#FAFAF5` uppercase text, or solid `#FACC15` background with bold black text.
- **Data Rows:** Alternating `#FAFAF5` and `#FFFFFF` rows separated by `2px` solid `#000000` horizontal rules. 
- **Row Hover:** Entire row changes to a solid tint of `#C4B5FD` or `#1D4ED8` (at 10% opacity) with a solid black outline on the hovered row cells.

### Form Inputs & Selects
- Background `#FFFFFF`, text `#000000`, framed with a `2.5px` solid `#000000` border.
- `0px` border-radius.
- **Focus State:** Background stays `#FFFFFF`, border remains `2.5px` black, and an offset `4px 4px 0px #1D4ED8` shadow appears instantly without transitions.
- **Error State:** Border shifts to `3px #EF4444` with a `4px 4px 0px #EF4444` shadow.

### Checkboxes & Radios
- **Checkbox:** Square box (`20px x 20px`), `2.5px` solid `#000000` border, `0px` border-radius. When checked: fill becomes `#1D4ED8` containing a heavy, sharp black or white geometric check mark.
- **Radio Button:** Retains square geometry (`20px x 20px`) with an internal centered solid black square (`10px x 10px`) when selected to align with the neo-brutalist motif.

### Cards & Analytical Widgets
- Pure white (`#FFFFFF`) or pale tinted surface with a prominent `3px` solid `#000000` outline and resting `5px 5px 0px #000000` hard shadow.
- **Header Module:** Divided from card body by a continuous `2.5px` solid horizontal rule, frequently utilizing a contrasting pop fill (e.g., header bar filled with `#FACC15` or `#C4B5FD`).