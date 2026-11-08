'use strict';

const ORT_VERSAO = '1.30.0';
const PASMA = 'https://huggingface.co/Prikol5ist/pasma/resolve/5346fc6adf7c345fef3ff0ac84abfc11a210b959/models/';
const MARQO = 'https://huggingface.co/Marqo/marqo-fashionCLIP/resolve/44f4c655124ed71e90cbf528d82f508d69d8a81b/onnx/';
const AMOSTRAS = 'https://huggingface.co/spaces/Prikol5ist/pasma/resolve/716436512c13abc6b40c28a3eb9297a4863ab62c/assets/samples/';
const FOTO_REFERENCIA = 'https://raw.githubusercontent.com/prikol5ist-art/Pasma/f8e77585d54944078e223e16e342d4ce4af579ac/examples/sample_shirt.jpg';

const NOME_CACHE = 'armario-teste-v1';
const CHAVE_ETAPA = 'armario-teste-etapa';
const CHAVE_QUEDAS = 'armario-teste-quedas';
const MAX_FOTOS = 20;
const LADO_FOTO = 1024;

const MATERIAIS = {
  cotton: 'Algodão', linen: 'Linho', wool: 'Lã', cashmere: 'Caxemira', silk: 'Seda', denim: 'Jeans',
  corduroy: 'Veludo cotelê', tweed: 'Tweed', polyester: 'Poliéster', nylon: 'Náilon',
  spandex_elastane: 'Elastano', acrylic: 'Acrílico', rayon_viscose: 'Viscose', fleece: 'Fleece',
  technical_synthetic: 'Sintético técnico', leather_smooth: 'Couro liso', leather_suede: 'Camurça',
  leather_patent: 'Verniz', rubber: 'Borracha', metal_hardware: 'Metal', blend_unspecified: 'Mistura de fibras',
};

const PALETA = [
  ['Preto', 25, 25, 28], ['Branco', 245, 245, 242], ['Cinza', 128, 128, 130], ['Cinza-claro', 195, 195, 197],
  ['Bege', 214, 197, 165], ['Creme', 240, 230, 205], ['Marrom', 105, 70, 45], ['Caramelo', 170, 115, 65],
  ['Azul-marinho', 28, 38, 75], ['Azul', 45, 95, 175], ['Azul-claro', 160, 195, 225], ['Azul-jeans', 75, 105, 145],
  ['Verde', 45, 125, 75], ['Verde-oliva', 95, 100, 55], ['Verde-claro', 165, 210, 160], ['Amarelo', 240, 205, 60],
  ['Mostarda', 195, 150, 45], ['Laranja', 230, 125, 45], ['Vermelho', 195, 40, 45], ['Vinho', 105, 25, 45],
  ['Rosa', 235, 150, 175], ['Rosa-claro', 245, 205, 215], ['Roxo', 100, 60, 140], ['Lilás', 190, 165, 215],
];

// "Camisa" também é usado para camiseta no dia a dia. O menu deixa claro qual é qual.
const ROTULOS_MENU = {
  SHIRT: 'Camisa: com gola e botões',
  T_SHIRT: 'Camiseta: sem botões',
};

const AVALIACOES = {
  cor: 'Cor (cálculo, sem IA)',
  material: 'Material (Pasma)',
  estampa: 'Estampa (Marqo)',
  estilo: 'Estilo (Marqo)',
};

const $ = (id) => document.getElementById(id);
const pausa = (ms = 20) => new Promise((resolver) => setTimeout(resolver, ms));
const produto = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };
const mb = (bytes) => `${Math.round(bytes / 1e6)} MB`;
const pct = (x) => `${(x * 100).toFixed(x >= 0.995 || x < 0.1 ? 1 : 0).replace('.', ',')}%`;
const lerArmazenado = (chave) => { try { return JSON.parse(localStorage.getItem(chave)); } catch { return null; } };
const gravarArmazenado = (chave, valor) => {
  try {
    if (valor === null) localStorage.removeItem(chave);
    else localStorage.setItem(chave, JSON.stringify(valor));
  } catch { /* Sem armazenamento, o teste funciona, só não registra quedas. */ }
};

const estado = {
  fotos: [],
  modelos: {},
  meta: null,
  quedas: lerArmazenado(CHAVE_QUEDAS) || [],
  rodando: false,
  gpu: null,
  proximoId: 1,
};

function el(tag, atributos = {}, ...filhos) {
  const elemento = document.createElement(tag);
  for (const [nome, valor] of Object.entries(atributos)) {
    if (nome === 'class') elemento.className = valor;
    else if (nome.startsWith('on')) elemento.addEventListener(nome.slice(2), valor);
    else if (valor !== false && valor != null) elemento.setAttribute(nome, valor === true ? '' : valor);
  }
  elemento.append(...filhos.flat(Infinity).filter((f) => f != null));
  return elemento;
}

function mostrarErro(id, mensagem) {
  $(id).textContent = mensagem || '';
  $(id).hidden = !mensagem;
}

// ---------- Downloads ----------

async function abrirCache() {
  try { return 'caches' in self ? await caches.open(NOME_CACHE) : null; } catch { return null; }
}

async function baixar(url, bytesEsperados, aoProgredir) {
  const cache = await abrirCache();
  const salvo = cache && await cache.match(url).catch(() => null);
  if (salvo) return { dados: new Uint8Array(await salvo.arrayBuffer()), doCache: true };

  const resposta = await fetch(url);
  if (!resposta.ok) throw new Error(`O download falhou (código ${resposta.status}).`);
  const leitor = resposta.body.getReader();
  let dados = new Uint8Array(bytesEsperados || 1 << 20);
  let total = 0;
  for (;;) {
    const { done, value } = await leitor.read();
    if (done) break;
    if (total + value.length > dados.length) {
      const maior = new Uint8Array(Math.max(dados.length * 2, total + value.length));
      maior.set(dados);
      dados = maior;
    }
    dados.set(value, total);
    total += value.length;
    if (aoProgredir && bytesEsperados) aoProgredir(total / bytesEsperados);
  }
  dados = dados.length === total ? dados : dados.slice(0, total);
  if (bytesEsperados && total !== bytesEsperados) throw new Error('O arquivo veio incompleto. Tente de novo.');
  if (cache) await cache.put(url, new Response(dados)).catch(() => {});
  return { dados, doCache: false };
}

async function baixarJSON(url) {
  const { dados } = await baixar(url);
  return JSON.parse(new TextDecoder().decode(dados));
}

function abrirImagem(blob) {
  return new Promise((resolver, rejeitar) => {
    const imagem = new Image();
    const url = URL.createObjectURL(blob);
    imagem.onload = () => { URL.revokeObjectURL(url); resolver(imagem); };
    imagem.onerror = () => { URL.revokeObjectURL(url); rejeitar(new Error('Não consegui abrir esta foto.')); };
    imagem.src = url;
  });
}

// ---------- Imagem ----------

function novaTela(largura, altura) {
  const tela = document.createElement('canvas');
  tela.width = largura;
  tela.height = altura;
  return tela;
}

// Reduz em etapas: desenhar uma foto grande direto em 320 px perde detalhes e serrilha as bordas.
function reduzir(imagem, largura, altura) {
  let fonte = imagem;
  let l = imagem.naturalWidth || imagem.width;
  let a = imagem.naturalHeight || imagem.height;
  while (l >= largura * 2 && a >= altura * 2) {
    l = Math.ceil(l / 2);
    a = Math.ceil(a / 2);
    const metade = novaTela(l, a);
    const ctx = metade.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(fonte, 0, 0, l, a);
    fonte = metade;
  }
  const final = novaTela(largura, altura);
  const ctx = final.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(fonte, 0, 0, largura, altura);
  return final;
}

// Os modelos foram treinados com o redimensionamento do Pillow. O do canvas muda de navegador para
// navegador e altera as respostas, então refazemos aqui o mesmo cálculo em todos os aparelhos.
const FILTROS = {
  bilinear: { suporte: 1, f: (x) => { const d = Math.abs(x); return d < 1 ? 1 - d : 0; } },
  bicubico: {
    suporte: 2,
    f: (x) => {
      const d = Math.abs(x);
      if (d < 1) return (1.5 * d - 2.5) * d * d + 1;
      return d < 2 ? (((d - 5) * d + 8) * d - 4) * -0.5 : 0;
    },
  },
};

function coeficientes(tamanhoFonte, tamanhoDestino, filtro) {
  const escala = tamanhoFonte / tamanhoDestino;
  const fator = Math.max(escala, 1);
  const alcance = filtro.suporte * fator;
  return Array.from({ length: tamanhoDestino }, (_, i) => {
    const centro = (i + 0.5) * escala;
    const inicio = Math.max(0, Math.trunc(centro - alcance + 0.5));
    const fim = Math.min(tamanhoFonte, Math.trunc(centro + alcance + 0.5));
    const pesos = new Float32Array(fim - inicio);
    let soma = 0;
    for (let x = inicio; x < fim; x++) {
      pesos[x - inicio] = filtro.f((x - centro + 0.5) / fator);
      soma += pesos[x - inicio];
    }
    for (let k = 0; k < pesos.length; k++) pesos[k] /= soma;
    return { inicio, pesos };
  });
}

const paraByte = (v) => (v <= 0 ? 0 : v >= 255 ? 255 : Math.round(v));

// Recebe RGBA e devolve RGB, arredondando a cada passada como o Pillow faz com 8 bits.
function redimensionar(rgba, largura, altura, novaLargura, novaAltura, filtro) {
  const horizontais = coeficientes(largura, novaLargura, filtro);
  const verticais = coeficientes(altura, novaAltura, filtro);
  const meio = new Uint8ClampedArray(novaLargura * altura * 3);
  for (let y = 0; y < altura; y++) {
    const base = y * largura * 4;
    for (let x = 0; x < novaLargura; x++) {
      const { inicio, pesos } = horizontais[x];
      let r = 0;
      let g = 0;
      let b = 0;
      for (let k = 0; k < pesos.length; k++) {
        const p = base + (inicio + k) * 4;
        r += rgba[p] * pesos[k];
        g += rgba[p + 1] * pesos[k];
        b += rgba[p + 2] * pesos[k];
      }
      const destino = (y * novaLargura + x) * 3;
      meio[destino] = paraByte(r);
      meio[destino + 1] = paraByte(g);
      meio[destino + 2] = paraByte(b);
    }
  }
  const saida = new Uint8ClampedArray(novaLargura * novaAltura * 3);
  for (let y = 0; y < novaAltura; y++) {
    const { inicio, pesos } = verticais[y];
    for (let x = 0; x < novaLargura; x++) {
      for (let c = 0; c < 3; c++) {
        let v = 0;
        for (let k = 0; k < pesos.length; k++) v += meio[((inicio + k) * novaLargura + x) * 3 + c] * pesos[k];
        saida[(y * novaLargura + x) * 3 + c] = paraByte(v);
      }
    }
  }
  return saida;
}

function lerPixels(imagem) {
  const largura = imagem.naturalWidth;
  const altura = imagem.naturalHeight;
  const ctx = novaTela(largura, altura).getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, largura, altura);
  ctx.drawImage(imagem, 0, 0);
  return { rgba: ctx.getImageData(0, 0, largura, altura).data, largura, altura };
}

// Pasma: lado maior em 320 com bilinear, centralizado sobre cinza. A normalização está dentro do modelo.
function dadosPasma(imagem) {
  const lado = 320;
  const { rgba, largura, altura } = lerPixels(imagem);
  const escala = lado / Math.max(largura, altura);
  const l = Math.max(1, Math.round(largura * escala));
  const a = Math.max(1, Math.round(altura * escala));
  const rgb = redimensionar(rgba, largura, altura, l, a, FILTROS.bilinear);
  const x0 = Math.floor((lado - l) / 2);
  const y0 = Math.floor((lado - a) / 2);
  const n = lado * lado;
  const dados = new Float32Array(3 * n).fill(128 / 255);
  for (let y = 0; y < a; y++) {
    for (let x = 0; x < l; x++) {
      const destino = (y + y0) * lado + x + x0;
      for (let c = 0; c < 3; c++) dados[c * n + destino] = rgb[(y * l + x) * 3 + c] / 255;
    }
  }
  return dados;
}

// Marqo: lado menor em 224 com bicúbica, recorte central e normalização do CLIP.
function dadosMarqo(imagem) {
  const lado = 224;
  const media = [0.48145466, 0.4578275, 0.40821073];
  const desvio = [0.26862954, 0.26130258, 0.27577711];
  const { rgba, largura, altura } = lerPixels(imagem);
  const curto = Math.min(largura, altura);
  const longo = Math.trunc((lado * Math.max(largura, altura)) / curto);
  const l = largura <= altura ? lado : longo;
  const a = largura <= altura ? longo : lado;
  const rgb = redimensionar(rgba, largura, altura, l, a, FILTROS.bicubico);
  const x0 = Math.round((l - lado) / 2);
  const y0 = Math.round((a - lado) / 2);
  const n = lado * lado;
  const dados = new Float32Array(3 * n);
  for (let y = 0; y < lado; y++) {
    for (let x = 0; x < lado; x++) {
      for (let c = 0; c < 3; c++) {
        dados[c * n + y * lado + x] = (rgb[((y + y0) * l + x + x0) * 3 + c] / 255 - media[c]) / desvio[c];
      }
    }
  }
  return dados;
}

const tensorPasma = (imagem) => new ort.Tensor('float32', dadosPasma(imagem), [1, 3, 320, 320]);
const tensorMarqo = (imagem) => new ort.Tensor('float32', dadosMarqo(imagem), [1, 3, 224, 224]);

// ---------- Cor ----------

function rgbParaLab(r, g, b) {
  const linear = (v) => { const x = v / 255; return x > 0.04045 ? ((x + 0.055) / 1.055) ** 2.4 : x / 12.92; };
  const [lr, lg, lb] = [linear(r), linear(g), linear(b)];
  const x = (0.4124 * lr + 0.3576 * lg + 0.1805 * lb) / 0.95047;
  const y = 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
  const z = (0.0193 * lr + 0.1192 * lg + 0.9505 * lb) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

const PALETA_LAB = PALETA.map(([nome, r, g, b]) => ({ nome, lab: rgbParaLab(r, g, b), css: `rgb(${r},${g},${b})` }));
const distancia2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
// A claridade depende muito da luz da foto, então ela pesa menos que o tom na hora de dar nome à cor.
const distanciaNome = (a, b) => ((a[0] - b[0]) * 0.5) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
const coresMaisProximas = (lab) => [...PALETA_LAB].sort((p, q) => distanciaNome(lab, p.lab) - distanciaNome(lab, q.lab));

function agruparCores(pontos, k) {
  const ordenados = [...pontos].sort((p, q) => p.lab[0] - q.lab[0]);
  let centros = Array.from({ length: k }, (_, i) => ordenados[Math.floor(((i + 0.5) / k) * ordenados.length)].lab);
  let grupos = [];
  for (let volta = 0; volta < 8; volta++) {
    grupos = centros.map(() => ({ soma: [0, 0, 0], rgb: [0, 0, 0], n: 0, centro: 0, borda: 0 }));
    for (const p of pontos) {
      let melhor = 0;
      for (let c = 1; c < k; c++) if (distancia2(p.lab, centros[c]) < distancia2(p.lab, centros[melhor])) melhor = c;
      const g = grupos[melhor];
      for (let d = 0; d < 3; d++) { g.soma[d] += p.lab[d]; g.rgb[d] += p.rgb[d]; }
      g.n++;
      if (p.centro) g.centro++;
      if (p.borda) g.borda++;
    }
    centros = grupos.map((g, c) => (g.n ? g.soma.map((v) => v / g.n) : centros[c]));
  }
  return grupos.filter((g) => g.n).map((g) => ({
    n: g.n,
    centro: g.centro,
    borda: g.borda,
    lab: g.soma.map((v) => v / g.n),
    rgb: g.rgb.map((v) => Math.round(v / g.n)),
  }));
}

// Luz e sombra da mesma peça têm o mesmo tom e mudam só a claridade, então viram uma família só.
function juntarLuzESombra(grupos) {
  const familias = [];
  for (const g of [...grupos].sort((p, q) => q.lab[0] - p.lab[0])) {
    const familia = familias.find((f) => f.membros[0].lab[0] - g.lab[0] < 45
      && Math.hypot(f.membros[0].lab[1] - g.lab[1], f.membros[0].lab[2] - g.lab[2]) < 6);
    if (familia) familia.membros.push(g);
    else familias.push({ membros: [g] });
  }
  return familias.map(({ membros }) => {
    const n = membros.reduce((s, m) => s + m.n, 0);
    // A parte iluminada, se não for um reflexo pequeno, mostra melhor a cor real da peça.
    const principal = membros.find((m) => m.n >= n * 0.2) || membros[0];
    return {
      n,
      lab: principal.lab,
      rgb: principal.rgb,
      centro: membros.reduce((s, m) => s + m.centro, 0),
      borda: membros.reduce((s, m) => s + m.borda, 0),
    };
  });
}

// A peça costuma ocupar o centro da foto. O fundo também aparece ali às vezes, mas domina as bordas.
function corDominante(imagem) {
  const escala = 96 / Math.max(imagem.naturalWidth, imagem.naturalHeight);
  const l = Math.max(8, Math.round(imagem.naturalWidth * escala));
  const a = Math.max(8, Math.round(imagem.naturalHeight * escala));
  const pixels = reduzir(imagem, l, a).getContext('2d').getImageData(0, 0, l, a).data;
  const pontos = [];
  const margem = Math.max(1, Math.round(Math.min(l, a) * 0.08));
  for (let y = 0; y < a; y++) {
    for (let x = 0; x < l; x++) {
      const i = (y * l + x) * 4;
      pontos.push({
        rgb: [pixels[i], pixels[i + 1], pixels[i + 2]],
        lab: rgbParaLab(pixels[i], pixels[i + 1], pixels[i + 2]),
        centro: Math.abs(x - l / 2) < l / 4 && Math.abs(y - a / 2) < a / 4,
        borda: x < margem || y < margem || x >= l - margem || y >= a - margem,
      });
    }
  }
  const totalCentro = pontos.filter((p) => p.centro).length;
  const totalBorda = pontos.filter((p) => p.borda).length;
  const familias = juntarLuzESombra(agruparCores(pontos, 5))
    .map((f) => {
      const fracCentro = f.centro / totalCentro;
      const fracBorda = f.borda / totalBorda;
      return { ...f, fracCentro, fracBorda, nota: fracCentro * (1 - 0.8 * fracBorda) };
    })
    .sort((p, q) => q.nota - p.nota);

  const opcoes = [];
  const incluir = (cor) => { if (!opcoes.some((o) => o.nome === cor.nome)) opcoes.push({ nome: cor.nome, css: cor.css }); };
  const [primeiras, segunda] = [coresMaisProximas(familias[0].lab), familias[1] && coresMaisProximas(familias[1].lab)];
  incluir(primeiras[0]);
  incluir(primeiras[1]);
  if (segunda) incluir(segunda[0]);
  incluir(primeiras[2]);
  return {
    nome: opcoes[0].nome,
    css: `rgb(${familias[0].rgb.join(',')})`,
    opcoes: opcoes.slice(0, 3),
    // Só números, sem a imagem. Permite entender um erro de cor sem ver a foto.
    detalhes: familias.slice(0, 4).map((f) => ({
      rgb: f.rgb,
      area: Math.round((f.n / pontos.length) * 100),
      centro: Math.round(f.fracCentro * 100),
      borda: Math.round(f.fracBorda * 100),
    })),
  };
}

// ---------- Modelos ----------

function decodificarVetor(base64) {
  const binario = atob(base64);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return new Float32Array(bytes.buffer);
}

function ordenarSoftmax(grupo, imagemVetor) {
  const logits = grupo.map((r) => 100 * produto(imagemVetor, r.vetor));
  const maior = Math.max(...logits);
  const e = logits.map((v) => Math.exp(v - maior));
  const total = e.reduce((a, b) => a + b, 0);
  return grupo.map((r, i) => ({ id: r.id, p: e[i] / total })).sort((p, q) => q.p - p.p);
}

function descartar(tensores) {
  for (const t of tensores) { try { t.dispose(); } catch { /* Nada a liberar. */ } }
}

const MODELOS = {
  pasma: {
    nome: 'Pasma',
    arquivo: `${PASMA}pasma_small_320_fp32.onnx`,
    bytes: 21358203,
    preparar: tensorPasma,
    interpretar(saidas) {
      const { rotulos, limiares } = estado.meta.pasma;
      const tipos = rotulos.garment_types
        .map((id, i) => ({ id, p: Number(saidas.prob_type.data[i]) }))
        .sort((a, b) => b.p - a.p);
      const materiais = rotulos.materials
        .map((id, i) => ({ id, p: Number(saidas.prob_material.data[i]) }))
        .filter(({ id, p }) => limiares[id].fitted && p >= limiares[id].threshold)
        .sort((a, b) => b.p - a.p)
        .slice(0, 3);
      return { top3: tipos.slice(0, 3), materiais };
    },
    conferir(resultado) {
      const primeiro = resultado.top3[0];
      return {
        ok: primeiro.id === 'SHIRT' && Math.abs(primeiro.p - 0.9594) < 0.01,
        detalhe: `${primeiro.id} ${primeiro.p.toFixed(4)} (referência: SHIRT 0.9594)`,
      };
    },
  },
  marqo: {
    nome: 'Marqo',
    arquivo: `${MARQO}vision_model_q4f16.onnx`,
    bytes: 60124766,
    preparar: tensorMarqo,
    interpretar(saidas) {
      const bruto = saidas.image_embeds.data;
      const norma = Math.hypot(...bruto);
      const vetor = Float32Array.from(bruto, (v) => v / norma);
      const { grupos } = estado.meta.marqo;
      return {
        vetor,
        top3: ordenarSoftmax(grupos.tipos, vetor).slice(0, 3),
        estampa: ordenarSoftmax(grupos.estampas, vetor)[0],
        estilo: ordenarSoftmax(grupos.estilos, vetor).slice(0, 2),
      };
    },
    conferir(resultado) {
      const similaridade = produto(resultado.vetor, estado.meta.marqo.referencia);
      return {
        // A versão de 60 MB dá 0,9865 contra a versão completa no navegador, com pixels idênticos aos do Pillow.
        ok: similaridade >= 0.98 && resultado.top3[0].id === 'SHIRT',
        detalhe: `similaridade ${similaridade.toFixed(4)}, 1ª opção ${resultado.top3[0].id}`,
      };
    },
  },
};

async function carregarMetadados() {
  if (estado.meta) return;
  const [rotulos, limiares, marqo] = await Promise.all([
    baixarJSON(`${PASMA}labels_order.json`),
    baixarJSON(`${PASMA}material_thresholds.json`),
    fetch('rotulos-marqo.json').then((r) => {
      if (!r.ok) throw new Error('Não encontrei os rótulos do Marqo.');
      return r.json();
    }),
  ]);
  const grupos = {};
  for (const [nome, itens] of Object.entries(marqo.grupos)) {
    grupos[nome] = itens.map((item) => ({ ...item, vetor: decodificarVetor(item.vetor) }));
  }
  estado.meta = {
    pasma: { rotulos, limiares: limiares.thresholds.r4_edgenext_320 },
    marqo: { grupos, referencia: decodificarVetor(marqo.referencia.vetor) },
    nomesTipo: Object.fromEntries(marqo.grupos.tipos.map((t) => [t.id, t.pt])),
    tiposLista: marqo.grupos.tipos.map(({ id, pt }) => ({ id, pt })),
    nomesEstampa: Object.fromEntries(marqo.grupos.estampas.map((t) => [t.id, t.pt])),
    nomesEstilo: Object.fromEntries(marqo.grupos.estilos.map((t) => [t.id, t.pt])),
  };
}

async function detectarGpu() {
  if (estado.gpu) return estado.gpu;
  estado.gpu = { disponivel: false, recursoF16: false };
  try {
    const adaptador = navigator.gpu && await navigator.gpu.requestAdapter();
    if (adaptador) {
      estado.gpu = {
        disponivel: true,
        recursoF16: adaptador.features.has('shader-f16'),
        fabricante: adaptador.info ? adaptador.info.vendor : undefined,
        arquitetura: adaptador.info ? adaptador.info.architecture : undefined,
      };
    }
  } catch { /* Sem placa gráfica, o teste usa o processador. */ }
  return estado.gpu;
}

async function rodarUma(chave, sessao, blob) {
  const modelo = MODELOS[chave];
  const imagem = await abrirImagem(blob);
  const t0 = performance.now();
  const entrada = modelo.preparar(imagem);
  const t1 = performance.now();
  const saidas = await sessao.run({ [sessao.inputNames[0]]: entrada });
  const t2 = performance.now();
  const resultado = modelo.interpretar(saidas);
  descartar([entrada, ...Object.values(saidas)]);
  return { ...resultado, msPreparo: t1 - t0, msModelo: t2 - t1 };
}

function marcarEtapa(etapa) {
  gravarArmazenado(CHAVE_ETAPA, etapa ? { ...etapa, quando: new Date().toISOString() } : null);
}

function informarProgresso(texto, fracao) {
  $('progresso').hidden = false;
  $('progresso-texto').textContent = texto;
  const barra = $('progresso-barra');
  if (fracao == null) barra.removeAttribute('value');
  else barra.value = fracao;
}

async function prepararSessao(chave) {
  const modelo = MODELOS[chave];
  const registro = { backend: null, tentativas: [], verificacao: null };
  marcarEtapa({ modelo: chave, fase: 'baixando' });
  informarProgresso(`${modelo.nome}: baixando…`, 0);
  const t0 = performance.now();
  const { dados, doCache } = await baixar(modelo.arquivo, modelo.bytes, (f) => {
    informarProgresso(`${modelo.nome}: baixando ${mb(f * modelo.bytes)} de ${mb(modelo.bytes)}`, f);
  });
  registro.msDownload = performance.now() - t0;
  registro.doCache = doCache;
  registro.bytes = modelo.bytes;

  const referencia = await baixar(FOTO_REFERENCIA);
  const blobReferencia = new Blob([referencia.dados], { type: 'image/jpeg' });
  const gpu = await detectarGpu();
  const ordem = $('motor').value === 'auto' && gpu.disponivel ? ['webgpu', 'wasm'] : ['wasm'];

  for (const backend of ordem) {
    let sessao = null;
    try {
      marcarEtapa({ modelo: chave, fase: 'carregando', backend });
      informarProgresso(`${modelo.nome}: preparando o modelo…`);
      await pausa();
      const t1 = performance.now();
      sessao = await ort.InferenceSession.create(dados, { executionProviders: [backend] });
      registro.msCarregar = performance.now() - t1;

      marcarEtapa({ modelo: chave, fase: 'verificando', backend });
      informarProgresso(`${modelo.nome}: conferindo com o resultado de referência…`);
      await pausa();
      const teste = await rodarUma(chave, sessao, blobReferencia);
      const conferencia = modelo.conferir(teste);
      registro.msPrimeira = teste.msModelo;
      if (!conferencia.ok && backend !== 'wasm') {
        registro.tentativas.push({ backend, erro: `Resultado divergente: ${conferencia.detalhe}` });
        await sessao.release();
        continue;
      }
      registro.backend = backend;
      registro.verificacao = conferencia;
      return { sessao, registro };
    } catch (erro) {
      registro.tentativas.push({ backend, erro: String(erro.message || erro).slice(0, 300) });
      if (sessao) await sessao.release().catch(() => {});
    }
  }
  const motivo = registro.tentativas.map((t) => `${t.backend}: ${t.erro}`).join(' | ');
  const falha = new Error(motivo || 'O modelo não carregou.');
  falha.registro = registro;
  throw falha;
}

async function executar() {
  if (estado.rodando) return;
  const chaves = ['pasma', 'marqo'].filter((c) => $(`usar-${c}`).checked);
  mostrarErro('erro-rodar', '');
  if (!chaves.length) { mostrarErro('erro-rodar', 'Marque pelo menos um modelo.'); return; }
  if (!estado.fotos.length) { mostrarErro('erro-rodar', 'Escolha pelo menos uma foto.'); return; }
  if (typeof ort === 'undefined') {
    mostrarErro('erro-rodar', 'O motor de IA não carregou. Confira a internet e recarregue a página.');
    return;
  }
  estado.rodando = true;
  atualizarControles();
  let travaTela = null;
  try { travaTela = await navigator.wakeLock?.request('screen'); } catch { /* A tela pode apagar. */ }
  try {
    ort.env.wasm.wasmPaths = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSAO}/dist/`;
    informarProgresso('Baixando rótulos…');
    await carregarMetadados();
    for (const chave of chaves) {
      const pendentes = estado.fotos.filter((f) => !f.resultados[chave]);
      if (!pendentes.length) continue;
      let sessao = null;
      try {
        const preparado = await prepararSessao(chave);
        sessao = preparado.sessao;
        estado.modelos[chave] = preparado.registro;
        for (let i = 0; i < pendentes.length; i++) {
          marcarEtapa({ modelo: chave, fase: 'foto', indice: i + 1, total: pendentes.length, backend: preparado.registro.backend });
          informarProgresso(`${MODELOS[chave].nome}: analisando foto ${i + 1} de ${pendentes.length}`, i / pendentes.length);
          await pausa();
          pendentes[i].resultados[chave] = await rodarUma(chave, sessao, pendentes[i].blob);
          desenharCartoes();
        }
      } catch (erro) {
        estado.modelos[chave] = { ...(erro.registro || {}), erro: String(erro.message || erro).slice(0, 500) };
        mostrarErro('erro-rodar', `${MODELOS[chave].nome} falhou: ${estado.modelos[chave].erro}`);
      } finally {
        if (sessao) await sessao.release().catch(() => {});
      }
    }
    marcarEtapa(null);
    informarProgresso('Pronto. Agora responda o que é cada peça.', 1);
  } catch (erro) {
    marcarEtapa(null);
    mostrarErro('erro-rodar', `Não deu para concluir: ${erro.message || erro}`);
    $('progresso').hidden = true;
  } finally {
    estado.rodando = false;
    if (travaTela) travaTela.release().catch(() => {});
    atualizarControles();
    desenharCartoes();
    desenharPlacar();
  }
}

// ---------- Fotos ----------

async function adicionarFoto(blob, extras = {}) {
  if (estado.fotos.length >= MAX_FOTOS) throw new Error(`O limite é de ${MAX_FOTOS} fotos.`);
  const original = await abrirImagem(blob);
  const escala = Math.min(1, LADO_FOTO / Math.max(original.naturalWidth, original.naturalHeight));
  const tela = reduzir(original, Math.round(original.naturalWidth * escala), Math.round(original.naturalHeight * escala));
  const reduzida = await new Promise((resolver) => tela.toBlob(resolver, 'image/jpeg', 0.92));
  const imagem = await abrirImagem(reduzida);
  estado.fotos.push({
    id: estado.proximoId++,
    blob: reduzida,
    url: URL.createObjectURL(reduzida),
    exemplo: false,
    correto: '',
    cor: corDominante(imagem),
    resultados: {},
    avaliacoes: {},
    ...extras,
  });
}

async function aoEscolherArquivos(evento) {
  const arquivos = [...evento.target.files];
  evento.target.value = '';
  mostrarErro('erro-fotos', '');
  let falhas = 0;
  for (const arquivo of arquivos) {
    try { await adicionarFoto(arquivo); } catch { falhas++; }
    desenharMiniaturas();
    atualizarControles();
  }
  if (falhas) mostrarErro('erro-fotos', `${falhas} foto(s) não abriram ou passaram do limite. Tente JPG ou PNG.`);
  desenharCartoes();
}

async function usarExemplos() {
  mostrarErro('erro-fotos', '');
  $('exemplos').disabled = true;
  try {
    for (const [arquivo, correto] of [['shirt', 'SHIRT'], ['jeans', 'JEANS'], ['sneakers', 'SNEAKERS'], ['blouse', 'BLOUSE']]) {
      const { dados } = await baixar(`${AMOSTRAS}${arquivo}.jpg`);
      await adicionarFoto(new Blob([dados], { type: 'image/jpeg' }), { exemplo: true, correto });
      desenharMiniaturas();
    }
  } catch (erro) {
    mostrarErro('erro-fotos', `Não consegui baixar os exemplos: ${erro.message}`);
  } finally {
    $('exemplos').disabled = false;
    atualizarControles();
  }
}

function removerFoto(id) {
  const indice = estado.fotos.findIndex((f) => f.id === id);
  if (indice < 0) return;
  URL.revokeObjectURL(estado.fotos[indice].url);
  estado.fotos.splice(indice, 1);
  desenharMiniaturas();
  desenharCartoes();
  desenharPlacar();
  atualizarControles();
}

// ---------- Tela ----------

function atualizarControles() {
  $('rodar').disabled = estado.rodando || !estado.fotos.length;
  $('rodar').textContent = estado.rodando ? 'Analisando…' : 'Comparar as IAs';
  for (const id of ['usar-pasma', 'usar-marqo', 'motor']) $(id).disabled = estado.rodando;
}

function desenharMiniaturas() {
  $('miniaturas').replaceChildren(...estado.fotos.map((foto, i) => el('div', { class: 'miniatura' },
    el('img', { src: foto.url, alt: `Foto ${i + 1}` }),
    el('button', {
      type: 'button',
      'aria-label': `Remover foto ${i + 1}`,
      onclick: () => { if (!estado.rodando) removerFoto(foto.id); },
    }, '×'))));
}

function nomeTipo(id) {
  return estado.meta?.nomesTipo[id] || id;
}

function blocoModelo(chave, foto) {
  const resultado = foto.resultados[chave];
  if (!resultado) {
    const erro = estado.modelos[chave]?.erro;
    return el('div', { class: 'modelo' }, el('h3', {}, MODELOS[chave].nome),
      el('p', { class: 'tempo' }, erro ? 'Não rodou neste aparelho.' : 'Ainda não analisada.'));
  }
  const posicao = resultado.top3.findIndex((t) => t.id === foto.correto);
  let veredito = null;
  if (foto.correto === 'OUTRO') veredito = el('p', { class: 'veredito' }, 'Peça fora da lista');
  else if (posicao === 0) veredito = el('p', { class: 'veredito certo' }, 'Acertou de primeira');
  else if (posicao > 0) veredito = el('p', { class: 'veredito certo' }, `Acertou na ${posicao + 1}ª opção`);
  else veredito = el('p', { class: 'veredito errado' }, 'Errou');
  return el('div', { class: 'modelo' },
    el('h3', {}, MODELOS[chave].nome),
    veredito,
    // Só o Pasma tem probabilidades calibradas. No Marqo, a porcentagem daria quase sempre 100%.
    el('ol', {}, resultado.top3.map((t, i) => el('li', { class: t.id === foto.correto ? 'correta' : '' },
      el('span', {}, nomeTipo(t.id)), el('span', {}, chave === 'pasma' ? pct(t.p) : `${i + 1}ª`)))),
    el('p', { class: 'tempo' }, `${Math.round(resultado.msModelo)} ms neste aparelho`));
}

function linhaExtra(foto, chave, conteudo, explicacao) {
  const atual = foto.avaliacoes[chave];
  const botao = (valor, rotulo) => el('button', {
    type: 'button',
    'data-valor': valor,
    'aria-pressed': String(atual === valor),
    onclick: () => {
      foto.avaliacoes[chave] = atual === valor ? undefined : valor;
      desenharCartoes();
      desenharPlacar();
    },
  }, rotulo);
  return el('div', { class: 'extra' },
    el('div', { class: 'extra-texto' }, el('strong', {}, AVALIACOES[chave]), el('br'), conteudo,
      explicacao ? el('small', {}, explicacao) : null),
    el('div', { class: 'avaliar', role: 'group', 'aria-label': AVALIACOES[chave] }, botao('certo', 'Certo'), botao('errado', 'Errado')));
}

function linhaCor(foto) {
  const escolher = (nome) => {
    const repetiu = foto.corEscolhida === nome;
    foto.corEscolhida = repetiu ? undefined : nome;
    if (repetiu) foto.avaliacoes.cor = undefined;
    else if (nome === 'NENHUMA') foto.avaliacoes.cor = 'errado';
    else foto.avaliacoes.cor = nome === foto.cor.nome ? 'certo' : 'alternativa';
    desenharCartoes();
    desenharPlacar();
  };
  return el('div', { class: 'extra' },
    el('div', { class: 'extra-texto' }, el('strong', {}, AVALIACOES.cor), el('small', {}, 'Toque na cor real da peça')),
    el('div', { class: 'avaliar', role: 'group', 'aria-label': 'Cor real da peça' },
      foto.cor.opcoes.map((o) => el('button', {
        type: 'button',
        'data-valor': 'certo',
        'aria-pressed': String(foto.corEscolhida === o.nome),
        onclick: () => escolher(o.nome),
      }, el('span', { class: 'amostra-cor', style: `background:${o.css}` }), o.nome)),
      el('button', {
        type: 'button',
        'data-valor': 'errado',
        'aria-pressed': String(foto.corEscolhida === 'NENHUMA'),
        onclick: () => escolher('NENHUMA'),
      }, 'Nenhuma')));
}

function desenharCartao(foto, indice) {
  const tipos = estado.meta.tiposLista;
  const seletor = el('select', {
    'aria-label': `Tipo correto da foto ${indice + 1}`,
    onchange: (e) => { foto.correto = e.target.value; desenharCartoes(); desenharPlacar(); },
  },
  el('option', { value: '' }, 'Escolha…'),
  tipos.map((t) => el('option', { value: t.id }, ROTULOS_MENU[t.id] || t.pt)),
  el('option', { value: 'OUTRO' }, 'Outro: não está na lista'));
  seletor.value = foto.correto;

  const extras = [linhaCor(foto)];
  const pasma = foto.resultados.pasma;
  if (pasma) {
    extras.push(linhaExtra(foto, 'material',
      pasma.materiais.length ? pasma.materiais.map((m) => MATERIAIS[m.id] || m.id).join(', ') : 'Nenhuma sugestão',
      'Aparência do tecido, não a composição real'));
  }
  const marqo = foto.resultados.marqo;
  if (marqo) {
    extras.push(linhaExtra(foto, 'estampa', estado.meta.nomesEstampa[marqo.estampa.id]));
    extras.push(linhaExtra(foto, 'estilo', marqo.estilo.map((e) => estado.meta.nomesEstilo[e.id]).join(' ou ')));
  }

  return el('article', { class: 'cartao', 'data-respondido': String(Boolean(foto.correto)) },
    el('div', { class: 'cartao-topo' },
      el('img', { src: foto.url, alt: `Foto ${indice + 1}` }),
      el('label', { class: 'campo' }, `O que é esta peça?${foto.exemplo ? ' (exemplo)' : ''}`, seletor)),
    el('div', { class: 'detalhes' },
      el('div', { class: 'comparacao' }, blocoModelo('pasma', foto), blocoModelo('marqo', foto)),
      el('div', { class: 'extras' }, extras)));
}

function desenharCartoes() {
  const analisadas = estado.fotos.filter((f) => Object.keys(f.resultados).length);
  $('secao-conferir').hidden = !analisadas.length || !estado.meta;
  if ($('secao-conferir').hidden) { $('cartoes').replaceChildren(); return; }
  $('cartoes').replaceChildren(...analisadas.map((f) => desenharCartao(f, estado.fotos.indexOf(f))));
}

function mediana(valores) {
  if (!valores.length) return null;
  const v = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(v.length / 2);
  return v.length % 2 ? v[meio] : (v[meio - 1] + v[meio]) / 2;
}

function calcularPlacar() {
  const reais = estado.fotos.filter((f) => !f.exemplo);
  const base = reais.length ? reais : estado.fotos;
  const respondidas = base.filter((f) => f.correto && f.correto !== 'OUTRO');
  const categorias = estado.meta?.pasma.rotulos.type_to_coarse || {};
  const placar = {
    soExemplos: !reais.length && base.length > 0,
    totalFotos: base.length,
    foraDaLista: base.filter((f) => f.correto === 'OUTRO').length,
    modelos: {},
    extras: {},
  };
  for (const chave of Object.keys(MODELOS)) {
    const comResultado = respondidas.filter((f) => f.resultados[chave]);
    const tempos = base.filter((f) => f.resultados[chave]).map((f) => f.resultados[chave].msModelo);
    placar.modelos[chave] = {
      avaliadas: comResultado.length,
      acertosPrimeira: comResultado.filter((f) => f.resultados[chave].top3[0].id === f.correto).length,
      acertosTop3: comResultado.filter((f) => f.resultados[chave].top3.some((t) => t.id === f.correto)).length,
      categoriaCerta: comResultado.filter((f) => categorias[f.resultados[chave].top3[0].id] === categorias[f.correto]).length,
      msMediana: mediana(tempos),
    };
  }
  for (const chave of Object.keys(AVALIACOES)) {
    const notas = base.map((f) => f.avaliacoes[chave]).filter(Boolean);
    placar.extras[chave] = {
      certos: notas.filter((n) => n === 'certo').length,
      entreOpcoes: notas.filter((n) => n !== 'errado').length,
      respondidos: notas.length,
    };
  }
  return placar;
}

function montarResultado() {
  return {
    versao: 2,
    data: new Date().toISOString(),
    aparelho: {
      navegador: navigator.userAgent,
      plataforma: navigator.userAgentData?.platform,
      nucleos: navigator.hardwareConcurrency,
      memoriaGB: navigator.deviceMemory,
      tela: `${screen.width}x${screen.height}`,
      gpu: estado.gpu,
      isolado: self.crossOriginIsolated,
    },
    motorEscolhido: $('motor').value,
    ortVersao: ORT_VERSAO,
    modelos: estado.modelos,
    placar: calcularPlacar(),
    quedas: estado.quedas,
    fotos: estado.fotos.map((f, i) => ({
      n: i + 1,
      exemplo: f.exemplo,
      correto: f.correto,
      cor: f.cor.nome,
      corOpcoes: f.cor.opcoes.map((o) => o.nome),
      corEscolhida: f.corEscolhida,
      corDetalhes: f.cor.detalhes,
      avaliacoes: f.avaliacoes,
      pasma: f.resultados.pasma && {
        top3: f.resultados.pasma.top3.map((t) => [t.id, +t.p.toFixed(4)]),
        materiais: f.resultados.pasma.materiais.map((m) => m.id),
        ms: Math.round(f.resultados.pasma.msModelo),
      },
      marqo: f.resultados.marqo && {
        top3: f.resultados.marqo.top3.map((t) => [t.id, +t.p.toFixed(4)]),
        estampa: f.resultados.marqo.estampa.id,
        estilo: f.resultados.marqo.estilo.map((e) => e.id),
        ms: Math.round(f.resultados.marqo.msModelo),
      },
    })),
  };
}

function linha(rotulo, ...valores) {
  return el('tr', {}, el('th', { scope: 'row' }, rotulo), valores.map((v) => el('td', {}, v)));
}

function textoAcerto(certos, total) {
  return total ? `${certos} de ${total}` : '—';
}

function textoTempo(ms) {
  if (ms == null) return '—';
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1).replace('.', ',')} s`;
}

function textoMotor(registro) {
  if (!registro) return '—';
  if (registro.erro) return 'Não rodou';
  return registro.backend === 'webgpu' ? 'Placa gráfica' : 'Processador';
}

function textoVerificacao(registro) {
  if (!registro || !registro.verificacao) return '—';
  return registro.verificacao.ok ? 'Passou' : 'Divergiu';
}

function desenharPlacar() {
  const temResultado = estado.fotos.some((f) => Object.keys(f.resultados).length);
  $('secao-resultado').hidden = !temResultado;
  if (!temResultado) return;
  const p = calcularPlacar();
  const [a, b] = [p.modelos.pasma, p.modelos.marqo];
  const [ra, rb] = [estado.modelos.pasma, estado.modelos.marqo];
  const partes = [`${p.totalFotos} foto(s)`];
  if (p.soExemplos) partes.push('só fotos de exemplo');
  else if (estado.fotos.some((f) => f.exemplo)) partes.push('fotos de exemplo não contam');
  if (p.foraDaLista) partes.push(`${p.foraDaLista} peça(s) fora da lista não contam nos acertos`);
  $('resumo-base').textContent = `Base: ${partes.join(', ')}.`;

  const extras = Object.entries(AVALIACOES).filter(([chave]) => p.extras[chave].respondidos);
  $('placar').replaceChildren(
    el('thead', {}, el('tr', {}, el('th', { scope: 'col' }, ''), el('th', { scope: 'col' }, 'Pasma'), el('th', { scope: 'col' }, 'Marqo'))),
    el('tbody', {},
      linha('Acertou o tipo de primeira', textoAcerto(a.acertosPrimeira, a.avaliadas), textoAcerto(b.acertosPrimeira, b.avaliadas)),
      linha('Tipo certo entre as 3 opções', textoAcerto(a.acertosTop3, a.avaliadas), textoAcerto(b.acertosTop3, b.avaliadas)),
      linha('Categoria certa', textoAcerto(a.categoriaCerta, a.avaliadas), textoAcerto(b.categoriaCerta, b.avaliadas)),
      linha('Tempo por foto', textoTempo(a.msMediana), textoTempo(b.msMediana)),
      linha('Motor usado', textoMotor(ra), textoMotor(rb)),
      linha('Conferência de referência', textoVerificacao(ra), textoVerificacao(rb)),
      linha('Download do modelo', mb(MODELOS.pasma.bytes), mb(MODELOS.marqo.bytes)),
      extras.length ? el('tr', { class: 'subtitulo' }, el('th', { colspan: '3', scope: 'colgroup' }, 'Outras características')) : null,
      extras.map(([chave, nome]) => [
        el('tr', {},
          el('th', { scope: 'row' }, chave === 'cor' ? 'Cor certa de primeira' : nome),
          el('td', { colspan: '2' }, textoAcerto(p.extras[chave].certos, p.extras[chave].respondidos))),
        chave === 'cor' ? el('tr', {},
          el('th', { scope: 'row' }, 'Cor certa entre as opções'),
          el('td', { colspan: '2' }, textoAcerto(p.extras.cor.entreOpcoes, p.extras.cor.respondidos))) : null,
      ])));
}

async function copiarResultado() {
  const texto = JSON.stringify(montarResultado());
  const caixa = $('resultado-json');
  try {
    await navigator.clipboard.writeText(texto);
    caixa.hidden = true;
    $('copiar-status').textContent = 'Resultado copiado.';
  } catch {
    caixa.value = texto;
    caixa.hidden = false;
    caixa.focus();
    caixa.select();
    $('copiar-status').textContent = 'Não consegui copiar sozinho. Selecione o texto abaixo e copie.';
  }
}

const NOMES_FASE = {
  baixando: 'baixando o modelo',
  carregando: 'carregando o modelo',
  verificando: 'fazendo a primeira análise',
  foto: 'analisando as fotos',
};

// Se a página recarregar no meio da análise, o navegador provavelmente ficou sem memória.
function verificarQueda() {
  const etapa = lerArmazenado(CHAVE_ETAPA);
  if (etapa) {
    estado.quedas.push(etapa);
    gravarArmazenado(CHAVE_QUEDAS, estado.quedas);
    gravarArmazenado(CHAVE_ETAPA, null);
    const nome = MODELOS[etapa.modelo]?.nome || etapa.modelo;
    const aviso = $('aviso-queda');
    aviso.replaceChildren(
      el('p', {}, el('strong', {}, `A página recarregou enquanto o ${nome} estava ${NOMES_FASE[etapa.fase] || 'rodando'}. `),
        'Isso costuma indicar falta de memória no aparelho, e fica registrado no resultado.'),
      el('p', {}, `Escolha as fotos de novo e tente desmarcar o ${nome}, ou escolha “Só o processador”.`));
    aviso.hidden = false;
  }
}

async function iniciar() {
  verificarQueda();
  $('camera').addEventListener('change', aoEscolherArquivos);
  $('galeria').addEventListener('change', aoEscolherArquivos);
  $('exemplos').addEventListener('click', usarExemplos);
  $('rodar').addEventListener('click', executar);
  $('copiar').addEventListener('click', copiarResultado);
  window.addEventListener('beforeunload', (evento) => {
    if (estado.rodando || estado.fotos.some((f) => f.correto)) evento.preventDefault();
  });
  const gpu = await detectarGpu();
  $('aparelho').textContent = `Este aparelho: ${navigator.hardwareConcurrency || '?'} núcleos, placa gráfica ${gpu.disponivel ? 'disponível para IA' : 'indisponível para IA'}.`;
}

// Permite conferir os números pelo console do navegador.
window.armarioTeste = { estado, calcularPlacar, montarResultado, adicionarFoto, MODELOS };

iniciar();
