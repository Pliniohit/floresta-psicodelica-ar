# 🍄 Floresta Psicodélica AR

Floresta low poly com texturas animadas em **realidade aumentada com passthrough**
para **Meta Quest 3**, feita em WebXR + Three.js. Abre direto no navegador do
headset — não precisa instalar nada, nem sideload, nem Unity.

A floresta **cresce dentro do seu cômodo mapeado** e os troncos são espaçados
para você **caminhar entre eles**. As copas ficam acima de 2,1 m e se cruzam por
cima da sua cabeça: é essa combinação — chão livre, dossel fechado — que faz
parecer floresta de verdade em vez de um cenário que você observa de fora.

**Nenhuma imagem é carregada.** Todas as "texturas" são geradas por shader a cada
frame: ruído de valor 3D combinado com paletas de cosseno. É por isso que o app
inteiro cabe em poucos kilobytes de código e nunca fica pixelado, por mais perto
que você chegue de um cogumelo.

---

## Como abrir no Quest 3

1. **Antes de tudo**, rode o **Space Setup** do Quest (Configurações → Espaço
   físico) para o headset conhecer as paredes e os móveis do cômodo. É opcional,
   mas é o que faz a floresta encaixar exatamente no seu espaço.
2. No headset, abra o **Meta Quest Browser** e vá até a URL do projeto.
3. Toque em **Entrar em AR** e permita o acesso quando o sistema pedir.
4. **Olhe ao redor.** O app desenha o contorno do que já leu; quando reconhecer
   o piso, o painel mostra a área em m².
5. **Aperte o gatilho** e a floresta brota dentro daquele espaço.
6. **Caminhe entre as árvores.**

Se o Space Setup nunca foi feito, o app usa o limite do guardian; e se nem isso
existir, cai para uma área de 4 × 4 m à sua frente.

Precisa estar em `https://`. WebXR não inicia sessão imersiva em conexão insegura.

## Mãos livres (Quest 3)

Se o headset estiver com **hand tracking** ligado, largue os controles.

| Gesto | O que faz |
| --- | --- |
| **Pinça perto de uma planta** | Arranca ela do chão; ela encolhe e segue sua mão |
| **Soltar a pinça** | Replanta ali. Se não couber, ela volta sozinha para onde estava |
| **Pinça no vazio, perto do chão** | Brota uma árvore nova naquele ponto |
| **Palma esquerda para cima** | Abre três orbes flutuando sobre o pulso |
| **Cutucar um orbe com o indicador** | 🔶 paleta · 🔷 viagem · 🔺 semear de novo |

Árvore, cogumelo e cristal são todos pegáveis. A árvore se agarra **pelo
tronco**, na altura que você quiser; cogumelo e cristal, pelo corpo. Quando sua
mão chega perto, o objeto ganha um contorno pulsante — é o que confirma o que
você vai pegar antes de fechar os dedos.

Soltar uma árvore colada em outra é recusado: ela volta ao lugar de origem em
vez de fechar a sua passagem.

## Controles

| Entrada | Ação |
| --- | --- |
| **Gatilho** | Confirma o espaço mapeado; depois, planta onde você aponta |
| **Grip** | Troca a paleta psicodélica |
| **A / X** | Alterna entre modo calmo e viagem completa |
| **B / Y** | Semeia uma floresta inteiramente nova |
| **Analógico ↕** | Escala a floresta (0,35× a 2,4×) |
| **Analógico ↔** | Gira a floresta |
| **Pinça** | Mesmo que o gatilho, com hand tracking |

Sem headset, o botão **Ver prévia no navegador** abre a mesma cena com órbita de
mouse. Ali valem as teclas `P` (paleta), `T` (viagem), `R` (semear) e `M` (mudo).

## No celular

| Aparelho | O que acontece |
| --- | --- |
| **Android com ARCore** | AR com rastreamento real. Aponte a câmera para o chão até o anel aparecer e toque para plantar. |
| **iPhone / iPad** | **Modo câmera**: feed da câmera traseira ao fundo e giroscópio girando a cena. Toque em *Abrir com a câmera*. |
| **Qualquer navegador** | Modo 3D: arraste para orbitar, pince para aproximar, toque para plantar. |

Sem controle físico não existe gatilho nem analógico, então paleta, viagem,
semear e escala aparecem numa **barra na tela**.

### Por que o iPhone não faz AR de verdade

Não é limitação do projeto. **Nenhum navegador do iOS implementa WebXR** —
Chrome, Firefox e Edge no iPhone são todos o WebKit por baixo, com outra
interface. Logo `navigator.xr` não existe, `immersive-ar` não existe, e nada
que a página faça vai pedir a câmera por esse caminho.

O que dá para fazer é o **modo câmera**: `getUserMedia` para o feed da traseira
e `DeviceOrientationEvent` para a orientação. Ele pede permissão de câmera, sim,
e permite olhar em volta girando o aparelho.

A diferença honesta: **não há rastreamento de posição.** Girar funciona; andar
com o telefone não move você dentro da cena. Por isso, nesse modo, a floresta
nasce **em volta de você** e não à frente — girar em torno de si é exatamente o
grau de liberdade que o aparelho oferece, e a cena é montada para aproveitar
esse, não para fingir os outros.

Rastreamento completo no iOS existiria só via SDK comercial de SLAM em
WebAssembly (8th Wall e afins), com licença paga — fora do escopo daqui.

## Como está montado

```
index.html              tela inicial, HUD de dom-overlay, vídeo de fundo
src/
  main.js               renderizador, estado, fases, laço de render, prévia
  xr.js                 ciclo de vida da sessão immersive-ar
  room.js               plane-detection, hit-test, polígono do cômodo, móveis
  interaction.js        controles, toque na tela, mira no chão, háptico
  hands.js              juntas rastreadas, pinça, normal da palma
  menu.js               três orbes no pulso, acionados com o indicador
  magicwindow.js        câmera + giroscópio para aparelhos sem WebXR
  forest.js             semeadura no polígono, instancing, animação de brotar
  geometry.js           construtores das malhas low poly
  audio.js              drone ambiente gerado por WebAudio
  palettes.js           seis paletas de cosseno
  shaders/
    lib.js              ruído, paleta, vento, roll-off e cabeçalhos comuns
    materials.js        os dez materiais animados
vendor/three/           Three.js r180 embutido (sem CDN)
test-geometry.mjs       geometrias válidas, sem NaN
test-layout.mjs         a floresta cabe no cômodo E sobra passagem
test-grab.mjs           pegar, carregar e soltar se comportam
```

Rode os três com `npm test`.

### Como a floresta decide onde plantar

O tronco é o que bloqueia a passagem; a copa não, porque fica acima da cabeça.
Então o espaçamento se aplica **só aos troncos**, e as copas ficam livres para
se cruzar por cima:

- **Perto da parede, adensa** (1,15 m entre troncos) — ninguém circula colado no
  rodapé, e a densidade ali é o que dá a sensação de mata fechada ao redor.
- **No meio do cômodo, abre** (2,00 m) — é por onde você anda.
- **Móveis viram buracos.** Planos horizontais entre 12 cm e 1,5 m do chão são
  lidos como mesa/sofá e nada é plantado dentro deles.
- **Plantar manualmente respeita a mesma regra.** Se o ponto fecharia a
  passagem, o app recusa e avisa, em vez de deixar você se murar sem perceber.

`npm test` mede isso: no pior cômodo testado sobra **1,03 m de vão livre** entre
as cascas de dois troncos vizinhos.

### Decisões que importam para o desempenho

A cena fica entre **8 e 16 mil triângulos** (depende do tamanho do cômodo) e
**14 draw calls**, bem abaixo do orçamento do Quest 3. O que sustenta isso:

- **Instancing em tudo que se repete.** As três espécies de árvore, os cogumelos,
  os cristais, o capim e os orbes são `InstancedMesh` com capacidade reservada
  acima do uso inicial — plantar em tempo real só incrementa `count`, sem
  realocar buffer nenhum.
- **Tronco e copa são malhas separadas que nunca se descolam.** Cada uma calcula
  o vento a partir da mesma altura local e da mesma raiz em mundo, então o
  deslocamento bate exatamente na junção.
- **O custo real aqui é fill rate, não geometria.** Os shaders rodam bastante
  matemática por fragmento, então a sessão liga foveação em 0,5 — é onde se
  ganha mais tempo de frame.
- **O chão é translúcido e recortado no formato da sala.** O tapete de micélio
  é triangulado a partir do polígono do piso mapeado e deixa o chão real
  aparecer entre os veios — é o que faz a floresta parecer plantada na sala em
  vez de colada por cima dela.
- **As altas fazem roll-off exponencial.** Somar brilho de borda a uma paleta que
  já chega perto de 1,0 satura os três canais no mesmo ponto e a superfície vira
  branco chapado. O roll-off segura o canal mais alto antes do teto e a cor
  sobrevive.
- **Ruído de duas oitavas** na maioria das superfícies; três só onde a malha
  ocupa pouca tela.

Uma consequência assumida: em teto baixo, as árvores mais altas atravessam o
forro. Preferi manter a escala de floresta a espremer as copas na altura da sua
cabeça — atravessar o teto parece mágico, esbarrar em galho parece defeito.

### Sem importmap, de propósito

O Three.js é referenciado por **caminho relativo**, não por especificador nu
com importmap. Importmap exige Safari 16.4+, e num iPhone mais antigo a página
inteira quebraria com "Failed to resolve module specifier" — sem mensagem
nenhuma para o usuário, só uma tela parada. Caminho relativo funciona em
qualquer navegador com ES modules. Há também um `window.onerror` no `index.html`
que mostra a falha na tela, caso algum módulo não carregue.

### Uma nota sobre a normal da palma

O menu de pulso decide se a palma está virada para cima a partir do produto
vetorial entre punho→metacarpo do indicador e punho→metacarpo do mínimo. O sinal
depende da lateralidade, e é a única coisa aqui que eu não consegui verificar
sem um headset na mão. Se em uso o menu aparecer com a palma virada para baixo,
é só trocar o sinal em `PALM_SIGN`, no topo de `src/hands.js`.

## Licença

Código sob MIT. Three.js r180 embutido em `vendor/three/`, também MIT.
