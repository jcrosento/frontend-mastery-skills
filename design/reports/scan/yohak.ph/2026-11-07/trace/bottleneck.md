# Bottleneck: https://yohak.ph

Conditions: Pixel 7, CPU x4, 1600/750 kbps, RTT 150 ms

## Biggest bottleneck
**LCP 15208 ms on H1#brxe-ckkzac.brxe-heading**
Fix: LCP is text: fix font loading (preload woff2, font-display swap) and render-blocking CSS.

## Ranked fixes
1. LCP 15208 ms on H1#brxe-ckkzac.brxe-heading
   - LCP is text: fix font loading (preload woff2, font-display swap) and render-blocking CSS.
2. 29 render-blocking resources (171 KB)
   - Inline critical CSS, defer non-critical CSS/JS, remove unused plugin assets on this template.
3. Images 5131 KB in 23 requests
   - Convert to AVIF/WebP, size to rendered width, lazy-load below fold, cap 2560px uploads.
4. Third parties 1016 KB across 7 hosts
   - Load analytics/chat/maps after interaction or via Partytown; top hosts: www.googletagmanager.com 731 KB, connect.facebook.net 278 KB, cdn-cookieyes.com 6 KB
5. JavaScript 1306 KB in 36 requests
   - Remove unused plugins/libraries, code-split, load builder/animation libs only on pages that use them.
6. Main-thread blocking 207 ms TBT across 8 long tasks
   - Defer/split heavy scripts; top attributions: 123ms window:; 106ms window:; 75ms window:

## Numbers
```json
{
  "nav": {
    "ttfb": 301,
    "domContentLoaded": 14119,
    "load": 39855,
    "transferKB": 55
  },
  "paint": {
    "first-paint": 3156,
    "first-contentful-paint": 3216
  },
  "lcp": {
    "time": 15208,
    "size": 18549,
    "url": null,
    "el": "H1#brxe-ckkzac.brxe-heading"
  },
  "tbt": 207,
  "cls": 0,
  "byType": {
    "Document": {
      "n": 1,
      "kb": 56
    },
    "Script": {
      "n": 36,
      "kb": 1306
    },
    "Font": {
      "n": 9,
      "kb": 709
    },
    "Stylesheet": {
      "n": 23,
      "kb": 128
    },
    "Image": {
      "n": 23,
      "kb": 5131
    },
    "Fetch": {
      "n": 4,
      "kb": 2
    },
    "XHR": {
      "n": 1,
      "kb": 1
    }
  },
  "thirdParties": {
    "cdn-cookieyes.com": {
      "requests": 1,
      "kb": 6
    },
    "www.googletagmanager.com": {
      "requests": 4,
      "kb": 731
    },
    "connect.facebook.net": {
      "requests": 2,
      "kb": 278
    },
    "pagead2.googlesyndication.com": {
      "requests": 1,
      "kb": 0
    },
    "www.google-analytics.com": {
      "requests": 1,
      "kb": 1
    },
    "ov-1d104299d2a447049cdc73700c9309f7.ecs.us-west-2.on.aws": {
      "requests": 1,
      "kb": 0
    },
    "www.facebook.com": {
      "requests": 1,
      "kb": 0
    }
  },
  "domNodes": 2160,
  "jsHeapMB": 14.9
}
```