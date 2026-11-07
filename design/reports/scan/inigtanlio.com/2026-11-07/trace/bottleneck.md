# Bottleneck: https://inigtanlio.com

Conditions: Pixel 7, CPU x4, 1600/750 kbps, RTT 150 ms

## Biggest bottleneck
**51 render-blocking resources (170 KB)**
Fix: Inline critical CSS, defer non-critical CSS/JS, remove unused plugin assets on this template.

## Ranked fixes
1. 51 render-blocking resources (170 KB)
   - Inline critical CSS, defer non-critical CSS/JS, remove unused plugin assets on this template.
2. LCP 10516 ms on DIV.elementor-element (254 KB, priority Low, initiator https://www.inigtanlio.com/wp-content/litespeed/css/8d851060be07b354fd610111f4e049a2.css?ver=049a2)
   - Preload the LCP image with fetchpriority=high, serve AVIF/WebP at rendered size, do not lazy-load it, remove any overlay/animation delaying paint.
3. Third parties 2035 KB across 6 hosts
   - Load analytics/chat/maps after interaction or via Partytown; top hosts: www.inigtanlio.com 1839 KB, www.googletagmanager.com 194 KB, analytics.google.com 1 KB
4. JavaScript 442 KB in 54 requests
   - Remove unused plugins/libraries, code-split, load builder/animation libs only on pages that use them.

## Numbers
```json
{
  "nav": {
    "ttfb": 305,
    "domContentLoaded": 8558,
    "load": 10499,
    "transferKB": 58
  },
  "paint": {
    "first-paint": 4116,
    "first-contentful-paint": 4140
  },
  "lcp": {
    "time": 10516,
    "size": 339076,
    "url": "https://www.inigtanlio.com/wp-content/uploads/2025/09/banner.webp",
    "el": "DIV.elementor-element"
  },
  "tbt": 50,
  "cls": 0,
  "byType": {
    "Document": {
      "n": 2,
      "kb": 113
    },
    "Stylesheet": {
      "n": 51,
      "kb": 256
    },
    "Image": {
      "n": 21,
      "kb": 873
    },
    "Fetch": {
      "n": 2,
      "kb": 1
    },
    "Script": {
      "n": 54,
      "kb": 442
    },
    "Font": {
      "n": 4,
      "kb": 369
    },
    "Ping": {
      "n": 1,
      "kb": 1
    }
  },
  "thirdParties": {
    "www.inigtanlio.com": {
      "requests": 109,
      "kb": 1839
    },
    "": {
      "requests": 21,
      "kb": 0
    },
    "www.googletagmanager.com": {
      "requests": 1,
      "kb": 194
    },
    "analytics.google.com": {
      "requests": 1,
      "kb": 1
    },
    "stats.g.doubleclick.net": {
      "requests": 1,
      "kb": 1
    },
    "www.google.com.ph": {
      "requests": 1,
      "kb": 0
    }
  },
  "domNodes": 7707,
  "jsHeapMB": 9.3
}
```