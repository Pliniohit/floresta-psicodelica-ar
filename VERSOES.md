# Histórico de versões — Raízes Cósmicas

Cada versão é um ponto fechado da obra: uma **tag** no git (restaurável com
`git checkout vX.Y.Z`) e, das v0.28.0 em diante, um **snapshot `.zip`** guardado
em `..\raizes-backups\` — um backup que se abre e roda sem git.

## Como criar uma nova versão

Depois de commitar tudo, um comando só faz a tag, o zip e o push:

```powershell
.\versao.ps1 0.29.0 "descrição curta da versão"
```

Depois anote a linha nova aqui em cima da tabela.

## Como voltar a uma versão

- **Ver como estava** (sem mexer no atual): `git checkout v0.28.0`
  (para voltar ao presente: `git checkout main`).
- **Restaurar de um zip**: abra o `.zip` correspondente em
  `..\raizes-backups\` — é o código inteiro daquela versão.

## Versões

| Versão | Data | O que mudou | Snapshot .zip |
| --- | --- | --- | --- |
| **v0.28.0** | 2026-09-06 | 5 planetas nomeados (terra, fogo, água, ar, amor), asteroides soltos e miúdos, sol mais achável, shader das paredes corrigido | ✅ |
| v0.27.0 | — | A árvore de volta ao código, e sumindo no espaço | — |
| v0.26.0 | — | Raízes Cósmicas: o eixo, e a árvore como ela é | — |
| v0.25.0 | — | A árvore-mãe, e o app cabendo no headset | — |
| v0.24.1 | — | O contorno preto em volta de tudo que brilha | — |
| v0.24.0 | — | O portal, e o casulo indo para o lugar certo | — |
| v0.23.0 | — | Universo Encantado, e a trilha entrou | — |
| v0.22.1 | — | Borboletas coloridas, partículas pequenas | — |
| v0.22.0 | — | Um sistema solar de verdade | — |
| v0.21.2 | — | Borboletas do tamanho de borboletas | — |
| v0.21.0 | — | A floresta virou nuvem de pontos | — |
| v0.20.0 | — | Vaga-lumes em pontos; fora os poliedros flutuantes | — |
| v0.19.0 | — | Aquarela como interruptor, e o céu começa no teto | — |
| v0.18.0 | — | A jornada: sete cenários em cadeia | — |
| v0.17.0 | — | Floresta bioluminescente | — |
| v0.16.0 | — | Teto aberto, árvore de galhos com frutos | — |
| v0.15.0 | — | O cômodo veste cada mundo, e tudo se alcança de longe | — |

> As versões anteriores à v0.28.0 existem como tags/commits no git; o snapshot
> `.zip` passou a ser gerado a partir da v0.28.0. Para arquivar uma versão
> antiga como zip: `git archive --format=zip -o ..\raizes-backups\vX.Y.Z.zip vX.Y.Z`.
