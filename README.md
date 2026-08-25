# 🦋 Universo Encantado

Sete cenários em nuvens de partículas, em **realidade aumentada com
passthrough** para **Meta Quest 3**, feitos em WebXR + Three.js. Abre direto no
navegador do headset — não precisa instalar nada, nem sideload, nem Unity.

Tudo **cresce dentro do seu cômodo mapeado**, e o que encadeia um cenário no
seguinte é a **borboleta que sai do casulo**: ela sobe deixando rastro, o mundo
se dissolve atrás dela e o próximo se monta em volta. Do outro lado do teto o
céu é inteiramente virtual — é por ele que se vê a copa das árvores, os
planetas gigantes e as estrelas cadentes.

A vegetação é espaçada para você **caminhar entre ela**, e as copas se cruzam
acima de 2,1 m: é essa combinação — chão livre, dossel fechado — que faz
parecer mata de verdade em vez de um cenário que você observa de fora.

**Nenhuma imagem é carregada.** Todas as "texturas" são geradas por shader a cada
frame: ruído de valor 3D combinado com paletas de cosseno. É por isso que o app
inteiro cabe em poucos kilobytes de código e nunca fica pixelado, por mais perto
que você chegue de um cogumelo.

---

## O escaneamento

A experiência **sempre começa escaneando de verdade**. Ao entrar em AR, antes
de qualquer outra coisa, o app descarta o que estiver lido e chama
`session.initiateRoomCapture()` — o escaneamento do próprio Quest, na hora.

A ordem aí não é detalhe. O Quest guarda o Space Setup de sessões anteriores,
e se o app olhasse `detectedPlanes` primeiro encontraria a leitura antiga,
concluiria que já sabe o cômodo e nunca abriria o escaneamento. O reset vem
antes da captura exatamente por isso.

Terminada a varredura, o painel mostra o que foi lido: superfícies, volumes,
contagem de triângulos e os rótulos reconhecidos — `couch`, `table`, `wall`,
`window`. O **grip** reescaneia quando quiser.

Se o runtime recusar (alguns só aceitam uma captura por sessão) ou não tiver a
API, o app avisa e volta a usar o espaço já mapeado — não fica sem chão.

O que sai daí alimenta três coisas:

**Oclusão.** A malha do cômodo (`mesh-detection`) passa a ser renderizada só no
buffer de profundidade, antes de tudo. Uma árvore atrás do seu sofá **fica
atrás do sofá**. É o maior ganho de integração do projeto inteiro: sem isso a
floresta parece adesivo colado sobre a imagem; com isso ela parece estar na
sala.

**Colonização.** Os móveis deixam de ser só obstáculo e viram substrato. Musgo
e cogumelos pequenos brotam no tampo da mesa e no assento do sofá; trepadeiras
sobem pelo rodapé das paredes. O que o app reconhece como `table`, `couch`,
`bed`, `desk` ou `shelf` é tomado por cima, não contornado.

**Caminhabilidade.** O polígono do piso continua definindo onde dá para andar,
como antes.

## Criaturas e corpo

**Borboletas** vagam pela clareira. Cada lado é um leque de triângulos da
dobradiça até um contorno arredondado, e as duas asas do lado se encostam
formando uma silhueta contínua, como a de uma monarca — a versão anterior tinha
duas lascas finas e pontudas por lado e parecia libélula. A proporção
envergadura/comprimento é 1,33; libélula fica perto de 0,8. Os pontos do
contorno ganham um pouco de Z conforme se afastam da dobradiça, então a asa é
abaulada em vez de placa plana.

As asas giram em torno do **eixo do corpo**
— girar em torno de Z, que era o erro original, apenas varria a asa dentro do
próprio plano e nunca parecia batida. O perfil é assimétrico: sobe em 35% do
ciclo, de 14° abaixo da horizontal a 77° acima, e cai devagar nos 65%
restantes. Senóide pura dá vaivém de metrônomo; borboleta bate e deixa cair. De
tempos em tempos elas planam, e a normal acompanha a rotação, senão a asa
levantada continuaria sombreada como se estivesse deitada.

A frequência é de 1,7 a 2,5 Hz, bem abaixo da borboleta real, que passa de 8 —
em VR uma asa rápida na periferia lê como tremulação, e o objetivo aqui é
graça, não fidelidade entomológica. Entre as batidas elas planam por mais
tempo do que batem.

O voo  é a soma de senóides de frequências não múltiplas, então o padrão leva
minutos para se repetir — não fica com cara de órbita.

**Vaga-lumes** circulam você. O alvo é o peito do corpo inferido, seguido com
atraso: o bando se estica quando você anda e se junta quando você para.

**Floresça no próprio corpo.** Brotos nascem nos ombros, braços e tronco, e
acompanham o movimento porque a posição de cada um é recalculada por frame a
partir do segmento a que pertence.

### Sobre "rastrear o corpo"

Não é rastreamento corporal — isso não existe no WebXR. O que existe são três
pontos: cabeça e as duas mãos. Ombros, cotovelos, peito e quadril são
**inferidos** com IK de dois ossos, a mesma técnica de avatares de meio corpo.

Funciona bem o bastante para florescer em cima de você, com dois limites
assumidos: **não há pernas**, e um alvo fora do alcance do braço faz o ombro
avançar até 13 cm (como a cintura escapular real) e, além disso, o antebraço
estica em vez de a mão se soltar.

### Sobre reconhecer outra pessoa

Também não é possível. O Quest não entrega os pixels do passthrough para a
página, por privacidade, e não há API de detecção de pessoas.

O que existe é **apontar e abençoar**: mire em alguém, aperte o gatilho fora da
clareira, e um enxame de vaga-lumes fica ali. Você é o reconhecedor.

## Sementes

**Abra a mão** e uma semente brota nela. Pince para pegá-la e solte perto do
chão para plantar. Vale para as duas mãos.

O gesto é medido por quanto os dedos estão estendidos, e não por para onde a
palma aponta. A versão anterior usava "palma para cima", calculada por um
produto vetorial cujo sinal depende da lateralidade — e que eu não tinha como
conferir sem um headset. Com o sinal invertido, a semente simplesmente nunca
nascia, e o ciclo inteiro do jogo travava aí. Abertura de mão não tem esse
risco.

## O céu

Olhe para cima e o teto se dissolve. Nebulosa com domain warping, faixas de
aurora atravessando o zênite, estrelas e medusas à deriva.

A opacidade cresce com a elevação do olhar: no horizonte é zero — sua sala real
continua inteira à sua frente — e só a partir de uns 30° acima o céu domina. É
o que permite ter céu sem matar a AR.

Detalhe de implementação que decide se funciona: a cúpula é desenhada **antes**
do oclusor e sem teste de profundidade. Se fosse testada, o teto real (que
agora escreve profundidade) apagaria o céu por completo. Pintando antes, o teto
deixa de ser superfície e vira abertura.

Uma **constelação** fica fixa num pedaço do firmamento — você a procura virando
a cabeça, como uma de verdade. A forma é dada em pontos 2D e arestas em
`src/constellation.js`; hoje é um cogumelo, à espera da logo.

Liga e desliga no 🌌 da barra, ou no quarto orbe do menu de pulso.

## Como abrir no Quest 3

1. No headset, abra o **Meta Quest Browser** e vá até a URL do projeto.
2. Toque em **Entrar em AR** e permita o acesso quando o sistema pedir.
3. **O escaneamento abre sozinho.** Varra paredes, chão e móveis como o Quest
   pedir. Ao terminar, o painel mostra o que foi lido.
4. **Aperte o gatilho** e a floresta brota naquele espaço.
5. **Caminhe entre as árvores. Olhe para cima.**

Não é preciso rodar o Space Setup antes: o app escaneia sozinho ao abrir.

Precisa estar em `https://`. WebXR não inicia sessão imersiva em conexão insegura.

## Acessibilidade: cintilação

Brilho que varia é gatilho de crise em epilepsia fotossensível, e isso guiou
várias decisões aqui.

Toda oscilação temporal da cena fica **abaixo de 1 Hz** — longe da faixa
perigosa de 3 a 30 Hz. Mas frequência não é tudo: amplitude também conta, e num
headset a cabeça nunca para, então qualquer variação vira cintilação percebida.

A fonte pior não era nenhuma animação. Eram as **estrelas de borda dura**: um
`step()` decidia se havia estrela por célula de direção, e como a célula muda a
cada movimento de cabeça, elas apareciam e sumiam de golpe. Agora nascem no
centro da célula e somem suavemente na borda. Os vaga-lumes iam de 0,08 a 1,0 —
doze vezes de brilho — e hoje respiram entre 0,78 e 1,0.

### Ritmo

Tudo se move a cerca de **metade** da velocidade original, e as transições
duram de 1,6 a 2,8 vezes mais. Balanço ao vento, voo das borboletas, órbita dos
vaga-lumes, deriva das medusas, giro dos planetas, esporos subindo — todos
caíram para perto de 0,5x.

Duas mudanças importam mais que os números:

**As harmônicas secundárias pesam menos.** O balanço e o voo somavam uma
segunda senóide de frequência mais alta, com peso 0,35. Era ela que punha
tremida por cima do arco largo — e tremida não é gracioso. Caiu para 0,18 no
voo e 0,22 no vento.

**As curvas suavizam nos dois extremos.** O crescimento e o surgimento usavam
uma curva puramente desacelerada, que arranca do zero em velocidade máxima. Um
`smoothstep` começa e termina devagar, e é isso que faz o movimento parecer
intencional em vez de disparado.

### Padrões que corriam demais

O segundo problema não era velocidade, era **densidade**. O chapéu de cogumelo
tinha 24 anéis num raio de 40 cm — 60 por metro. Numa superfície curva, com a
cabeça em movimento, isso serrilha e o padrão parece correr. O casulo chegava a
90 anéis de altura.

As densidades caíram para 2 a 4 faixas por metro e a rolagem para menos de 0,1
faixa por segundo. O mesmo valeu para caule, capim, micélio do chão e franja
das medusas.

O botão **🌙 Sem brilho** (ou a tecla `C`) zera toda modulação: o brilho fica
constante. Quem pede *menos movimento* nas preferências do sistema já entra
assim, sem precisar achar o botão.

## O ambiente cede à sua passagem

Capim, samambaias, juncos, flores e cogumelos **deitam onde você pisa** e
levantam de novo depois — o caminho se abre à sua frente e se fecha atrás.

São doze pisadas guardadas num uniform, com a força decaindo ao longo de 14
segundos. Um passo novo só entra depois de 30 cm de distância: gravar por tempo
encheria o buffer inteiro com o mesmo ponto quando você para, e a trilha
sumiria justo quando você quer olhar para ela.

Buffer curto em vez de textura de trilha porque assim não há alocação nem
escrita de GPU — são doze `vec3` lidos por vértice.

## Pegar de longe

O raio que sai do controle não serve só para mirar: **segure o gatilho apontando
para uma árvore, cogumelo ou cristal e ele vem junto com a mira**. Soltar
replanta ali, com as mesmas regras de sempre — se não couber, volta ao lugar.

O corredor de acerto é generoso (35 cm de raio em volta do raio), porque mira à
distância perdoa menos que a mão.

## O ciclo dos mundos

Todo mundo começa **descampado**: chão nu e capim ralo. A floresta é obra de
quem planta.

Abra a mão, pegue a semente, solte no chão. A árvore leva **dez
segundos** para crescer — a espera é o que dá peso ao gesto. A cada três
sementes, uma é de **casulo**: maior na mão, e dela nasce a árvore de galhos
abertos com um casulo pendurado.

O casulo pendura na **altura do braço** (1,3 a 1,4 m) e é o objeto mais
luminoso da cena, com um halo próprio que respira. As duas coisas são
deliberadas: ele é o que abre o próximo mundo, então não pode depender de sorte
para ser achado — nem ficar fora de alcance. Na primeira versão ele pendurava a
2,6 vezes a altura da árvore, de 3,2 a 5,1 m do chão, onde nenhuma mão chega.

Toque no casulo e a borboleta te leva ao espaço. Lá, **pegue um planeta com uma
mão e pince com a outra**: afastar as mãos aumenta a escala. Passando do
limiar, o planeta se abre e você atravessa para o mundo dele — vermelho é fogo,
azul é água, verde é clareira. E lá tem chão nu, sementes e um casulo de volta.

A semente de casulo é **contada, não sorteada** (uma a cada três). Sorteio
deixaria alguém preso num mundo se a sorte não viesse.

Trocar de mundo é animar um único float (`uBiome`): o mesmo conjunto de
materiais serve para os três, interpolando entre faixas de cor. Não há
recompilação de shader nem recriação de cena.

## A travessia para o espaço

Alguns galhos têm **casulos** pendurados, pulsando. Toque num deles com a ponta
do dedo: a borboleta nasce, sobe em espiral deixando rastro de luz, e enquanto
ela sobe **o mundo vira espaço**. A subida dela É a transição — as duas duram
os mesmos cinco segundos, de propósito.

Lá em cima há planetas ao alcance do braço, com faixas de gasoso, continentes
de rochoso e fendas de gelado, alguns com anéis. **Pegue-os com a pinça**: ao
soltar, o planeta assume uma órbita nova a partir de onde ficou.

O tamanho é de brinquedo por decisão: em escala real seriam pontos no céu e não
haveria nada para fazer.

Ao atravessar, **as paredes do seu cômodo se rompem**: buracos negros se abrem
nelas, com disco de acreção girando mais rápido perto do centro e o anel de luz
curvada na borda. Eles existem só no espaço — na floresta, parede é parede.

### A piscada dos planetas

Cada objeto tirava sua semente da própria posição em mundo:

```glsl
vSeed = fract(sin(root.x * 12.9898 + root.z * 78.233) * 43758.5453);
```

Funciona para árvore, que não sai do lugar. Mas planeta **orbita** — então a
semente mudava a cada frame, e com ela `tipo = fract(vSeed * 3.7)`, que decide
se o planeta é gasoso, rochoso ou gelado. Medido em oito quadros seguidos, a
semente saltou 0,092 → 0,87 → 0,231 → 0,384 → 0,955, percorrendo os três tipos.
A 90 fps, o planeta trocava de identidade noventa vezes por segundo.

Não era brilho oscilando: era o objeto sendo outro a cada quadro. O mesmo valia
para borboletas, vaga-lumes e medusas, que também se movem.

A correção é dar semente fixa: atributo por instância nos enxames, uniform nos
planetas. `ROOT_AND_SEED` continua no código, com um aviso de que só serve para
objeto parado.

Os planetas ficam **parados no mundo**. A cúpula do céu acompanha a cabeça,
porque céu não se aproxima; planeta ao alcance da mão é o oposto — se ele te
seguisse, você nunca daria a volta nele e a cena pareceria colada ao rosto.

Para voltar, o 🔺 do menu de pulso (ou 🌱 na barra) vira "voltar à clareira".

## Cores realistas

Antes tudo — casca, folha, cogumelo, capim — saía da mesma paleta de cosseno.
Por isso nada nunca parecia mata de verdade: os materiais dividiam o mesmo
arco-íris.

Agora cada um tem sua faixa natural escolhida por semente: castanhos para a
casca, verdes de sombra a brotação para a folhagem, vermelho de amanita a creme
para os chapéus, lilás a amarelo para as pétalas. As borboletas ganharam três
espécies reais — monarca, morpho azul e branca — com nervuras e borda escura.

A paleta virou só o **brilho mágico** por cima, controlado por `uMagic`: em 0 é
uma floresta realista, em 1 é a encantada. A seiva que sobe pelo tronco e as
manchas luminosas dos cogumelos continuam vindo dela.

## O sub-bosque

Cogumelos caíram de 1,1 para 0,42 por m² — viraram acento, não tapete. No lugar
entraram **samambaias** com frondes arqueadas, **juncos** altos, **arbustos** e
**flores** de cinco pétalas.

O sorteio vai do maior para o menor: quem precisa de mais espaço escolhe
primeiro, senão as últimas espécies não acham vaga e quase somem da cena.

**Alturas de árvore** agora variam muito mais que a largura — é o que dá
silhueta de mata em vez de fileira de clones. Quem está no meio do cômodo
continua alto o bastante para você passar por baixo; só perto da parede, onde
ninguém circula, entram as árvores baixas.

## Encantado, não psicodélico

O tom foi rebaixado de propósito, e os dois parâmetros que fazem isso valem
anotar porque erram de formas opostas.

Numa paleta de cosseno `cor(t) = a + b·cos(2π(c·t + d))`, o `c` controla quantos
ciclos a cor percorre ao longo de `t` — baixo, superfícies vizinhas ficam
parentes em vez de brigando, e o arco-íris some.

O `d` é a fase de cada canal, e é onde a primeira tentativa errou: usei ~0,07 de
espaçamento entre canais, eles entraram em fase e a cena inteira virou cinza.
Arco-íris usa 0,33; o meio-termo, ~0,15, dá matiz definido sem varrer o
espectro. Seis paletas encantadas, e as duas psicodélicas originais no fim da
lista para quem quiser o extremo.

O botão de intensidade agora vai a 0,70 em vez de 1,0, e os brilhos aditivos
foram reduzidos pela metade — eles é que empurravam tudo para o estouro.

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
| **Grip** | Reescaneia o cômodo; depois de plantada, troca a paleta |
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
| **iPhone / iPad** | **Modo câmera**: feed da traseira ao fundo e giroscópio girando a cena. Toque em *Abrir com a câmera*. Sem sensor, arraste na tela. |
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

#### A ordem das permissões importa

No iOS 13+, `DeviceOrientationEvent.requestPermission()` exige **ativação
transitória** do usuário — e essa ativação morre no primeiro `await`. Pedir a
câmera antes, que é o que parece natural já que a câmera é o principal, consome
a ativação e faz o pedido de orientação ser rejeitado **sem diálogo nenhum**.

O sintoma é específico e enganoso: a câmera abre normalmente e o giroscópio
simplesmente não liga. Por isso `requestOrientation()` é a primeira chamada do
manipulador do clique, antes de qualquer `await`, e só depois vem a câmera.

Permissão concedida também não garante evento — navegador embutido de outro app
às vezes aceita e nunca emite nada. Um watchdog de 1,8 s detecta esse caso e
troca para arrasto, avisando na tela em vez de deixar você girando o telefone
à toa.

#### Se o giroscópio não ligar

| Situação | O que fazer |
| --- | --- |
| Diálogo apareceu e você negou | Ajustes → Safari → **Movimento e Orientação**, e recarregue |
| Nenhum diálogo apareceu | Confira se está em `https://` — fora disso o iOS não pergunta |
| Abriu de dentro de outro app | Webview embutida costuma não emitir. Abra no Safari |
| Nada funciona | O arrasto na tela continua girando a cena; 🧭 **Centrar** redefine a frente |

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
  room.js               plane-detection, hit-test, polígono, móveis, paredes
  occlusion.js          mesh-detection, varredura visível e oclusor de profundidade
  sky.js                cúpula do céu e medusas à deriva
  interaction.js        controles, toque na tela, mira no chão, háptico
  hands.js              juntas rastreadas, pinça, normal da palma
  menu.js               três orbes no pulso, acionados com o indicador
  magicwindow.js        câmera + giroscópio para aparelhos sem WebXR
  creatures.js          borboletas e vaga-lumes
  body.js               corpo inferido por IK e floração sobre ele
  seeds.js              semente que brota na palma
  constellation.js      constelação no céu (trocar a forma aqui)
  space.js              cena do espaço, planetas pegáveis e a eclosão
  biomes.js             os três mundos e suas faixas de cor
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
test-shaders.mjs        GLSL íntegro e uniforms globais em todo material
```

Rode os três com `npm test`.

### Como a floresta decide onde plantar

O tronco é o que bloqueia a passagem; a copa não, porque fica acima da cabeça.
Então o espaçamento se aplica **só aos troncos**, e as copas ficam livres para
se cruzar por cima:

- **Perto da parede, adensa** (1,85 m entre troncos) — ninguém circula colado no
  rodapé.
- **No meio do cômodo, abre** (2,90 m) — bem mais que o mínimo caminhável, de
  propósito: mata rala deixa ver o espaço entre as árvores, e é isso que faz
  cada uma contar.
- **Móveis viram buracos.** Planos horizontais entre 12 cm e 1,5 m do chão são
  lidos como mesa/sofá e nada é plantado dentro deles.
- **Plantar manualmente respeita a mesma regra.** Se o ponto fecharia a
  passagem, o app recusa e avisa, em vez de deixar você se murar sem perceber.

`npm test` mede isso: no pior cômodo testado sobram **1,88 m de vão livre**
entre as cascas de dois troncos vizinhos.

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
  ocupa pouca tela — o céu é a exceção, com três, porque cobre muita tela mas
  não concorre com nada.
- **A malha do cômodo só é reconstruída quando muda.** Ela tem dezenas de
  milhares de triângulos e refazer os buffers a cada frame derrubaria o frame
  rate; uma assinatura barata de `lastChangedTime` evita isso.
- **Como oclusor ela não custa cor nenhuma.** `colorWrite: false` escreve só
  profundidade, que é o passe mais barato que existe.
- **O frame é blindado contra exceções.** O `WebGLAnimation` do three.js
  reagenda o próximo frame *depois* de chamar o callback, então uma única
  exceção não pula um frame: mata o laço para sempre e congela a cena sem erro
  visível. Numa experiência imersiva isso é o pior desfecho possível.

Uma consequência assumida: em teto baixo, as árvores mais altas atravessam o
forro. Preferi manter a escala de floresta a espremer as copas na altura da sua
cabeça — atravessar o teto parece mágico, esbarrar em galho parece defeito. Com
o céu ligado isso deixa de ser concessão e vira intenção: a copa sobe pela
abertura.

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
