# Histórico de versões

Cada versão é uma tag no git (`v0.12.0`) e um backup no Drive. Para voltar a
qualquer uma:

```bash
git checkout v0.8.0
```

Para ver o que mudou entre duas:

```bash
git diff v0.11.0 v0.12.0 --stat
```

---

## v0.21.0 — A floresta virou nuvem de pontos

Mudança de conceito, vinda do estudo de partículas guardado no Drive. A
vegetação deixou de ser malha e virou nuvem de pontos amostrada na superfície
da própria malha. Os triângulos da cena caíram de **12.777 para 131**.

### A amostragem

Ponderar por **área** é a parte que não dá para pular. Sorteando triângulos por
igual, a nuvem acumula pontos onde a malha é mais detalhada — a copa fica densa
nos cantinhos e rala nas faces grandes, e a silhueta se perde. Ponderando pela
área, a densidade fica uniforme na superfície, e é isso que faz a nuvem ter a
forma do objeto.

E as coordenadas baricêntricas precisam da raiz do primeiro sorteio. Sem ela se
concentram num canto do triângulo, e a nuvem sai com veios.

### A interface que destravou tudo

`NuvemDePontos` **finge ser um `InstancedMesh`**: expõe `setMatrixAt`,
`instanceMatrix` e `count` com o mesmo comportamento. Com isso entra no
`InstanceSet` da floresta como se fosse mais uma malha, e plantar, pegar,
carregar, soltar e crescer seguem funcionando sem saber que agora mexem em
pontos.

Trinta e três mil pontos de vegetação em **catorze chamadas de desenho**.

### A borboleta assada

Veio de um `.glb` de verdade, mas **assada**: `scripts/assar-nuvem.mjs` lê o
contêiner, junta os triângulos já no espaço da cena, amostra, quantiza em 16
bits e escreve só as coordenadas. **482 kB de modelo viraram 20 kB.**

O projeto não tem GLTFLoader, não tem CDN e não tem asset externo. Assar
resolve os três de uma vez — e era a recomendação que o próprio estudo deixou
escrita: *"amostrar os pontos uma vez e salvar só as coordenadas resolveria,
dispensando o modelo"*.

A batida de asa sobreviveu à troca porque tudo o que ela precisa saber cabe em
dois números por ponto: de que **lado** do corpo ele está, e a que **distância**
da dobradiça. Os dois se leem direto da coordenada, sem depender de como a
malha foi construída. Mudou só o eixo: no modelo assado o corpo corre em Z, e
não em Y como na geometria procedural.

### Também viraram partículas

- **O que floresce no corpo.** Um cogumelo sólido brotando do próprio ombro
  oclui o seu braço de verdade e vira um objeto grudado. Em pontos ele lê como
  luz saindo do corpo.
- **O feixe do controle.** Um cilindro fino a quatro metros é uma agulha sólida
  no meio de uma cena de partículas. Agora rarefaz com a distância — firme na
  mão, dissolvido na ponta.

### Pendência

`CREDITOS.md`: não sei a origem do `.glb` da borboleta. Se for CC Attribution,
a licença exige crédito, e uma nuvem extraída dele continua sendo obra
derivada.


## v0.20.0 — Vaga-lumes em pontos; fora os poliedros flutuantes

Dois poliedros sólidos flutuavam sem explicação na cena, e eram coisas
diferentes com a mesma cara.

Os **orbes** eram icosaedros de vinte faces pairando acima da cabeça. Um
poliedro flutuando não lê como bicho, lê como geometria esquecida no ar.

As **estrelas da constelação** eram icosaedros de raio 1 numa cúpula de escala
9 — pedras no céu. E ainda desenhavam o cogumelo de espera, o que as tornava
duplamente sem sentido. Viraram pontos.

### O campo

No lugar dos orbes entrou um campo de **setecentos vaga-lumes**, e ele custa
menos que os quarenta poliedros que substituiu: é **uma** chamada de desenho.

Toda a vida de cada um acontece no shader, a partir da semente — a deriva de
três senóides sem razão simples entre as frequências, o tamanho, a fase do
pisca. O JavaScript escreve as posições de origem uma vez, quando o cômodo é
lido, e nunca mais toca.

Cada um é um núcleo duro dentro de um halo macio. Só o halo dá borrão de
algodão; só o núcleo dá pixel duro. É a soma que lê como luz pequena.

E acendem quando você chega perto, como o resto da mata desde a v0.18.0.

**Segurança:** o pisca mais rápido do campo dá 0,21 Hz — muito abaixo da faixa
de 3 a 30 Hz que dispara crise em epilepsia fotossensível — e ainda passa pelo
amortecedor global.

### Um erro que valeu registrar

A altura dos vaga-lumes tem viés para baixo, que é onde o mato está. Eu tinha
escrito o comentário certo e a conta errada: `Math.sqrt` empurra o sorteio para
**cima**, não para baixo. A mediana saiu em 1,72 m de um alcance de 2,25 —
um chuvisco parado perto do teto, sem relação nenhuma com a mata embaixo.
Expoente maior que 1 é que puxa para baixo.


## v0.19.0 — Aquarela como interruptor, e o céu começa no teto

### Sair do low poly não é acrescentar triângulo

A cena tem 13 mil triângulos e o Quest 3 aguenta ordens de magnitude mais.
O orçamento sobra. O que faz ler como low poly é a normal **facetada** — o
`weld()` produz geometria sem índice de propósito, para que cada face tenha a
sua. E o que faz a referência ler como pintura é o comportamento do pigmento,
que quantidade de geometria nenhuma produz.

Então virou um interruptor, na tecla `A`, com as três marcas da aquarela:

- **Lavada** — o valor se agrupa em poucos patamares, com a fronteira mordida
  pelo grão, porque cada demão é uma passagem de pincel
- **Borda molhada** — o pigmento migra para a beirada da poça enquanto seca e
  a borda fica *mais escura* que o meio. É o contrário do que a computação
  gráfica faz sozinha, e é a assinatura da técnica
- **Granulação** — o pigmento assenta nos vales do papel

Mais contorno a bico de pena, pelo mesmo termo de raspão apertado com expoente
alto — e não por detecção de borda em pós-processamento, que em estéreo custa
dobrado.

### Duas tentativas erradas, e as duas valem registro

A **primeira** aplicava a luz duas vezes: o material já iluminava antes de
chamar, e a função refazia a conta. Junto com isso, deixava a lavada *levantar*
valor até 1,22× — e aquarela é subtrativa, o papel é o branco. Com o `filmic`
logo adiante comprimindo o que passa de um, a cena inteira convergiu para o
mesmo bege.

A **segunda** suavizava a normal até o fim. As formas viraram seixos de argila
e perderam a legibilidade que o low poly tinha.

### O achado

A face plana de um low poly **já é** uma lavada chapada. A referência é lavada
com contorno escuro — o que está mais perto do facetado do que do liso.

Então a normal quase não suaviza (22%), e quem carrega a leitura de pintura é
a tinta e o papel. A normal lisa continua guardada num segundo atributo, ao
lado da facetada, calculada em tempo de construção: dá para variar a dose sem
refazer malha nenhuma.

### O grão é ancorado em mundo, e isso é conforto

Quase todo shader de aquarela ancora o grão na **tela**. Em estéreo, isso faz
cada olho receber um grão diferente sobre a mesma superfície; o cérebro não
funde as duas imagens e o resultado é rivalidade binocular — desconforto real,
do tipo que faz tirar o aparelho da cabeça. Ancorado no objeto, os dois olhos
veem o mesmo grão no mesmo lugar.

### O céu começa no teto

Com o oclusor ativo, o céu deixou de ter desvanecimento angular. Ele é opaco em
**toda** direção, e quem o recorta é a sala: parede e chão escrevem
profundidade e o escondem, o teto não escreve e o deixa passar.

Do teto para cima, 100% virtual. Do teto para baixo, a sua sala. Sem oclusor
não há o que recorte, e só nesse caso ele volta a abrir por ângulo.


## v0.18.0 — A jornada: sete cenários em cadeia

Esta versão nasceu de uma leitura: os 5.773 quadros de *Odada*, analisados um
por segundo. A conclusão que governou tudo o que veio depois é formal, não
temática — **a animação não tem um único corte duro em 3min06**. Detecção de
cena com limiar 0,30 não encontra nada. Tudo é metamorfose: cada coisa vira a
próxima.

A tradução disso para um lugar habitado é uma **cadeia**. Todo cenário tem um
casulo; tocá-lo solta a borboleta; ela sobe levando o mundo embora; quando a
luz baixa, você está no próximo. O sétimo devolve ao primeiro.

### O teto que precisou cair primeiro

As cores de superfície eram três conjuntos literais dentro do shader,
misturados por um float de bioma. Isso travava a experiência em três mundos
**para sempre** — um quarto cenário exigiria reescrever dez funções de cor.

Agora elas viajam por uniform e são perseguidas pelo laço de animação.
Acrescentar um cenário virou acrescentar dados em `cenas.js`, e a travessia
virou interpolação em vez de recompilação.

### Os sete

| | Parede | Lâmina |
| --- | --- | --- |
| A Crisálida | registros ornamentais | poça, 1,5 cm |
| A Gota | ondas atravessando a alvenaria | cintura, 95 cm |
| A Montanha | a parede racha e o magma aparece | névoa rasa |
| O Abismo | dendrito: coral, raiz e raio | submerso, 1,78 m |
| A Dançarina | filigrana de volutas encadeadas | pétalas no chão |
| O Olho | tinta sobre água | — |
| O Palco | moldura de rocha pintada | nebulosa no assoalho |

As cores não foram inventadas: saíram da própria animação, amostrando os
quadros de cada ato e agrupando por matiz. Por isso os azuis são de tinta e
não de céu, e os verdes quase não existem — o verde daquela paleta é teal.

Durante a passagem, **dois padrões de parede vivem ao mesmo tempo** e o peso
migra de um para o outro. Interpolar índice de padrão daria um desenho
intermediário que não existe.

### O céu virou noite

As medusas saíram. No lugar entraram **quatro planetas gigantes** parados em
direções fixas do firmamento — sem algo de tamanho reconhecível lá em cima, a
cúpula é só um fundo —, e **estrelas cadentes** com relógio próprio dentro do
shader, de períodos sem razão simples entre si, para que nunca caiam juntas.

E três densidades de estrela em vez de uma. Uma só dá chuvisco uniforme; o
que lê como céu é a mistura de poucas grandes com muitas pequenas e uma poeira
quase invisível por baixo.

### Os planetas ganharam física

Deixaram de ter órbita escrita à mão. Agora são força: mola fraca para o
centro (que é o que segura o enxame ao seu redor), gravidade entre eles, e
**contato**, que é o que os impede de se tocar.

O teste `test-planetas.mjs` mediu **33 cm de interpenetração** com a força
sozinha — com passo grande, dois planetas já entraram um no outro antes de ela
agir. Entrou separação posicional por cima, e a invariante virou exata: 11 mm
de folga mínima em dois minutos, a 60 e a 30 quadros por segundo.

Os buracos negros caíram de um por parede para **dois**, maiores — e viraram
um par de **portais**: o planeta que entra num sai pelo outro, com a velocidade
virada para vir da parede em vez de ir contra ela.

### As mãos deixaram de ser bolinhas

Ganharam **ossos** entre as juntas, o que fecha os vãos e funde as peças numa
forma contínua. E o material virou vidro: fresnel no lugar do aditivo chapado,
com veios de líquido ancorados em mundo — ancorados ali de propósito, para
atravessarem a fronteira entre uma junta e o osso seguinte sem costura.

### Tudo reage à presença

As pisadas são memória: onde você esteve. Entrou o presente: onde o seu corpo
está neste quadro. A vegetação cede antes de o pé chegar, e a bioluminescência
acende no halo em volta de você. Memória não reage a você parar e se abaixar;
presença sim.

### E mais

- **Menos** borboletas (12), menos árvores, menos buracos. Poucas e grandes
  leem melhor que muitas e pequenas — com enxame a batida da asa, que custou a
  acertar, virava ruído no canto do olho.
- No mundo aquático não voa borboleta: **nada cardume**. O que separa um peixe
  de uma folha que anda é a onda correndo da cabeça para a cauda.
- `cloneMaterial` conserta um bug silencioso: clonar um material duplicava
  também os uniforms globais, e o clone congelava no tempo. Os planetas do
  espaço estavam parados desde a v0.14.1.
- Dois testes novos, e os dois pegaram defeito real no mesmo dia em que
  nasceram: o de planetas achou a interpenetração; o de uniforms achou quatro
  materiais que não compilavam porque o uniform existia no JavaScript e não no
  GLSL.


## v0.17.0 — Floresta bioluminescente

### A regra

Bioluminescência é luz **desenhada**, não brilho geral. Uma folha inteira acesa
lê como plástico retroiluminado; o que lê como vivo é a nervura acesa e o resto
da folha escuro.

Por isso a função nova, `bio(mascara, tom, forca)`, recebe **sempre** uma
máscara — nervura, mancha, ponta, miolo — e nunca 1.0. E vem acompanhada de
`nightBody`, que **escurece** o corpo conforme a luz interna sobe. É contraste,
não intensidade: sem escurecer, subir o brilho só lavaria a cena de branco,
porque o que não brilha ficaria mais claro junto.

### A cor precisou de paleta própria

A primeira tentativa usou a paleta da cena e os cogumelos saíram brancos —
guarda-chuvas de plástico, sem cor nenhuma. A paleta produz pastéis com os três
canais altos; multiplicada pela força da luz e passada pelo `filmic`, ela satura
e vira branco chapado.

A bioluminescência de verdade vive numa faixa estreita, o ciano-verde de 490 nm,
com desvios para o azul e para o verde-limão. Com o canal vermelho baixo, a cor
**sobrevive à saturação**: por mais que se aumente, ela clareia sem perder o tom.

E dar uma cor comum a tudo que brilha é o que faz a mata inteira parecer um
organismo só. Cada mundo tem a sua — brasa no fogo, azul-abissal na água.

### Onde a luz mora

| Onde | Máscara |
| --- | --- |
| Folha | a nervura, isolinha do mesmo ruído que já desenhava as manchas |
| Tronco | o fundo do sulco, não a crista — é o que dá relevo em vez de neon |
| Cogumelo | as manchas (agora escuras no corpo) e a lamela por baixo da aba |
| Caule | anéis subindo, estreitados por expoente |
| Flor | só o miolo: a flor vira uma lamparina pequena |
| Capim | só a ponta, com expoente alto — são mil lâminas finas, e acender a lâmina toda viraria um tapete cintilante |
| Fruta | mais forte no lado **escuro**: é o avesso da luz externa, e é o que a faz parecer iluminada por dentro |
| Chão | duas tramas de micélio em escalas diferentes — uma malha dentro de outra |

### O chão reage ao corpo

As mesmas pisadas que amassam a vegetação no vertex shader agora **acendem** o
micélio no fragment, e apagam sozinhas conforme a pisada envelhece. É plâncton
na areia: o lugar responde ao corpo com luz.

Não custou uniform novo — o buffer de doze passos já existia; só precisou ser
declarado também do lado do fragment.

### Controle e segurança

Quatro degraus (apagada · discreta · acesa · profusa), no último orbe do menu
de pulso e na tecla `B` da prévia. É dial e não interruptor porque o efeito muda
a leitura da mata inteira, e há quem queira só um sinal de vida.

O uniform é perseguido no laço em vez de saltar: uma mata que acende de estalo é
justamente o tipo de mudança brusca de brilho que este projeto evita. O pulso da
luz é de **0,09 Hz** e ainda passa por `damp`, longe da faixa de 3 a 30 Hz.


## v0.16.1 — O teto vira abertura por altura, não por rótulo

Correção da v0.16.0, que não resolveu o problema que dizia resolver.

### O que estava errado

A v0.16.0 tirava do oclusor a malha rotulada `ceiling`. A premissa era que o
cômodo chega em malhas separadas e rotuladas. Muitas vezes não chega: o Quest
costuma entregar o cômodo **inteiro como uma malha só**, rotulada
`global mesh` — teto, parede, chão e móveis no mesmo objeto.

Nesse caso não havia nada a excluir da lista. O teto seguiu escrevendo
profundidade, e a copa que passa dele continuou escondida atrás do gesso.

### O que passou a ser

O oclusor deixou de ser `MeshBasicMaterial` e virou shader cru com um
`uCorte`: acima daquela altura de mundo o fragmento é descartado e deixa de
ocupar o Z-buffer.

A decisão passa a ser **por fragmento**, e por isso vale igual nos dois casos
— malha única ou malhas rotuladas. Abaixo da linha a parede continua parede;
acima, não há mais nada ocluindo, e a copa aparece.

Duas margens, porque as duas fontes de altura têm confiabilidade diferente:

| Fonte | Margem | Por quê |
| --- | --- | --- |
| Detecção de planos (`ceilingY`) | 10 cm | É um plano de verdade. Cada centímetro a mais é parede real que some e vira céu. |
| Topo da malha lida | 32 cm | É estimativa: lustre, viga ou leitura ruim empurram o máximo para cima. |

### E o céu pôde ficar opaco

Com o oclusor recortando, quem decide onde o céu aparece passa a ser a
própria sala: parede e chão escondem, o buraco do teto mostra. Não é mais
preciso abrir o céu por ângulo e torcer para a conta fechar — **todo o teto
vira virtual**, e a copa aparece contra ele.

Sem oclusor a coisa volta ao que era, abrindo por ângulo, porque um céu opaco
sem nada que o recorte cobriria a sala inteira.

### Teste

`test-occlusion.mjs`, agora no `npm test`, cobre quatro casos — e o
cômodo-numa-malha-só é o primeiro deles, por ser exatamente o que falhou
calado.


## v0.16.0 — Teto aberto, árvore de galhos com frutos, e lugar para a trilha

### O teto vira abertura

O teto era a única superfície do cômodo que não podia escrever profundidade.
Escrevendo, a copa que passa dos 2,6 m ficava escondida atrás dele — olhar
para cima mostrava gesso, nem céu nem árvore.

Agora ele não oclui. Parede e chão continuam ocluindo, porque ali a sala é
sala; só o teto sai da frente.

E com o teto virado abertura, o céu pôde voltar a ser **testado em
profundidade**. O teste estava desligado justamente porque o teto o apagava
por completo — desligado, porém, o céu era pintado por cima de tudo, e a copa
da árvore levava uma demão de céu proporcional à altura do olhar. Ligando de
volta, as duas coisas se resolvem na mesma linha: o céu passa pelo buraco do
teto, e a copa fica na frente dele.

Para cima o céu agora fecha **por inteiro** — o teto é a parte que pode ser
realidade virtual. Para os lados ele cede, e ali continuam sendo as suas
paredes. As medusas do céu ganharam o mesmo teste, e passam por trás das
copas em vez de por cima.

### A árvore deixou de ser um pinheiro

A espécie que o casulo escolhe era "pagode": quatro cones empilhados, silhueta
em degraus — um pinheiro. Virou árvore de verdade:

- tronco de 2,35 m que se abre em **quatro braços**, cada um com altura,
  azimute e inclinação próprios (quatro galhos iguais girados em torno do eixo
  leem como antena, não como árvore)
- massa de folha na ponta de cada braço, e uma coroa fechando a forquilha
- **frutos** — octaedros de seis centímetros pendurados sob as folhas

Os frutos vêm em malha separada da copa, porque a cor é outra: fruta com a cor
da folha não é fruta. Três variedades sorteadas pela árvore (rubi, âmbar,
ameixa), com um ponto de luz especular que as faz parecer lisas e molhadas. No
mundo de fogo elas assam; no de água ficam nacaradas. As outras duas espécies
também ganharam os seus.

O casulo subiu de 1,4 m para o raio em que os galhos passam — agora pende de
um deles em vez de flutuar ao lado do tronco. Continua ao alcance de um braço
levantado, e sempre ao alcance da mira.

Custo: a árvore de galhos tem 296 triângulos contra 88 do pagode. A cena
inteira foi de 12.929 para 13.217.

### Um lugar para a trilha

Se existir `assets/trilha.mp3`, ele passa a ser **a** trilha: carregado,
posto em loop, entrando em oito segundos — uma trilha que começa de estalo
denuncia o carregamento; entrando devagar ela parece ter estado ali o tempo
todo.

O drone gerado não some: recua para um leito quase inaudível, porque é ele que
sustenta a cena quando a trilha respira. Os sinos das interações continuam por
cima, já que são resposta ao gesto e não música.

A trilha passa por um passa-baixa que acompanha o bioma — limpa na terra,
áspera no fogo, submersa na água. Uma trilha só, sem precisar exportar três.

**Sem o arquivo nada muda.** A ausência apenas significa que o drone gerado em
tempo real continua sendo a trilha, como foi até aqui. Veja `assets/README.md`.


## v0.15.0 — O cômodo veste cada mundo, e tudo se alcança de longe

### Sentado, deitado, de pé

A interação deixou de ser *alcançar* e passou a ser *mirar*. O raio de cada
mão sai do **olho, através da mão**, e segue adiante — não sai do dedo porque
o indicador se dobra para encostar no polegar justamente quando você pinça, e
aí a direção do dedo aponta para qualquer lugar menos o alvo.

Com isso, tudo passa a funcionar de qualquer postura:

- **casulo** — pinçar mirando abre, sem precisar chegar perto e encostar
- **planta** — pinçar mirando arranca e traz preso ao raio; mexer o pulso a
  arrasta lá longe, com a distância congelada
- **planeta** — pinçar mirando pega, mesmo com a órbita fora do alcance do braço
- **plantar** — a semente cai onde o raio encosta no chão, não sob a cadeira

Encostar continua funcionando. O que mudou é que já não é obrigatório.

### As paredes são o palco, em todos os mundos

Cada mundo agora **veste** o cômodo em vez de fugir dele. O material das
paredes é aditivo e não escreve profundidade: ele pinta *por cima* do
passthrough, então a sua sala continua visível por baixo.

| Mundo | Nas paredes | Na horizontal |
| --- | --- | --- |
| Terra | trepadeiras finas subindo do rodapé, com folhas | — |
| Fogo | a alvenaria racha e o magma brilha nas fendas | névoa de brasa rente ao chão |
| Água | ondas atravessando a parede, subindo devagar | lâmina na altura da cintura, com cáusticas |

A lâmina de água é translúcida de propósito: as suas pernas de verdade
aparecem por baixo, e é isso que faz a água parecer estar *na* sala.

Quando o Space Setup não traz paredes marcadas — o que é comum —, elas passam
a ser derivadas do polígono do chão. Onde o chão acaba, a parede começa. Vale
para a casca e vale para os buracos negros, que antes simplesmente não
apareciam nessas salas.

**O céu não fecha mais em volta.** Antes ele descia até cobrir tudo no espaço,
e o resultado era realidade virtual. Agora existe um teto de opacidade e o
horizonte para acima da linha da sala: mesmo entre os planetas, as paredes
continuam ao seu redor — com os buracos negros abertos nelas.

### O mundo evapora

Ao sair do casulo, a borboleta não deixa uma cena que encolhe: deixa um mundo
que se **dissolve**. O corte é por fragmento, com limiar que sobe com a altura
e um ruído ancorado em mundo — a rasteira some primeiro, as copas por último,
em manchas em vez de uma linha subindo. Termina em 75% da subida; o último
trecho ela sobe sozinha.

No alto ela vira luz: um clarão que decai em cerca de dois segundos. Lento de
propósito, muito abaixo da faixa de 3 a 30 Hz que dispara crise em epilepsia
fotossensível.

### Cada planeta é um elemento

A superfície do planeta passou a ser decidida pelo elemento que ele guarda, e
não por sorteio: continentes e mares na terra, basalto rachado de magma no
fogo, oceano coberto de nuvem na água. Sem isso não dava para *escolher* para
onde ir — só para descobrir depois de já ter atravessado.

### A asa volta a bater

O que identifica uma borboleta não é a frequência: é o padrão. Ela bate
algumas vezes fundo, para, e plana.

Bater sem parar dava o "frenético" da v0.12; planar sempre — a correção da
v0.13 — tirou a batida junto, e aí não parecia mais borboleta. Agora são
**rajadas de ~1,7 Hz com curso de 100°** (de 19° abaixo da horizontal a 82°
acima, quase se encostando por cima do dorso), separadas por planeios de
quatro segundos em diedro raso.

Junto vieram duas coisas que dão peso ao bicho: a ponta da asa chega **depois**
da dobradiça, o que a faz parecer membrana em vez de placa; e o corpo inteiro
sobe quando as asas descem.


## v0.14.1 — Semente estável para objetos em movimento

A piscada dos planetas não era brilho oscilando: era o objeto **trocando de
identidade**. Cada instância derivava sua semente da posição em mundo, o que
serve para árvore mas não para planeta em órbita — a semente mudava a cada
frame, e com ela a escolha entre gasoso, rochoso e gelado. Em oito quadros
seguidos ela passou pelos três tipos.

O mesmo afetava borboletas (espécie e cor), vaga-lumes (fase) e medusas. Agora
a semente vem de atributo por instância nos enxames e de uniform nos planetas.

## v0.14.0 — Plantio destravado, planetas parados e buracos negros

**O plantio travava o jogo inteiro.** "Palma para cima" dependia do sinal de um
produto vetorial que varia com a lateralidade e que eu nunca pude conferir em
hardware; invertido, a semente nunca nascia. Agora o gesto é **abrir a mão**,
medido pela extensão dos dedos sobre o tamanho da palma — adimensional e sem
orientação. Vale para as duas mãos. A pinça também passou a priorizar planta ao
alcance sobre semente.

**Planetas** pararam de seguir a cabeça e ficaram sólidos. O campo de estrelas
em `Points` saiu: pontos de um pixel serrilham a cada movimento, e eram eles que
faziam o espaço piscar.

**O ambiente cede à passagem**: a vegetação deita onde você pisa e levanta
depois.

**Pegar de longe** pelo raio do controle, e **buracos negros** nas paredes,
visíveis só no espaço.

## v0.13.0 — Asas à deriva e versionamento

Asas de 1,7–2,5 Hz para 0,62–0,92 Hz, planando ~45% do tempo, curso de -8° a
+63° (era -14° a +77°). Fidelidade joga contra aqui: a borboleta real passa de
8 Hz, mas vinte asas rápidas no campo de visão leem como enxame agitado.

Versionamento: as doze versões anteriores marcadas retroativamente, changelog,
`scripts/release.mjs` e a versão visível na tela inicial. As tags são o backup —
`git checkout v0.8.0` devolve a árvore inteira, e cada uma tem zip próprio no
GitHub.

## v0.12.0 — Ritmo

Tudo a ~48% da velocidade original; transições 1,6x a 2,8x mais longas. As
harmônicas secundárias do vento e do voo caíram de 0,35 para ~0,20 — eram elas
que punham tremida por cima do arco largo. Curvas de crescimento passaram de
puramente desaceleradas para `smoothstep`, que começa e termina devagar.

## v0.11.0 — Forma da borboleta e casulo alcançável

A silhueta era de libélula: duas lascas finas por lado. Virou leque de
triângulos até um contorno arredondado, proporção 1,33 de envergadura por
comprimento. O casulo pendurava a 3,2–5,1 m do chão, fora do alcance de
qualquer mão — baixou para 1,3–1,4 m e ganhou halo próprio. Árvores de 0,42
para 0,16 por m².

## v0.10.0 — Eixo da asa e densidade dos padrões

As asas giravam em torno de Z, o que as varre dentro do próprio plano em vez de
levantá-las. Passaram a girar em torno do eixo do corpo. Padrões espaciais
caíram de até 60 faixas por metro para 2–4: densidade, não velocidade, era o
que fazia as texturas parecerem correr.

## v0.9.0 — Ciclo de mundos e segurança contra cintilação

Três biomas interpolados por um único float. Cenário descampado: a floresta é
obra de quem planta, com 10 s de crescimento. Planeta escalado com duas mãos
abre o mundo dele.

Cintilação: a pior fonte eram estrelas de borda dura, que apareciam e sumiam a
cada movimento de cabeça. Vaga-lumes iam de 0,08 a 1,0 de brilho. Uniform
`uCalm`, botão 🌙 e `prefers-reduced-motion`.

## v0.8.0 — Cores realistas e o espaço

Casca, folha, cogumelo e capim saíam todos da mesma paleta de cosseno. Cada
material ganhou faixa natural própria; a paleta virou só o brilho mágico.
Sub-bosque com samambaia, junco, arbusto e flor. Casulo leva ao espaço, com
planetas pegáveis.

## v0.7.0 — Encanto, criaturas e corpo

Paletas encantadas no lugar das psicodélicas. Borboletas, vaga-lumes, corpo
inferido por IK de dois ossos a partir de cabeça e punhos, sementes na palma,
constelação no céu.

## v0.6.0 — Escanear de verdade

O app olhava `detectedPlanes` primeiro, achava o Space Setup antigo e nunca
abria o escaneamento. O reset passou a vir antes da captura.

## v0.5.0 — Scanner, oclusão e céu

`initiateRoomCapture()`, `mesh-detection` e oclusão por profundidade: a árvore
atrás do sofá passa a ficar atrás do sofá. Céu que só aparece ao olhar para
cima.

## v0.4.0 — Giroscópio no iOS

`DeviceOrientationEvent.requestPermission()` exige ativação por gesto, e ela
morre no primeiro `await`. Pedir a câmera antes consumia a ativação.

## v0.3.0 — Modo câmera no iPhone

iOS não implementa WebXR em navegador nenhum. Câmera traseira ao fundo mais
giroscópio. Também: o `#overlay` sem `z-index` ficava atrás do canvas.

## v0.2.0 — Mãos livres e celular

Pinça pega e replanta, menu de pulso, hit-test no Android.

## v0.1.0 — Primeira versão

Floresta low poly no cômodo mapeado, texturas 100% procedurais, espaçamento
caminhável.
