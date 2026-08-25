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
