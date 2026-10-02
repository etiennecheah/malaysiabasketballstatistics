"""Square head-and-shoulders avatars cut from the portraits, one per player.

The portraits (296x340, head and chest) frame each face at a different size and
height, so no single CSS zoom fits them all: a fixed 250% crop cut some chins and
left others floating. Each face is found once (OpenCV's frontal-face cascade) and
a square is cut around it — face centred, the crop about 1.75x the face height so
hair and a sliver of shoulder show — then saved as a 96px WebP. A portrait where
no face is found falls back to the top-centre square, where the head sits in this
set. Output: {pid: data-URI}, embedded as DB.avatars.
"""
import base64, io
import numpy as np
import cv2
from PIL import Image

SIZE = 96
_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')


def _face(im):
    g = cv2.cvtColor(np.array(im.convert('RGB')), cv2.COLOR_RGB2GRAY)
    faces = _cascade.detectMultiScale(g, scaleFactor=1.08, minNeighbors=5, minSize=(40, 40))
    if not len(faces):
        return None
    return max(faces, key=lambda f: f[2] * f[3])       # the largest face is the player


def avatar(data_uri):
    raw = base64.b64decode(data_uri.split(',', 1)[1])
    im = Image.open(io.BytesIO(raw)).convert('RGBA')
    W, H = im.size
    f = _face(im)
    if f is not None:
        x, y, w, h = f
        side = int(h * 1.75)
        cx, cy = x + w / 2, y + h * 0.52                 # a touch below the eyes: hair above, chin and neck below
    else:
        side = int(W * 0.72)
        cx, cy = W / 2, side / 2 + H * 0.02
    side = min(side, W, H)
    l = int(round(min(max(cx - side / 2, 0), W - side)))
    t = int(round(min(max(cy - side / 2, 0), H - side)))
    crop = im.crop((l, t, l + side, t + side)).resize((SIZE, SIZE), Image.LANCZOS)
    buf = io.BytesIO()
    crop.save(buf, 'WEBP', quality=82, method=6)
    return 'data:image/webp;base64,' + base64.b64encode(buf.getvalue()).decode(), f is not None


def build(photos):
    out, found = {}, 0
    for pid, uri in photos.items():
        a, ok = avatar(uri)
        out[pid] = a
        found += ok
    return out, found
