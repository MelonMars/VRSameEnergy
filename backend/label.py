import torch
import clip
from PIL import Image
import os
import numpy as np

device = "cuda" if torch.cuda.is_available() else "cpu"
model, preprocess = clip.load("ViT-B/32", device=device)

image_folder = "images"
image_files = sorted([os.path.join(image_folder, f) for f in os.listdir(image_folder) if f.endswith(('.png','.jpg','.jpeg'))])

image_inputs = torch.stack([preprocess(Image.open(img)) for img in image_files]).to(device)

with torch.no_grad():
    image_features = model.encode_image(image_inputs)

embeddings_np = image_features.cpu().numpy()
np.save('clip_embeddings.npy', embeddings_np)
  