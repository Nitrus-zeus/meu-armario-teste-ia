// Pré-calcula os vetores de texto do Marqo-FashionCLIP para que o celular baixe só a parte de imagem.
// Rode fora do OneDrive, porque a instalação e o modelo ocupam mais de 300 MB:
//   npm install @huggingface/transformers@4.3.1
//   python pixel_pil.py sample_shirt.jpg pixel-pil-marqo.bin pixel-pil-pasma.bin
//   node gerar-rotulos.mjs rotulos.json ../rotulos-marqo.json pixel-pil-marqo.bin [pasta-local]
// A foto de referência usa os pixels do Pillow porque o processador do Transformers.js redimensiona
// de outro jeito, e a página reproduz o Pillow. O vetor de referência precisa vir da mesma preparação.
// A pasta local é opcional e evita a rede, o que ajuda quando há inspeção de HTTPS. Ela deve conter
// Marqo/marqo-fashionCLIP/ com os arquivos do modelo, e fotos/fashion-hippo.png.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  AutoProcessor,
  AutoTokenizer,
  CLIPTextModelWithProjection,
  CLIPVisionModelWithProjection,
  RawImage,
  Tensor,
  env,
} from '@huggingface/transformers';

const MODELO = 'Marqo/marqo-fashionCLIP';
const REVISAO = '44f4c655124ed71e90cbf528d82f508d69d8a81b';
const PRECISAO = 'fp16';
const FOTO_REFERENCIA = 'https://raw.githubusercontent.com/prikol5ist-art/Pasma/f8e77585d54944078e223e16e342d4ce4af579ac/examples/sample_shirt.jpg';
const FOTO_README = 'https://raw.githubusercontent.com/marqo-ai/marqo-FashionCLIP/main/docs/fashion-hippo.png';
const ESPERADO_README = [0.9998498302475922, 0.000119267522939106, 0.000030902229468640687];

const [, , entrada, saida, pixelsReferencia, pastaLocal] = process.argv;
if (!entrada || !saida || !pixelsReferencia) {
  throw new Error('Uso: node gerar-rotulos.mjs <rotulos.json> <saida.json> <pixels-referencia.bin> [pasta-local]');
}
if (pastaLocal) {
  env.localModelPath = pastaLocal;
  env.allowRemoteModels = false;
}

const normalizar = (v) => {
  const norma = Math.hypot(...v);
  return v.map((x) => x / norma);
};
const produto = (a, b) => a.reduce((soma, x, i) => soma + x * b[i], 0);
const emBase64 = (v) => Buffer.from(new Float32Array(v).buffer).toString('base64');
const softmax = (v) => {
  const e = v.map(Math.exp);
  const total = e.reduce((a, b) => a + b, 0);
  return e.map((x) => x / total);
};

const opcoes = { revision: REVISAO, dtype: PRECISAO, device: 'cpu' };
const tokenizador = await AutoTokenizer.from_pretrained(MODELO, { revision: REVISAO });
const modeloTexto = await CLIPTextModelWithProjection.from_pretrained(MODELO, opcoes);
const processador = await AutoProcessor.from_pretrained(MODELO, { revision: REVISAO });
const modeloImagem = await CLIPVisionModelWithProjection.from_pretrained(MODELO, opcoes);

async function vetoresDeTexto(frases) {
  const entradas = tokenizador(frases, { padding: 'max_length', truncation: true });
  const { text_embeds } = await modeloTexto(entradas);
  return text_embeds.tolist().map(normalizar);
}

async function vetorDaImagem(url) {
  const imagem = pastaLocal
    ? await RawImage.fromBlob(new Blob([readFileSync(join(pastaLocal, 'fotos', url.split('/').pop()))]))
    : await RawImage.read(url);
  const { image_embeds } = await modeloImagem(await processador(imagem));
  return normalizar(image_embeds.tolist()[0]);
}

// Confere o ambiente com o resultado publicado no README do modelo, antes de gerar qualquer rótulo.
const textosReadme = await vetoresDeTexto(['a hat', 'a t-shirt', 'shoes']);
const imagemReadme = await vetorDaImagem(FOTO_README);
const obtido = softmax(textosReadme.map((t) => 100 * produto(imagemReadme, t)));
console.log('README esperado:', ESPERADO_README.map((x) => x.toFixed(6)).join(' '));
console.log('README obtido:  ', obtido.map((x) => x.toFixed(6)).join(' '));
if (Math.abs(obtido[0] - ESPERADO_README[0]) > 0.001) throw new Error('Não reproduziu o resultado do README.');

const rotulos = JSON.parse(readFileSync(entrada, 'utf8'));
const grupos = {};
for (const [grupo, itens] of Object.entries(rotulos)) {
  grupos[grupo] = [];
  for (const { id, pt, frases } of itens) {
    const vetores = await vetoresDeTexto(frases);
    const media = normalizar(vetores[0].map((_, i) => vetores.reduce((soma, v) => soma + v[i], 0) / vetores.length));
    grupos[grupo].push({ id, pt, vetor: emBase64(media) });
  }
  console.log(`${grupo}: ${grupos[grupo].length} rótulos`);
}

const bytes = readFileSync(pixelsReferencia);
const pixels = new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
const { image_embeds: vetorReferencia } = await modeloImagem({
  pixel_values: new Tensor('float32', pixels, [1, 3, 224, 224]),
});
const referencia = normalizar(vetorReferencia.tolist()[0]);
const top = grupos.tipos
  .map(({ id, vetor }) => {
    const b = Buffer.from(vetor, 'base64');
    const v = new Float32Array(b.buffer, b.byteOffset, b.length / 4);
    return [id, produto(referencia, Array.from(v))];
  })
  .sort((a, b) => b[1] - a[1])
  .slice(0, 3);
console.log('Foto de referência (camisa), top 3:', top.map(([id, s]) => `${id} ${s.toFixed(3)}`).join(', '));

writeFileSync(
  saida,
  JSON.stringify({
    modelo: { id: MODELO, revisao: REVISAO, precisaoTexto: PRECISAO },
    grupos,
    referencia: { foto: FOTO_REFERENCIA, vetor: emBase64(referencia), precisao: PRECISAO },
  }),
);
console.log('Gravado em', saida);
