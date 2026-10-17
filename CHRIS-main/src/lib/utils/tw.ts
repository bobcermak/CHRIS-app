import { extendTailwindMerge } from 'tailwind-merge'

/**
 * tailwind-merge that knows our custom type scale (brand.css @theme), so `text-nav` is treated
 * as a font size and not dropped as a conflicting text colour.
 */
export const tw = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: ['hero', 'display', 'title', 'heading', 'body', 'small', 'nav', 'meta'] }],
      'font-family': [{ font: ['display', 'sans', 'mono', 'nav'] }],
    },
  },
})
