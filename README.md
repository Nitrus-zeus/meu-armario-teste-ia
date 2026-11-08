# Teste de IA do Meu Armário Cápsula

Página que compara duas IAs abertas de reconhecimento de roupas no próprio celular. As fotos são analisadas no navegador e não são enviadas a nenhum servidor.

## Como usar

1. Abra a página no celular e escolha umas 10 peças.
2. Toque em **Comparar as IAs**. A primeira vez baixa cerca de 90 MB.
3. Diga o que é cada peça e confira as sugestões.
4. Toque em **Copiar resultado** e leve os números para a análise.

## Modelos

| Modelo | Arquivo usado | Download | Licença |
|---|---|---|---|
| [Pasma](https://github.com/prikol5ist-art/Pasma) | `pasma_small_320_fp32.onnx` | 21 MB | Apache-2.0 |
| [Marqo-FashionCLIP](https://github.com/marqo-ai/marqo-FashionCLIP) | `vision_model_q4f16.onnx` | 60 MB | Apache-2.0 |

Os modelos, o motor [ONNX Runtime Web](https://github.com/microsoft/onnxruntime) e as fotos de exemplo são baixados das fontes originais, em versões fixas. Nada disso fica neste repositório.

## Como a página se confere

Ao carregar cada modelo, a página analisa uma foto de referência e compara com um resultado conhecido. Se a placa gráfica divergir, ela passa para o processador. O resultado da conferência aparece no placar.

- **Pasma:** a referência é o valor publicado pelo projeto, 0,9594 para camisa.
- **Marqo:** a referência é o vetor da versão completa do modelo, com pixels preparados no Pillow.

A pasta `ferramentas` tem os rótulos e os scripts que geram `rotulos-marqo.json`.
