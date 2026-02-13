# SendSign Theme System Guide

## Overview

The signing-ui now features a complete dark/light/system theme with design tokens matching the marketing website.

## Theme System

### Using the Theme

1. **Wrap your components with ThemeProvider** (already done in App.tsx):
```tsx
import { ThemeProvider } from './contexts/ThemeContext';

<ThemeProvider>
  {/* Your app */}
</ThemeProvider>
```

2. **Use the theme hook**:
```tsx
import { useTheme } from './contexts/ThemeContext';

function MyComponent() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  // theme: 'light' | 'dark' | 'system'
  // resolvedTheme: 'light' | 'dark' (actual applied theme)
  // setTheme: function to change theme
}
```

3. **Add ThemeToggle component** to your header/sidebar:
```tsx
import { ThemeToggle } from './components/ThemeToggle';

<ThemeToggle />
```

## CSS Custom Properties

Use these CSS variables in your components:

### Colors
```css
/* Backgrounds */
var(--bg-deep)      /* Deepest background (page background) */
var(--bg-primary)   /* Primary background (cards, panels) */
var(--bg-elevated)  /* Elevated surfaces (headers, inputs) */

/* Borders */
var(--border)       /* Subtle borders */
var(--border-light) /* More visible borders */

/* Text */
var(--text-primary)   /* Primary text */
var(--text-secondary) /* Secondary text */
var(--text-tertiary)  /* Tertiary/muted text */

/* Brand */
var(--accent)       /* Brand orange #DE7356 */
var(--accent-hover) /* Darker orange for hover */
var(--accent-glow)  /* Accent with opacity for backgrounds */

/* Status Colors */
var(--green)      /* Success green */
var(--green-dim)  /* Success background */
var(--red)        /* Error red */
var(--red-dim)    /* Error background */
var(--yellow)     /* Warning yellow */
var(--yellow-dim) /* Warning background */
var(--blue)       /* Info blue */
var(--blue-dim)   /* Info background */

/* Shadows */
var(--shadow-sm)  /* Small shadow */
var(--shadow-md)  /* Medium shadow */
var(--shadow-lg)  /* Large shadow */
```

### Example Usage
```tsx
<div style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
  <h1 style={{ color: 'var(--text-primary)' }}>Hello</h1>
  <p style={{ color: 'var(--text-secondary)' }}>World</p>
</div>
```

## Component Classes

Use these pre-built component classes:

### Buttons
```tsx
<button className="btn-primary">Primary Action</button>
<button className="btn-secondary">Secondary Action</button>
```

### Cards
```tsx
<div className="card">Standard card</div>
<div className="card-elevated">Elevated card with shadow</div>
```

### Inputs
```tsx
<input className="input-field" placeholder="Enter text..." />
```

### Badges
```tsx
<span className="badge badge-success">Success</span>
<span className="badge badge-error">Error</span>
<span className="badge badge-warning">Warning</span>
<span className="badge badge-info">Info</span>
<span className="badge badge-accent">Accent</span>
```

### Tables
```tsx
<div className="table-container">
  <table>
    <thead className="table-header">
      <tr>
        <th>Column</th>
      </tr>
    </thead>
    <tbody>
      <tr className="table-row">
        <td>Data</td>
      </tr>
    </tbody>
  </table>
</div>
```

### Sidebar Navigation
```tsx
<div className="sidebar">
  <a className="sidebar-nav-item">Inactive</a>
  <a className="sidebar-nav-item active">Active</a>
</div>
```

### Modals
```tsx
<div className="modal-overlay">
  <div className="modal-content p-6">
    {/* Modal content */}
  </div>
</div>
```

## Typography

### Font Families
- **Headings**: `font-family: 'Poppins', sans-serif`
- **Body**: `font-family: 'DM Sans', sans-serif` (default)
- **Mono/Code**: `font-family: 'JetBrains Mono', monospace`

### Usage in JSX
```tsx
<h1 style={{ fontFamily: 'Poppins, sans-serif' }}>Heading</h1>
<p>Body text uses DM Sans by default</p>
<code className="font-mono">Code text</code>
```

## Theme Colors

### Dark Mode
```
--bg-deep: #121210
--bg-primary: #1a1a18
--bg-elevated: #222220
--border: rgba(255,255,255,0.06)
--text-primary: #f0ede6
--text-secondary: #a8a49c
--accent: #DE7356
```

### Light Mode
```
--bg-deep: #f8f7f4
--bg-primary: #ffffff
--bg-elevated: #f2f1ee
--border: rgba(0,0,0,0.08)
--text-primary: #1a1a18
--text-secondary: #5c5a55
--accent: #DE7356
```

## Best Practices

1. **Always use CSS variables** for colors instead of hardcoded hex values
2. **Use component classes** when possible (btn-primary, card, etc.)
3. **Test both themes** to ensure components look good in light and dark mode
4. **Use semantic colors** (use --green for success, --red for errors, etc.)
5. **Respect user's system preference** by defaulting to 'system' theme
6. **Border radius consistency**:
   - Buttons/inputs: `10px`
   - Cards/panels: `12px`
   - Modals: `16px`

## Animation Classes

```tsx
<div className="animate-fade-in">Fades in</div>
<div className="animate-scale-in">Scales in (for success icons)</div>
<div className="animate-toast-in">Slides from top (for toasts)</div>
<div className="animate-popover-in">Pops in (for popovers)</div>
<div className="animate-field-in">Field drop animation</div>
<button className="animate-send-pulse">Pulsing effect</button>
```

## Updating Existing Components

When updating components to use the theme system:

1. Replace hardcoded colors with CSS variables
2. Replace old button classes with `btn-primary` or `btn-secondary`
3. Replace card styling with `card` or `card-elevated`
4. Replace input styling with `input-field`
5. Update font families to use Poppins for headings
6. Ensure borders use `var(--border)` or `var(--border-light)`

### Before
```tsx
<button className="bg-blue-600 text-white px-4 py-2 rounded-lg">
  Click me
</button>
```

### After
```tsx
<button className="btn-primary">
  Click me
</button>
```

## Theme Persistence

The theme choice is automatically saved to `localStorage` with the key `sendsign-theme`. No additional code needed!

## Support

The theme system includes:
- ✅ Dark mode matching marketing site
- ✅ Light mode with complementary palette
- ✅ System default theme using `prefers-color-scheme`
- ✅ Smooth transitions between themes
- ✅ Persistent theme selection
- ✅ Reduced motion support
- ✅ Mobile-optimized styles
