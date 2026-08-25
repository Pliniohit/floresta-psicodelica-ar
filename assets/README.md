# Trilha

Aqui mora a trilha da experiência. Hoje ela é **"Birth of the Mbira"**, feita
no Suno, em duas codificações do mesmo laço:

```
assets/trilha.ogg   Opus 96 kbps   3,0 MB   ← preferida
assets/trilha.mp3   MP3 128 kbps   3,6 MB   ← reserva
```

`src/audio.js` tenta nesta ordem e fica com a primeira que decodificar. Ela
entra em oito segundos — uma trilha que começa de estalo denuncia o
carregamento; entrando devagar, parece ter estado ali o tempo todo.

O drone gerado recua para um leito quase inaudível, e os sinos das interações
continuam por cima — eles são resposta ao gesto, não música.

**Sem os arquivos nada quebra.** A ausência apenas significa que o drone
gerado em tempo real volta a ser a trilha, como era antes.

## Por que Opus primeiro

Não é por tamanho. A trilha toca em laço, e **mp3 não fecha laço**: o formato
guarda um atraso de codificação e um enchimento no fim, e o decodificador
entrega os dois junto com o áudio. São alguns milissegundos de silêncio
grudados nas duas pontas — em quatro minutos de música ambiente, um soluço
audível a cada volta. O Opus registra no contêiner quantas amostras descartar,
e o navegador devolve o buffer exato.

## Como o laço foi montado

O original tinha 3 min 59 s, com **0,94 s de silêncio no começo e 0,51 s no
fim**: 1,45 s de ar parado em cada volta. O silêncio foi cortado, e os três
segundos finais foram sobrepostos aos três iniciais em fusão cruzada — a
cauda da volta anterior ainda soa enquanto a próxima entra, e a emenda deixa
de existir. O laço resultante tem 3 min 54,8 s.

Para refazer a partir de um novo original:

```bash
ffmpeg -i original.wav -filter_complex "
[0:a]atrim=start=INICIO:end=FIM,asetpts=N/SR/TB[x];
[x]asplit=2[x1][x2];
[x1]atrim=0:DUR_MENOS_3,asetpts=N/SR/TB,afade=t=in:st=0:d=3[a];
[x2]atrim=DUR_MENOS_3:DUR,asetpts=N/SR/TB,afade=t=out:st=0:d=3,apad=whole_dur=DUR_MENOS_3[b];
[a][b]amix=inputs=2:normalize=0[m]" -map "[m]" loop.wav
ffmpeg -i loop.wav -c:a libopus -b:a 96k -vbr on -application audio trilha.ogg
ffmpeg -i loop.wav -c:a libmp3lame -b:a 128k trilha.mp3
```

`INICIO` e `FIM` saem de
`ffmpeg -i original.wav -af silencedetect=noise=-45dB:d=0.2 -f null -`.

## Por mundo

A trilha passa por um passa-baixa que acompanha o cenário: limpa na terra,
áspera no fogo, submersa na água. Isso é feito em cima do arquivo, sem segunda
versão — não é preciso exportar três trilhas.
