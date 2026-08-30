# Créditos

Quase tudo neste projeto é gerado por código: não há textura baixada, não há
CDN, não há dependência. As exceções estão todas aqui.

## Árvore-mãe — malha reduzida e textura

`src/malhas/arvoremae.js` e `assets/arvoremae.jpg` são
`tree wit vine 3.glb` ("old tree with vine — 3d model free"), um modelo
fotogramétrico de 2,1 milhões de triângulos e 97 MB fornecido pelo autor do
projeto, reduzido a 54 mil triângulos por `scripts/assar-malha.mjs` e com a
textura de cor base reescalada para 2048 px. O arquivo original **não** faz
parte do repositório.

> **PENDENTE — origem e licença.** O nome da pasta diz "free", e o formato
> (pasta `source/` + pasta `textures/`) é o de um download do **Sketchfab**.
> A licença livre mais comum lá é **CC Attribution**, que exige creditar o
> autor pelo nome, com título e endereço — e uma nuvem de pontos extraída do
> modelo continua sendo **obra derivada**, então a exigência a acompanha.
>
> Aqui a exigência é mais forte que no caso da borboleta: não é só a forma
> reduzida, é a **textura fotografada** viajando junto, no repositório.
>
> Preencher: autor, título, endereço e licença. Se o modelo for "somente uso
> pessoal" ou proibir derivados, ele precisa sair — e a árvore volta a ser
> gerada por código, como o resto da vegetação.

## Borboleta — nuvem de pontos

`src/nuvens/borboleta.js` guarda 2.600 coordenadas amostradas na superfície de
`animated_butterfly.glb`, também fornecido pelo autor do projeto e também
ausente do repositório.

> **PENDENTE — origem e licença.** Mesma situação da árvore. Preencher aqui:
> autor, título, endereço e licença — ou trocar por uma forma gerada por
> código, o que dispensa o crédito.
>
> O estudo de partículas que originou esta direção já levantava exatamente
> este ponto sobre os modelos de pantera, cavalo, águia e borboleta.

## Trilha

`assets/trilha.ogg` e `assets/trilha.mp3` são "Birth of the Mbira", feita no
Suno pelo autor do projeto. Ver `assets/README.md` para como o laço foi
montado.

## Animação

`assets/animacao.mp4` é "Odada Ô", obra do autor do projeto, recodificada para
1280 px de largura para caber no repositório e abrir no headset. É ela que
passa no portal pendurado na parede.
