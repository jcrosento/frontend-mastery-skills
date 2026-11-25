# Using the layers in React

The spec becomes one stylesheet. Components read its variables and nothing else. Then a layer can change without opening a component.

## 1. Import once

```tsx
// src/main.tsx
import './styles/layers.css'; // written by: layers.mjs css design/layers/<name>/spec.json --out src/styles/layers.css
import './styles/components.css';
```

`layers.css` declares `@layer colour, type, space, shape, depth, motion, components;`. Put component styles in the last layer so they sit on top of the tokens:

```css
/* src/styles/components.css */
@layer components {
  .card {
    background: var(--color-surface);
    color: var(--color-text);
    border: var(--border-1) solid var(--color-border);
    border-radius: var(--radius-1);
    padding: var(--space-3);
    box-shadow: var(--shadow-1);
    transition: box-shadow var(--dur-1) var(--ease-1);
  }
  .card h2 { font-family: var(--font-heading); font-size: var(--text-3); font-weight: var(--weight-700); }
}
```

## 2. Components carry no numbers

```tsx
export function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <article className="card">
      <h2>{title}</h2>
      {children}
    </article>
  );
}
```

Not allowed in a component or its styles: a hex or rgb colour, a pixel font size, a radius, a shadow string, a duration. If a value is missing from `layers.css`, it is missing from the spec: ask the user, add it to `spec.json`, run `css` again.

With Tailwind, map the theme to the same variables (`colors: { accent: 'var(--color-accent)' }`, `borderRadius: { card: 'var(--radius-1)' }`) and do not use arbitrary values such as `text-[15px]`.

## 3. One layer per commit

| Commit | Touches | Then run |
|--------|---------|----------|
| Pages and structure | Routes, landmarks, headings, real content | `gate --layer structure` |
| Colour | Colour variables only | `gate --layer colour` |
| Type | Font loading, sizes, weights | `gate --layer type` |
| Space | Padding, margins, gaps | `gate --layer space` |
| Shape and depth | Radii, borders, shadows | `gate --layer shape,depth` |
| Motion | Transitions, reduced-motion | `gate --layer motion` |
| Interaction | Focus and hover states | `gate --layer interaction` |

Then the full gate, with no `--layer`, which is the one that is logged and can pass the build.

## 4. Changing the look later

A new Pinterest board changes one layer:

```bash
node skills/fe-layers/scripts/layers.mjs colour design/layers/<name>/spec.json design/style-guide/<board>/tokens.proposed.json
node skills/fe-layers/scripts/layers.mjs css design/layers/<name>/spec.json --out src/styles/layers.css
```

No component is opened. The gate then fails colour only if a component was holding a colour of its own.
