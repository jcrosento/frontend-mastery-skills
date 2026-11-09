#!/usr/bin/env python3
"""fe-legend: pixel analysis of a poster legend. Usage: analyze_legend.py image.jpg [x0 y0 x1 y1]"""
import sys, json
import numpy as np
from PIL import Image
from sklearn.cluster import KMeans

def palette(arr, k):
    km = KMeans(k, n_init=3, random_state=0).fit(arr[::7])
    cnt = np.bincount(km.labels_)
    return [("#%02x%02x%02x" % tuple(int(v) for v in km.cluster_centers_[i]), round(cnt[i]/cnt.sum()*100, 1)) for i in np.argsort(-cnt)]

def rows_from_mask(mask, col_limit=40):
    runs, s = [], None
    for y in range(mask.shape[0]):
        hit = mask[y, :col_limit].any()
        if hit and s is None: s = y
        if not hit and s is not None: runs.append((s, y)); s = None
    if s is not None: runs.append((s, mask.shape[0]))
    return runs

def main():
    im = Image.open(sys.argv[1]).convert("RGB")
    w, h = im.size
    full = np.array(im).reshape(-1, 3).astype(float)
    out = {"canvas": [w, h], "palette": palette(full, 8)}
    if len(sys.argv) >= 6:
        box = tuple(int(v) for v in sys.argv[2:6])
        leg = im.crop(box)
        hsv = np.array(leg.convert("HSV"))
        mask = (hsv[:, :, 1] > 120) & (hsv[:, :, 2] > 120)
        runs = rows_from_mask(mask)
        tiles = [(a, b, b - a) for a, b in runs]
        pitch = [tiles[i+1][0] - tiles[i][0] for i in range(len(tiles)-1)]
        out["legend"] = {"bbox": box, "bbox_pct": [round(box[0]/w*100,1), round(box[1]/h*100,1), round(box[2]/w*100,1), round(box[3]/h*100,1)],
                         "rows": len(tiles), "tile_heights_px": [t[2] for t in tiles], "row_pitch_px": pitch,
                         "palette": palette(np.array(leg).reshape(-1, 3).astype(float), 4)}
    print(json.dumps(out, indent=2))

if __name__ == "__main__":
    main()
