import torch
import clip
from PIL import Image
import os
import numpy as np

device = "cpu"
model, preprocess = clip.load("ViT-B/32", device=device)

image_folder = "images"
image_files = sorted(
    os.path.join(image_folder, f)
    for f in os.listdir(image_folder)
    if f.lower().endswith((".png", ".jpg", ".jpeg"))
)

embeddings = []
for path in image_files:
    img = Image.open(path)
    if img.mode != "RGB":
        img = img.convert("RGB")
    inp = preprocess(img).unsqueeze(0).to(device)

    with torch.no_grad():
        feat = model.encode_image(inp)

    embeddings.append(feat.cpu().numpy())
    del inp, feat
    if device == "cuda":
        torch.cuda.empty_cache()

embeddings_np = np.vstack(embeddings)
np.save("clip_embeddings.npy", embeddings_np)