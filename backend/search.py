from fastapi import FastAPI, Query, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from typing import List
import clip
import torch
import numpy as np
import os 
from PIL import Image
import hashlib

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:5500"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["X-Conversation-Id"] 
)   
app.mount("/images", StaticFiles(directory="images"), name="images")

device = "cuda" if torch.cuda.is_available() else "cpu"

image_embedding_cache = dict()

def embed_image(file_bytes: bytes):
    image = Image.open(io.BytesIO(file_bytes)).convert("RGB")
    image_input = preprocess(image).unsqueeze(0).to(device)
    with torch.no_grad():
        emb = model.encode_image(image_input)
        emb /= emb.norm(dim=-1, keepdim=True)
    return emb

def hash_image_bytes(file_bytes: bytes) -> str:
    return hashlib.sha256(file_bytes).hexdigest()

model, preprocess = clip.load("ViT-B/32", device=device)
image_embeddings = torch.from_numpy(np.load('clip_embeddings.npy')).to(device) 

image_folder = 'images'
image_files = sorted([f for f in os.listdir(image_folder) if f.endswith(('.png','.jpg','.jpeg'))])

@app.get("/search_text/")
def search_images(text: str = Query(..., min_length=1), top_k: int = 2):
    with torch.no_grad():
        text_tokens = clip.tokenize([text]).to(device)
        text_embedding = model.encode_text(text_tokens)
        text_embedding /= text_embedding.norm(dim=-1, keepdim=True)

        img_emb_norm = image_embeddings / image_embeddings.norm(dim=-1, keepdim=True)
        similarities = (img_emb_norm @ text_embedding.T).squeeze(1)
        top_k_indices = similarities.topk(top_k).indices.cpu().tolist()

    image_urls = [f"/images/{image_files[i]}" for i in top_k_indices]
    return {"images": image_urls} 

@app.post("/search_image/")
async def search_by_image(file: UploadFile = File(...), top_k: int = 3):
    file_bytes = await file.read()
    img_hash = hash_image_bytes(file_bytes)

    if img_hash in image_embedding_cache:
        query_embedding = image_embedding_cache[img_hash]
    else:
        query_embedding = embed_image(file_bytes)
        image_embedding_cache[img_hash] = query_embedding

    similarities = (image_embeddings @ query_embedding.T).squeeze(1)
    top_k_indices = similarities.topk(top_k).indices.cpu().tolist()
    image_urls = [f"/images/{image_files[i]}" for i in top_k_indices]
    
    return {"images": image_urls}