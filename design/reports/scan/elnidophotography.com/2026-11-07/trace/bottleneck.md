# Bottleneck: https://elnidophotography.com

Conditions: Pixel 7, CPU x4, 1600/750 kbps, RTT 150 ms

## Biggest bottleneck
**LCP 5840 ms on VIDEO.bgVideo**
Fix: LCP is text: fix font loading (preload woff2, font-display swap) and render-blocking CSS.

## Ranked fixes
1. LCP 5840 ms on VIDEO.bgVideo
   - LCP is text: fix font loading (preload woff2, font-display swap) and render-blocking CSS.
2. Third parties 962 KB across 7 hosts
   - Load analytics/chat/maps after interaction or via Partytown; top hosts: stcdn.leadconnectorhq.com 594 KB, images.leadconnectorhq.com 220 KB, fonts.gstatic.com 126 KB
3. JavaScript 427 KB in 50 requests
   - Remove unused plugins/libraries, code-split, load builder/animation libs only on pages that use them.
4. 2 render-blocking resources (0 KB)
   - Inline critical CSS, defer non-critical CSS/JS, remove unused plugin assets on this template.

## Numbers
```json
{
  "nav": {
    "ttfb": 301,
    "domContentLoaded": 5747,
    "load": 5838,
    "transferKB": 65
  },
  "paint": {
    "first-paint": 940,
    "first-contentful-paint": 940
  },
  "lcp": {
    "time": 5840,
    "size": 249260,
    "url": "https://assets.cdn.filesafe.space/jSfrGTWJxwwYsdM5HjBO/media/6a314a31c87bd94b121a451b.mp4",
    "el": "VIDEO.bgVideo"
  },
  "tbt": 59,
  "cls": 0.065,
  "byType": {
    "Document": {
      "n": 1,
      "kb": 66
    },
    "Stylesheet": {
      "n": 10,
      "kb": 35
    },
    "Script": {
      "n": 50,
      "kb": 427
    },
    "Image": {
      "n": 5,
      "kb": 220
    },
    "Font": {
      "n": 8,
      "kb": 279
    },
    "XHR": {
      "n": 1,
      "kb": 0
    },
    "Other": {
      "n": 1,
      "kb": 0
    },
    "Fetch": {
      "n": 1,
      "kb": 1
    }
  },
  "thirdParties": {
    "fonts.googleapis.com": {
      "requests": 4,
      "kb": 11
    },
    "stcdn.leadconnectorhq.com": {
      "requests": 57,
      "kb": 594
    },
    "": {
      "requests": 1,
      "kb": 0
    },
    "static.cloudflareinsights.com": {
      "requests": 1,
      "kb": 10
    },
    "fonts.gstatic.com": {
      "requests": 6,
      "kb": 126
    },
    "images.leadconnectorhq.com": {
      "requests": 4,
      "kb": 220
    },
    "backend.leadconnectorhq.com": {
      "requests": 2,
      "kb": 1
    }
  },
  "domNodes": 5263,
  "jsHeapMB": 8.4
}
```