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

## v0.16.0 — Teto aberto, árvore de galhos com frutos, e lugar para a trilha

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
