# Passada de curadoria — Raízes Cósmicas

Lista de trabalho da sessão em que Cris deixou a experiência sendo lapidada
enquanto dormia. Cada item liga o pedido ao commit, ou marca o que falta.

## Diretriz de design (as regras que guiam tudo)

- **A obra é para apreciar as esculturas 3D.** Menos elementos, cena limpa.
- **A árvore-mãe é o eixo, imóvel e sólida.** Não deita, não desvia, não se
  mexe. Você contorna a escultura; ela não desvia de você.
- **Sua presença é percebida por todos os outros corpos** — a vegetação cede,
  os planetas desviam — menos a árvore.
- **Nada atravessa seu corpo.** Mãos e torso empurram os planetas.
- **A navegação é por elementos-chave**: o casulo (sobe), a raiz (desce),
  ampliar um planeta com as duas mãos (entra). Sem menus flutuando na mão.
- **O espaço é 3×3 m**, e os pontos de interação caem sempre no mesmo lugar.

## Feito e no GitHub

| Pedido | Como | Commit |
| --- | --- | --- |
| Cores da luz por cena (Crisálida azul, Olho laranja incandescente) | `corLuz` por cena | b22b535, 721f6cd |
| Sol mapeado na lâmpada | `space.fixarSolEm()` no pólo do Olho | b22b535 |
| Esqueleto das mãos escondido | `?maos=1` religa | b22b535 |
| Buraco negro (disco) escondido | portais mantidos, `?buracos=1` | 3fda2a0 |
| Mapas se misturando | `warp` normalizado em `montarCena` | 721f6cd |
| Travessia limpa na operação | `travessiaLimpa()` | 00caabd |
| Modo galeria (silencia narração) | `?ui=1` religa | f71bc9b |
| Pontos de interação ancorados no 3×3 | hub nasce em `forest.position` | 3b92c20 |
| Trava anti-salto na âncora | delta > 0,5 m re-baseia | ebdd1bc |
| Menos elementos / cogumelos removidos | densidades reduzidas | ebdd1bc |
| Grama menor e mais volumosa | lâmina 0,26×0,045 | ebdd1bc |
| Partículas menores/menos | esporos 900→480 | ebdd1bc |
| Árvore-mãe não deita | `trample` fora do `barkMaterial` | 83a589c |
| Menu de poliedros no pulso removido | `?menu=1` religa | 83a589c |
| Asteroides no espaço (bolas de futebol) | cinturão em InstancedMesh | dd84988 |
| Paredes limpas (grades removidas) | casca sem padrões | 19b4da1 |
| Parede de cristal líquido iridescente, interativa | `wallMaterial` novo + `uDedos` | 1554233 |
| Nada atravessa o corpo (torso empurra planetas) | `space.empurrar('corpo')` | 96c70ad |

Triângulos na cena: 4.331 → 3.011.

## A fazer COM Cris presente (precisa de teste no headset)

- [ ] **Planetas orbitam o sol e depois passam a te orbitar.** Tentei migrar o
  centro de gravidade da estrela para o peito, mas isso desestabiliza a física
  calibrada dos planetas (as cercas R_MIN/R_MAX e a sucção assumem centro fixo)
  — 4 testes quebraram. Revertido. A física dos planetas é delicada demais para
  mexer às cegas; fazer com Cris testando ao vivo. Caminho provável: nascer o
  sistema com o baricentro na altura da estrela e descê-lo devagar, ajustando
  as cercas junto.
- [ ] **Árvore sólida contra o corpo físico.** Em WebXR AR a locomoção é o
  corpo real — o app não pode barrar a câmera. A árvore já é imóvel e não deita;
  se Cris quiser um sinal ao atravessá-la (aviso visual/sonoro), dá para fazer.

## A confirmar com Cris (de headset)

- A **parede de cristal líquido** ficou como imaginava? Toque com o dedo para
  ver os anéis. `?paredes=0` deixa a parede nua se preferir.
- Modo galeria silencioso demais? Algum aviso faz falta?
- A **semente cristalina** que brota na mão aberta — mantida, é o gesto de
  plantar. Confirmar se fica.
- "Pinçar no vazio faz a cena escorregar" — a trava anti-salto da âncora deve
  ter resolvido; confirmar.
