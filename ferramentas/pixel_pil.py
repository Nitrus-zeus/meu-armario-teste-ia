"""Gera tensores de referencia com Pillow, igual ao pre-processamento dos dois modelos."""
import sys

import numpy as np
from PIL import Image, ImageOps

foto, saida_marqo, saida_pasma = sys.argv[1:4]
imagem = ImageOps.exif_transpose(Image.open(foto)).convert("RGB")
print("foto", imagem.size)

# Marqo: lado menor em 224 com bicubica, recorte central e normalizacao do CLIP.
l, a = imagem.size
curto, longo = min(l, a), max(l, a)
novo_longo = int(224 * longo / curto)
tamanho = (224, novo_longo) if l <= a else (novo_longo, 224)
reduzida = imagem.resize(tamanho, Image.Resampling.BICUBIC)
x0 = int(round((reduzida.width - 224) / 2.0))
y0 = int(round((reduzida.height - 224) / 2.0))
recorte = np.asarray(reduzida.crop((x0, y0, x0 + 224, y0 + 224)), dtype=np.float32) / 255.0
media = np.array([0.48145466, 0.4578275, 0.40821073], dtype=np.float32)
desvio = np.array([0.26862954, 0.26130258, 0.27577711], dtype=np.float32)
marqo = ((recorte - media) / desvio).transpose(2, 0, 1)
marqo.astype(np.float32).tofile(saida_marqo)
for c in range(3):
    print("marqo canal", c, "media", round(float(marqo[c].mean()), 4))

# Pasma: lado maior em 320 com bilinear, centralizado sobre cinza e sem normalizacao.
lado = 320
escala = lado / max(imagem.size)
tam = tuple(max(1, round(v * escala)) for v in imagem.size)
pequena = imagem.resize(tam, Image.Resampling.BILINEAR)
tela = Image.new("RGB", (lado, lado), (128, 128, 128))
tela.paste(pequena, ((lado - pequena.width) // 2, (lado - pequena.height) // 2))
pasma = (np.asarray(tela, dtype=np.float32) / 255.0).transpose(2, 0, 1)
pasma.astype(np.float32).tofile(saida_pasma)
for c in range(3):
    print("pasma canal", c, "media", round(float(pasma[c].mean()), 4))
