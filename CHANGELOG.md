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

## v0.25.0 — A árvore-mãe, e o app cabendo no headset

### A árvore no meio da sala

Uma árvore só, no centro do cômodo mapeado, e é dela que o casulo pende. Ela
vem de um modelo fotogramétrico de **2,1 milhões de triângulos e 97 MB** — e o
que viaja são **539 kB**: 46.000 pontos amostrados na superfície ponderando por
área, com a cor que a textura tinha em cada um. `scripts/assar-nuvem.mjs`
ganhou `--cor` para isso, e decodifica o JPEG chamando o ffmpeg, porque o Node
não decodifica e o projeto não tem dependência.

**A textura original é a cor**, como pedido. Ela precisa de levante — o albedo
foi capturado à sombra e a média medida dos 46.000 pontos dá luminância 0,22 —
mas só multiplicar lava: os três canais estão comprimidos perto uns dos outros
e abrir assim dá cinza. Afastar cada canal da própria luminância antes de abrir
devolve o pardo da casca sem inventar cor nenhuma.

**E ela é OPACA.** Toda a vegetação daqui é aditiva, e funciona porque é rala:
um capim tem catorze pontos. Somar 46.000 dá branco — a primeira versão era uma
mancha luminosa com formato de nuvem, sem tronco e sem galho. Sem mistura e
escrevendo profundidade, o ponto da frente tapa o de trás, e é isso que faz um
monte de pontos ler como um corpo.

### O que se mexe, e o que não

Tronco, copa e fruto passaram a ter rigidez zero: **árvore não balança**. Uma
que oscila inteira, do pé à copa, na mesma fase do capim, desfaz a escala dela
num segundo. O vento ficou com quem de fato cede a ele — capim, samambaia,
junco, arbusto e flor.

### A textura animada voltou

A conversão para partículas tinha perdido o ruído correndo pelas superfícies,
porque um ponto não tem superfície onde correr. A solução é amostrar o ruído na
posição do ponto em espaço de **objeto** e deixá-lo derivar no tempo: a textura
não está pintada no ponto, está atravessando a árvore, e cada ponto mostra o
pedaço dela que passa por ali agora. Fica ancorada no objeto e não na tela —
que é o que importa em estéreo.

### O casulo

Era um icosaedro esticado: quarenta faces de pedra rolada num fio. Como é o
objeto que a pessoa procura, aponta e toca — a única porta de saída do cenário
— era o que menos podia ser um provisório.

Agora a forma é **revolucionada a partir de um perfil**, que é como uma
crisálida se descreve: o cremaster fino onde se prende ao galho, o abdome que
engorda logo abaixo, a maior largura no terço superior onde ficam as asas
dobradas, e a ponta afilando. Mais as costelas do abdome, a seção achatada de
lado, e normais **suaves** — a única coisa da cena que não é facetada de
propósito, porque casulo é liso e encerado. 1.052 triângulos.

O material ganhou translucidez de verdade: a luz atravessa mais onde a casca é
fina, que é onde a silhueta vira de perfil. A luz interna caiu muito — a versão
anterior estourava em branco e o casulo ficava encontrável e ilegível ao mesmo
tempo. Quem resolve o "ser achado" é o halo, que existe só para isso.

E o **halo passou a usar o casulo sem o fio**. Ele infla a malha empurrando cada
vértice cinco centímetros pela normal, e num fio de dois milímetros de raio isso
não é um halo: é uma trombeta maior que o próprio casulo, saindo do topo.

### O portal parava fora da sala

Ele plantava a tela dois metros e meio à frente da cabeça, e num cômodo comum
isso é do lado de fora: nascia atravessada na parede, metade dela fora do espaço
mapeado. Agora **abre na própria parede**, crescendo onde já estava, com o
tamanho vindo da parede que a segura e do pé-direito lido. Não tem como sair do
cômodo porque nasce colada num limite dele — e a leitura melhora: o que se abre
é a parede, que é o que um portal faz.

### O sol subiu

Ele nasceu no centro do sistema, que é o certo — mas o centro fica na altura do
peito, dentro da sala, e ali uma estrela com coroa ocupava justamente o lugar
por onde se anda e por onde os planetas passam. Agora ela mora acima do teto,
deslocada do eixo, e é de lá que vem o dia e a noite de cada planeta: dá para
ver **a sombra atravessando cada um deles**. O ambiente caiu de 0,46 para 0,17,
que é o que faz a sombra virar informação em vez de buraco.

O preço, dito na cara: o centro de gravidade continua no meio do enxame e não
coincide mais com a estrela. É uma licença, e é o que cabe num cômodo — a
alternativa honesta seria pôr os planetas a trinta metros de altura, e aí não
haveria nada para pegar com a mão.

### Os feixes das mãos saíram

Cada controle desenhava um cordão de 130 pontos saindo da mão, quatro metros
adiante. Ele não decidia nada — quem confirma a mira é o retículo no chão e o
realce no objeto — e atravessava a cena na altura dos olhos, tapando justamente
o que a pessoa está tentando mirar.

### Offline

Um service worker guarda o app inteiro no aparelho: código, biblioteca, trilha
e os 40 MB da animação. Depois da primeira visita ela abre **sem rede** — e, o
que importa mais na prática, abre rápido e não trava no meio porque o wi-fi
oscilou.

A estratégia é cache primeiro. Aqui não há conteúdo que envelhece: o que existe
é uma versão inteira, que muda quando eu publico. A troca é **atômica** — o
nome do cache é a versão, e a nova só substitui a antiga depois de baixada
inteira. Nunca existe um momento em que metade do app é de uma versão e metade
de outra, que num projeto cujos módulos se importam por nome apareceria como
tela preta.

**Não foi verificado no aparelho.** O navegador embutido que uso para conferir
bloqueia service workers — nem um de uma linha registra — então o que dá para
garantir daqui é o que virou teste: que a lista de arquivos cobre todo módulo
de `src/`, e que tudo o que ela pede existe no repositório.

### Testes

`test-modulos.mjs` ganhou duas verificações, as duas nascidas de erros desta
versão:

**Constante usada e nunca declarada.** Um `L_ABERTA` sobreviveu a uma
refatoração: a constante saiu do topo de `portal.js` e uma referência a ela
ficou dentro do construtor. `node --check` não vê, porque é sintaxe válida, e o
import estava certo. A página quebrava só ao construir o objeto.

**O service worker conhece todos os módulos.** Uma lista escrita à mão apodrece:
um módulo novo entra, ninguém acrescenta lá, e o app funciona na bancada e
quebra offline — que é o único lugar onde ninguém testa.

## v0.24.1 — O contorno preto em volta de tudo que brilha

Partículas com anel escuro, e os raios das mãos virando um cordão de contas
pretas. O defeito estava em **dezoito materiais** de uma vez, e existia desde
sempre — só que nunca dava para vê-lo aqui.

### Não era a cor. Era o alfa.

A mistura aditiva do three é `(srcAlpha, One)`: o que chega ao quadro é
`rgb * a` somado ao que já estava lá. Como somar nunca escurece, escrever
`vec4(luz, 1.0)` parecia inofensivo — e era o que quase todo material aditivo
do projeto fazia.

Só que em `immersive-ar` o compositor usa o alfa da **nossa** camada para
decidir quanto da câmera passa por baixo. Alfa 1 quer dizer "aqui é só meu,
não mostre o mundo real". Um sprite de partícula tem o miolo aceso e a borda
quase apagada — mas gravava alfa 1 no disco **inteiro**. A borda virava um
disco preto opaco tapando a sala, e cada partícula ganhava um anel escuro. O
feixe que sai da mão é feito de cento e trinta desses pontos.

**Na prévia do navegador nada disso aparecia**, porque lá o fundo já é preto, e
preto sobre preto é invisível. Só o headset tinha onde mostrar o defeito — e só
depois de publicado.

### A correção

Uma função `aditivo()` divide a luz pelo próprio pico antes de sair. Como a
mistura multiplica de volta por `a`, o que chega ao quadro continua sendo
exatamente a mesma luz de antes — mas o alfa gravado passa a ser **quanta luz
foi de fato somada**. Borda apagada, alfa zero, a sala aparece.

O pico e não a luminância: um azul saturado tem luminância baixa e mesmo assim
precisa registrar presença.

Cada um dos dezoito materiais foi convertido preservando a contribuição de luz
ao pixel — `vec4(X, 1.0)` virou `aditivo(X)`, `vec4(X, a)` virou
`aditivo(X * a)`, `vec4(X * a, a)` virou `aditivo(X * a * a)`. Sobre fundo
preto a cena está pixel a pixel idêntica; o que mudou foi só o canal que o
compositor lê.

De quebra, as paredes voltaram a fazer o que a documentação delas sempre
prometeu: como agora gravam alfa proporcional ao brilho do padrão, **o cômodo
real reaparece por baixo** em vez de ser coberto por um retângulo opaco.

### O teste

`test-shaders.mjs` passou a exigir que todo material com `AdditiveBlending`
termine em `aditivo()`. É uma regra que **não dá para verificar olhando a
prévia** — daí ela virar teste. Conferido: reverter um único material faz o
teste falhar apontando o nome dele.

Um material não-aditivo (`tideMaterial`, a lâmina d'água) foi convertido por
engano na primeira passada, porque a substituição casou por texto. A auditoria
que compara "é aditivo" com "usa o helper" nos dois sentidos pegou.

### E a crase, pela sexta vez

O comentário que explica esta correção tinha crases dentro do bloco GLSL, o
que termina o template literal do JavaScript e quebra o arquivo inteiro.
`test-shaders.mjs` pegou na primeira execução, como das outras cinco vezes.

## v0.24.0 — O portal, e o casulo indo para o lugar certo

### O casulo levava ao lugar errado

Pegar o casulo não levava ao espaço. Ele **avançava um elo da cadeia** — do
cenário 0 para o 1, do 1 para o 2 — e nessa fila o cosmos era o sexto elo:
seis casulos até ver um planeta.

Não era o que a experiência promete, e apagava a **escolha**, que é a única
razão de cada planeta ser um elemento diferente. A jornada voltou a ser uma
roda com eixo: o casulo devolve ao espaço, e é lá, ampliando um planeta, que
se decide qual mundo vem a seguir. Só de dentro do próprio cosmos é que ele
avança um elo, para nunca ser um beco.

**E o gatilho não tinha caminho nenhum até o casulo.** A verificação existia só
para a pinça: apontar o controle para o casulo agarrava a planta atrás dele ou
plantava no chão. A única porta de saída do cenário funcionava apenas para
quem usa rastreamento de mão.

### O portal

A animação passa dentro do cômodo, pendurada numa parede, do tamanho de um
quadro e em silêncio: uma janela para o lugar de onde tudo isto veio. Mirar e
pinçar abre — o retângulo cresce até virar tela de cinema à sua frente, o som
entra e a trilha recua para debaixo dele. Pinçar de novo devolve a janela à
parede.

**A tela aberta é fixada no mundo, não na cabeça.** Uma tela que segue o olhar
é impossível de olhar: nunca sai do canto do olho, e não dá para se aproximar
nem se afastar dela. Ao abrir, ela é plantada uma vez à frente de onde você
estava; dali em diante quem se move é você.

**A borda é um rasgo, não uma moldura.** Um retângulo nítido no meio da sala lê
como televisão, e televisão é o oposto de portal. A margem se desfaz num
limiar irregular tirado de ruído lento, com um anel de partículas por fora.
Aberta, o rasgo se fecha: quando a tela é grande e você está dentro dela, ele
já cumpriu o papel e só comeria imagem.

A imagem passa **intocada** — nada de `filmic`, nada de paleta, nada de
encanto. Ela já foi graduada por quem a fez, e aplicar o tratamento da cena por
cima seria refazer, mal, um trabalho pronto.

O som do vídeo entra pela **mesma mesa** que o resto, e não pelo alto-falante
por conta própria: é o que permite abaixar a trilha por baixo dele em vez de
somar duas músicas. `createMediaElementSource` só aceita ser chamado uma vez
por elemento, então a fonte é criada na primeira abertura e guardada.

O arquivo tem 40 MB — 1280 px de largura, CRF 28. A 1936 px e CRF 25 ele ficava
com 58 MB sem diferença visível numa comparação lado a lado.

### Um material morto, e o teste que faltava

A troca de cor das borboletas da v0.22.1 foi aplicada num material que **não é
usado desde a conversão para partículas**. O arquivo tinha dois blocos de cor
de asa idênticos, e a edição pegou o primeiro. As cores certas agora estão no
material vivo, e o morto foi removido junto com o `import` dele.

Só que o `import` estava em **dois** lugares, e o segundo derrubou a página
inteira: sem empacotador e sem verificação de tipos, um `import` de um nome que
não existe mais é erro em tempo de execução, e a única mensagem aparecia no
console do navegador — o único lugar onde ninguém olha antes de publicar.

Daí o **`test-modulos.mjs`**: ele confere estaticamente que todo `import`
nomeado entre módulos do projeto aponta para um `export` que existe. Estático
de propósito — importar de verdade em Node não serve, porque `main.js` mexe no
DOM já na avaliação, e é justamente ele o que mais precisa ser conferido.

Restam **nove materiais mortos** da mesma conversão (`barkMaterial`,
`grassMaterial`, `orbMaterial` e companhia). Todos ainda compilam na entrada.

## v0.23.0 — Universo Encantado, e a trilha entrou

### O nome

"Floresta Psicodélica" descrevia o primeiro protótipo: uma mata, low poly,
saturada. Já não é isso — são sete cenários encadeados por uma borboleta, tudo
em nuvens de partículas, e o extremo saturado virou um modo opcional. O projeto
passou a se chamar **Universo Encantado**, e o cogumelo do ícone deu lugar à
borboleta, que é quem conduz a experiência.

O endereço publicado **não muda**: continua em
`pliniohit.github.io/floresta-psicodelica-ar/`. Renomear o repositório
quebraria o link que já está compartilhado.

### A trilha

"Birth of the Mbira" entrou no lugar do drone gerado — que não sumiu: recua
para um leito quase inaudível e continua sustentando a cena.

**O laço foi montado, não só cortado.** O original tinha 0,94 s de silêncio no
começo e 0,51 s no fim: 1,45 s de ar parado a cada volta. O silêncio saiu, e os
três segundos finais foram sobrepostos aos três iniciais em fusão cruzada — a
cauda da volta anterior ainda soa enquanto a próxima entra, e a emenda deixa de
existir.

**Opus antes de mp3, e não por tamanho.** O mp3 não fecha laço: o formato guarda
um atraso de codificação e um enchimento no fim que o decodificador entrega
junto com o áudio, e são alguns milissegundos de silêncio colados nas duas
pontas. Em música ambiente de quatro minutos, isso é um soluço audível a cada
volta. O Opus registra no contêiner quantas amostras descartar. O mp3 fica como
reserva para quem não decodifica Opus.

### Dois bugs no caminho

O `fetch` da trilha usava `cache: 'force-cache'`, que devolve o que estiver
guardado **sem revalidar**. Para quem tivesse aberto o site antes de a trilha
existir, o que estava guardado era um 404 — e a busca continuava "falhando"
contra um arquivo que já estava no servidor. Só um cache limpo resolveria.
Agora é cache comum, que pergunta se mudou.

E o servidor de desenvolvimento não tinha `.mp3`, `.ogg` nem `.wav` na tabela de
tipos, então servia áudio como fluxo de bytes anônimo.

## v0.22.1 — Borboletas coloridas, partículas pequenas

Elas estavam brancas, e a causa era de escala.

São **2600 pontos numa borboleta de doze centímetros e meio**. A um metro do
olho, isso é cerca de um ponto por pixel — a nuvem já cobre a silhueta inteira
sem folga nenhuma. O ponto estava com **trinta pixels**, então cada um cobria
novecentos vizinhos. E como a mistura é **aditiva**, novecentas somas de
laranja dão branco: a borboleta perdia a cor e virava um borrão claro.

Agora o ponto tem cinco pixels a um metro — a escala em que cada ponto ainda é
um ponto — com piso de 1,1 px para a borboleta que voa longe não sumir (abaixo
de um pixel o rasterizador simplesmente descarta). Junto foram o halo do ponto,
que só empilhava claridade sobre o vizinho, e o ganho de 1,4x na saída.

E as três espécies ganharam **pigmento fundo**: elas partiam de tons já claros,
e o aditivo terminava de lavá-las — de longe as três davam a mesma borboleta
branca. A monarca agora nasce de um laranja queimado, a morpho de um azul
quase noturno, e a terceira deixou de ser branca: virou amarela-creme, porque
branco sobre céu claro não lê como bicho. É a **ponta da asa** que clareia, que
é como asa de borboleta funciona.

## v0.22.0 — Um sistema solar de verdade

Quatro pedidos numa versão só, e eles se encaixam: atmosfera, peso na mão,
folga entre os planetas e uma estrela no centro.

### Atmosfera volumétrica

Cada planeta ganhou uma casca de gás, e ela é **volumétrica de verdade** — não
um halo desenhado na borda. Cada fragmento atravessa a casca integrando
densidade ao longo do próprio raio de visão: no meio do disco o raio corta
pouco gás e o céu é fino; rente à silhueta ele viaja de raspão por toda a
espessura e acumula muito mais. Essa faixa clara que contorna o planeta — o
limbo — aparece como **consequência do caminho**, não como um `pow(1-dot(N,V))`
pintado à mão. Por isso ela se comporta certo quando a mão gira o planeta e
quando a cabeça anda em volta.

A integração é feita em espaço de mundo, então cada olho tem sua própria origem
de raio: as nuvens ganham paralaxe entre um olho e outro e o gás lê como coisa
com profundidade, não como decalque colado na esfera.

A cor vem do elemento — azul de espalhamento na terra, enxofre no fogo,
turquesa na água — e é o que mais distingue um planeta do outro de longe. Os
gigantes do firmamento também ganharam a sua: a quarenta metros o relevo do
disco quase não se lê, e é a borda macia que faz um gigante parecer mundo.

### Pegar virou físico

`carry` escrevia a posição direto na mão. Por isso pegar um planeta não era
pegar coisa nenhuma: ele grudava no ponto da pinça, não tinha peso, não
empurrava ninguém e, ao ser solto, caía do repouso.

Agora a mão puxa por uma **mola**, e quem move o planeta continua sendo a
física. Tudo o mais vem junto de graça: ele chega um instante depois da mão, o
pequeno chega mais rápido que o grande, afasta os outros enquanto passa, e a
velocidade com que a mão o largou já é a dele — **soltar em movimento é
arremessar**.

O amortecimento é medido contra a velocidade *da mão*, não contra zero. Sem
isso a mola cobrava um pedágio constante enquanto a mão se movia: quinze
centímetros de atraso permanente, que a mão sente como elástico e não como
peso. Descontando a velocidade da mão, o atraso só aparece quando ela
**acelera**, que é onde inércia se sente de verdade — caiu para nove
milímetros.

E a mão vazia também é um corpo: dá para varrer o enxame com a palma e abrir
caminho, sem gesto nenhum.

### Eles não se encostam

Não bastava as superfícies não se tocarem. O que se vê agora não é a esfera, é
a **atmosfera** — e duas cascas de gás se atravessando lêem exatamente como
dois planetas encostados, por mais folga que a rocha ainda tenha. A distância
mínima passou a ser medida entre as cascas, com um resto de céu preto entre
elas: a folga mínima em dois minutos de simulação subiu de **1,2 cm para
11 cm**. Os planetas também ficaram menores — sete corpos de meio metro num
quarto ficam ombro a ombro, e enxame apertado lê como aglomerado sólido.

### O sol, e o que ele muda

O que segurava o enxame era uma mola linear para o centro. Funcionava, mas
produzia movimento harmônico: todo mundo com o mesmo período, indo e voltando
pelo meio da sala. Não era um sistema solar, era um punhado de pêndulos.

Com uma estrela no centro a lei passa a ser a de verdade, **GM/r²**, e o
sistema ganha o que só ela dá: quem está perto corre, quem está longe
arrasta-se, as órbitas fecham em elipse, e as passagens rasantes acontecem
porque duas elipses se cruzam. Cada planeta nasce na velocidade circular do seu
raio — sorteá-la, como antes, dava órbitas que ora escapavam ora despencavam.

A luz passou a sair da estrela: o lado iluminado de cada planeta aponta para o
meio do sistema e a sombra cai para fora.

**O atrito teve de mudar junto.** O antigo frenava tudo por igual; contra uma
mola isso só acomodava o enxame, mas contra gravidade é fatal — frear é perder
momento angular, e perder momento angular é cair. Em noventa segundos de teste
os sete planetas espiralavam para dentro do sol. Amortecendo **só a componente
radial**, o momento angular se conserva por construção: a órbita não decai, ela
só arredonda, e o que o atrito come é a energia que os encontrões injetam.

### O buraco negro suga

A travessia só acontecia se o planeta passasse rente ao disco por acaso — e
como nada o puxava para lá, era um acidente raro que ninguém via. Agora o
buraco **puxa**: dentro do alcance de captura ele vence a gravidade da estrela,
e o planeta é visivelmente arrastado, acelerando, até sumir. E é **cuspido**
pelo outro: sem isso ele reaparecia boiando na boca do segundo buraco e era
sugado de volta, num vaivém sem fim.

A atração cresce com 1/d, não com 1/d² — que na boca do buraco dispara para o
infinito e faz o planeta atravessar a parede antes de o teste de travessia
rodar.

### Testes

`test-planetas.mjs` foi de 9 para 24 asserções. As novas cobrem a mola (chega,
chega atrasado, arremessa), o planeta na mão varrendo o enxame sem afundar
ninguém, a mão vazia como corpo, a sucção do buraco negro, e o sistema solar:
ninguém cai na estrela, todo mundo dá a volta, todos no mesmo sentido, e quem
está perto corre mais que quem está longe — a terceira lei de Kepler como
asserção.

Foi ela que pegou o bug que teria passado despercebido: o vetor radial do
amortecimento vinha de `_d`, que é reciclado dentro do laço de pares. Amortecer
na direção errada derrubava os planetas dentro do sol.

## v0.21.2 — Borboletas do tamanho de borboletas

Elas estavam com **um metro de envergadura**, e a causa é a troca de malha por
nuvem na v0.21.0.

A nuvem assada sai **normalizada**: o maior lado dela vale 1. A geometria
procedural que ela substituiu já vinha em metros, com uns doze centímetros de
ponta a ponta. Trocar uma pela outra sem reescalar multiplicou tudo por oito.

Agora a envergadura base é **12,5 cm** — uma monarca. Com a variação de tamanho
do enxame, o conjunto vai de 9,4 a 17,1 cm, que é a faixa real. A que sai do
casulo fica em 27,5 cm: maior que as outras, porque é a protagonista, mas não é
um planador.

### E o último bando de poliedros

Os vaga-lumes que circulam o corpo ainda eram icosaedros sólidos de um
centímetro e meio. A essa escala um poliedro não lê como luz — lê como cascalho
colorido flutuando em volta da pessoa.

É a mesma queixa que já tinha tirado os orbes de cena na v0.20.0 e as estrelas
da constelação junto. Este bando tinha escapado. Agora é um ponto cada.


## v0.21.1 — A borboleta parou de rodopiar

Dois erros no mesmo lugar, e o segundo é o que importa.

O **primeiro é o eixo**: no modelo assado o corpo corre em Z, e a orientação
alinhava o Y com a direção do voo. A borboleta voava de pé.

O **segundo é mais fundo**. `setFromUnitVectors` devolve o arco *mais curto*
entre dois vetores, e um arco curto não carrega nenhuma referência de cima — o
rolamento sobra livre. Conforme a direção varria o círculo do voo, ela rodopiava
sobre o próprio eixo. Era, literalmente, uma rotação sem gravidade.

Agora a pose é montada com o mundo como referência:

- o **rumo** vem do deslocamento horizontal
- a **subida** vira inclinação do nariz, não giro do corpo
- a **virada** vira inclinação lateral, que *persegue* o giro em vez de
  segui-lo de imediato — sem isso a inclinação vibra junto com o ruído do
  deslocamento

Medido em quinze segundos de voo: o componente vertical do "cima" nunca desce
de **0,917**. Ela inclina uns vinte e três graus no pior caso e nunca rola de
barriga para cima.

A frente do modelo é +Z, e isso não foi chutado: a envergadura cresce de 0,319
em z = −0,36 para 0,500 em z = +0,36, e asa dianteira é mais larga que abdômen.


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
