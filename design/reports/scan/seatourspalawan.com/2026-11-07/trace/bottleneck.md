# Bottleneck: https://seatourspalawan.com

Conditions: Pixel 7, CPU x4, 1600/750 kbps, RTT 150 ms

## Biggest bottleneck
**CLS 0.693**
Fix: Reserve space for: MAIN#main (0.6134), DIV.hi-inner (0.0799). Set width/height on images and embeds, font size-adjust fallback.

## Ranked fixes
1. CLS 0.693
   - Reserve space for: MAIN#main (0.6134), DIV.hi-inner (0.0799). Set width/height on images and embeds, font size-adjust fallback.
2. LCP 2512 ms on IMG.hero-video-poster (130 KB, priority High, initiator https://seatourspalawan.com/)
   - Preload the LCP image with fetchpriority=high, serve AVIF/WebP at rendered size, do not lazy-load it, remove any overlay/animation delaying paint.
3. 1 render-blocking resources (1 KB)
   - Inline critical CSS, defer non-critical CSS/JS, remove unused plugin assets on this template.

## Numbers
```json
{
  "nav": {
    "ttfb": 359,
    "domContentLoaded": 998,
    "load": 2488,
    "transferKB": 23
  },
  "paint": {
    "first-paint": 424,
    "first-contentful-paint": 700
  },
  "lcp": {
    "time": 2512,
    "size": 301584,
    "url": "https://seatourspalawan.com/assets/video/hero/hero-loop-poster-mobile-720.webp?v=202605311023",
    "el": "IMG.hero-video-poster"
  },
  "tbt": 8,
  "cls": 0.693,
  "byType": {
    "Document": {
      "n": 1,
      "kb": 24
    },
    "Script": {
      "n": 10,
      "kb": 207
    },
    "Stylesheet": {
      "n": 2,
      "kb": 35
    },
    "Image": {
      "n": 5,
      "kb": 172
    },
    "Font": {
      "n": 2,
      "kb": 115
    },
    "Fetch": {
      "n": 3,
      "kb": 4
    },
    "XHR": {
      "n": 1,
      "kb": 0
    }
  },
  "thirdParties": {
    "static.cloudflareinsights.com": {
      "requests": 1,
      "kb": 10
    },
    "": {
      "requests": 1,
      "kb": 0
    },
    "www.googletagmanager.com": {
      "requests": 1,
      "kb": 156
    },
    "www.google.com": {
      "requests": 1,
      "kb": 0
    },
    "ad.doubleclick.net": {
      "requests": 1,
      "kb": 0
    }
  },
  "domNodes": 1734,
  "jsHeapMB": 3.4
}
```