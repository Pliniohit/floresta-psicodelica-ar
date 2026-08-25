# Trilha

Coloque aqui o arquivo da trilha, com este nome exato:

```
assets/trilha.mp3
```

Se ele existir, é carregado, posto em loop e entra em oito segundos. Outro
formato serve desde que o navegador decodifique — renomeie para `.mp3` ou
mude a constante `TRILHA` em `src/audio.js`. Um caminho só, e não uma lista
de extensões tentadas em sequência, porque cada tentativa que falha vira uma
linha de 404 no console e assusta sem motivo.
O drone gerado recua para um leito quase inaudível, e os sinos das interações
continuam por cima — eles são resposta ao gesto, não música.

**Sem o arquivo nada quebra.** A ausência apenas significa que o drone gerado
em tempo real continua sendo a trilha, como sempre foi.

## Formato

MP3 estéreo serve. O arquivo é decodificado inteiro na memória, então vale
manter abaixo de uns 10 MB — no Quest, um MP3 de cinco minutos a 192 kbps dá
cerca de 7 MB e decodifica em pouco mais de um segundo.

O loop é direto, sem crossfade: uma trilha que já fecha em si mesma emenda
sem costura. Se a sua tiver cauda de reverb no fim, corte-a no editor antes.

## Por mundo

A trilha passa por um passa-baixa que acompanha o bioma: limpa na terra,
áspera no fogo, submersa na água. Isso é feito em cima do arquivo, sem
segunda versão — não é preciso exportar três trilhas.
