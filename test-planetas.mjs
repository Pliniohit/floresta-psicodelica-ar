import { Vector3 } from './vendor/three/three.module.min.js';
import { Space } from './src/space.js';

/**
 * OS PLANETAS NÃO PODEM SE TOCAR.
 *
 * É uma invariante, não um efeito: se dois se atravessam, a cena vira duas
 * esferas ocupando o mesmo lugar e a ilusão de que são sólidos acaba. Como
 * agora a trajetória é resultado de força e não de fórmula, ela pode divergir
 * — e o único jeito honesto de saber é rodar a simulação.
 */

let falhas = 0;
const ok = (cond, msg, extra = '') => {
  console.log(`  ${cond ? 'ok  ' : 'FALHA'}   ${msg}${extra ? `  ${extra}` : ''}`);
  if (!cond) falhas++;
};

const space = new Space();
space.visible = true;

/** Menor folga entre superfícies, em metros. Negativa = interpenetração. */
function menorFolga() {
  let pior = Infinity, par = null;
  for (let i = 0; i < space.planets.length; i++) {
    for (let j = i + 1; j < space.planets.length; j++) {
      const a = space.planets[i], b = space.planets[j];
      const d = a.position.distanceTo(b.position);
      const folga = d - (a.userData.raio * a.scale.x + b.userData.raio * b.scale.x);
      if (folga < pior) { pior = folga; par = [i, j]; }
    }
  }
  return { folga: pior, par };
}

// --- 1. dois minutos de simulação, a 60 e a 30 quadros por segundo --------
for (const fps of [60, 30]) {
  // Recomeça do zero para cada cadência.
  const s = new Space();
  s.visible = true;
  const dt = 1 / fps;
  let pior = Infinity, longe = 0, alto = 0;
  for (let n = 0; n < 120 * fps; n++) {
    s.update(n * dt, dt);
    for (const g of s.planets) {
      longe = Math.max(longe, Math.hypot(g.position.x, g.position.z));
      alto = Math.max(alto, g.position.y);
      if (!Number.isFinite(g.position.x + g.position.y + g.position.z)) {
        falhas++; console.log(' FALHA   posição virou NaN'); n = 1e9; break;
      }
    }
    let p = Infinity;
    for (let i = 0; i < s.planets.length; i++) {
      for (let j = i + 1; j < s.planets.length; j++) {
        const a = s.planets[i], b = s.planets[j];
        p = Math.min(p, a.position.distanceTo(b.position)
          - (a.userData.raio + b.userData.raio));
      }
    }
    pior = Math.min(pior, p);
  }
  ok(pior > 0, `${fps} fps · 2 min · nenhum par se tocou`,
    `folga mínima ${pior.toFixed(3)} m`);
  ok(longe < 4.0, `${fps} fps · o enxame não escapou da sala`,
    `mais longe ${longe.toFixed(2)} m do centro`);
  ok(alto <= 2.31, `${fps} fps · ninguém subiu além do alcance`,
    `mais alto ${alto.toFixed(2)} m`);
}

// --- 2. o par de buracos negros é mesmo um portal ------------------------
{
  const s = new Space();
  s.visible = true;
  s.setPortais([
    { pos: new Vector3(-2.5, 1.3, 0), normal: new Vector3(1, 0, 0), raio: 0.7 },
    { pos: new Vector3(2.5, 1.3, 0), normal: new Vector3(-1, 0, 0), raio: 0.7 },
  ]);
  const p = s.planets[0];
  // Põe um planeta exatamente na boca da entrada, indo para dentro dela.
  p.position.set(-2.5, 1.3, 0);
  p.userData.vel.set(-0.6, 0, 0);
  s.update(0, 1 / 60);
  ok(p.position.x > 1.5, 'entrou por um buraco e saiu pelo outro',
    `x ${p.position.x.toFixed(2)}`);
  ok(p.userData.vel.x < 0, 'e sai VINDO da parede, não indo contra ela',
    `vx ${p.userData.vel.x.toFixed(2)}`);
}

// --- 3. sem par de portais ninguém atravessa nada ------------------------
{
  const s = new Space();
  s.visible = true;
  s.setPortais([{ pos: new Vector3(-2.5, 1.3, 0), normal: new Vector3(1, 0, 0), raio: 0.7 }]);
  const p = s.planets[0];
  p.position.set(-2.5, 1.3, 0);
  p.userData.vel.set(0, 0, 0);
  s.update(0, 1 / 60);
  ok(p.position.x < 0, 'um buraco sozinho não teleporta ninguém',
    `x ${p.position.x.toFixed(2)}`);
}

// --- 4. PEGAR TEM QUE SER FÍSICO -----------------------------------------
// A mão puxa por mola, então três coisas precisam ser verdade ao mesmo tempo:
// o planeta ACOMPANHA a mão (senão pegar não funciona), ele chega ATRASADO
// (é o atraso que se lê como peso), e ele continua sendo um corpo — não
// atravessa ninguém e sai com a velocidade da mão quando é solto.
{
  const s = new Space();
  s.visible = true;
  const dt = 1 / 72;
  const alvo = new Vector3();
  const p = s.planets[0];
  // Sozinho: aqui se mede a MOLA. Com os outros por perto o que se mediria
  // era a colisão, que é assunto do teste seguinte.
  s.planets.length = 1;
  s.lift(p);

  // A mão leva o planeta num arco de meio metro, em dois segundos, partindo
  // de onde ele já está — um salto no primeiro quadro mediria o degrau, não
  // o acompanhamento.
  let atraso = 0;
  const inicio = p.position.clone();
  alvo.copy(inicio);
  for (let n = 0; n < 144; n++) {
    const u = n / 144;
    alvo.set(inicio.x + Math.sin(u * Math.PI) * 0.5, inicio.y, inicio.z + u * 0.4);
    s.carry(p, s.localToWorld(alvo.clone()));
    s.update(n * dt, dt);
    atraso = Math.max(atraso, p.position.distanceTo(alvo));
  }
  const parado = p.position.distanceTo(alvo);
  ok(parado < 0.02, 'o planeta chega onde a mão está', `resto ${parado.toFixed(3)} m`);
  ok(atraso > 0.003 && atraso < 0.12, 'e chega ATRASADO: é o peso na palma',
    `atraso máximo ${(atraso * 100).toFixed(1)} cm`);

  // Solto em movimento, ele leva a velocidade da mão junto.
  for (let n = 0; n < 12; n++) {
    alvo.x += 0.9 * dt;
    s.carry(p, s.localToWorld(alvo.clone()));
    s.update(n * dt, dt);
  }
  s.drop(p);
  const v = p.userData.vel.length();
  ok(v > 0.25, 'solto em movimento, é ARREMESSADO', `${v.toFixed(2)} m/s`);
  ok(v <= 1.71, 'mas nunca rápido a ponto de cruzar a sala', `${v.toFixed(2)} m/s`);
}

// --- 5. o planeta na mão continua empurrando os outros -------------------
{
  const s = new Space();
  s.visible = true;
  const dt = 1 / 72;
  const p = s.planets[0];
  s.lift(p);
  // Passa o planeta pela nuvem inteira, atravessando o centro.
  let pior = Infinity;
  for (let n = 0; n < 300; n++) {
    const u = n / 300;
    s.carry(p, s.localToWorld(new Vector3(-2 + u * 4, 1.25, 0)));
    s.update(n * dt, dt);
    for (let i = 0; i < s.planets.length; i++) {
      for (let j = i + 1; j < s.planets.length; j++) {
        const a = s.planets[i], b = s.planets[j];
        pior = Math.min(pior, a.position.distanceTo(b.position)
          - (a.userData.raio + b.userData.raio));
      }
    }
  }
  ok(pior > -0.005, 'varrer o enxame com um planeta na mão não afunda ninguém',
    `folga mínima ${pior.toFixed(3)} m`);
}

// --- 6. a mão vazia também é um corpo ------------------------------------
{
  const s = new Space();
  s.visible = true;
  const dt = 1 / 72;
  const p = s.planets[0];
  p.userData.vel.set(0, 0, 0);
  // A mão vem de fora e atravessa exatamente onde o planeta está.
  const alvo = p.position.clone();
  const antes = p.position.clone();
  let tocou = false;
  for (let n = 0; n < 60; n++) {
    const u = n / 60;
    const mao = new Vector3(alvo.x - 0.7 + u * 1.4, alvo.y, alvo.z);
    if (s.empurrar('teste', s.localToWorld(mao.clone()), 0.075, dt)) tocou = true;
    s.update(n * dt, dt);
  }
  ok(tocou, 'a mão vazia encosta no planeta');
  ok(p.position.distanceTo(antes) > 0.05, 'e o afasta de onde estava',
    `${(p.position.distanceTo(antes) * 100).toFixed(0)} cm`);
  ok(Number.isFinite(p.position.x + p.position.y + p.position.z),
    'sem explodir a simulação');
}

// --- 7. O BURACO NEGRO SUGA ---------------------------------------------
// Antes a travessia só acontecia se o planeta passasse rente ao disco por
// acaso, e por isso quase nunca acontecia. Agora ele é PUXADO: dentro do
// alcance de captura não há órbita que o segure.
{
  const s = new Space();
  s.visible = true;
  s.setPortais([
    { pos: new Vector3(-2.4, 1.3, 0), normal: new Vector3(1, 0, 0), raio: 0.5 },
    { pos: new Vector3(2.4, 1.3, 0), normal: new Vector3(-1, 0, 0), raio: 0.5 },
  ]);
  const p = s.planets[0];
  // Parado, à beira do alcance: só a sucção pode levá-lo lá.
  p.position.set(-1.35, 1.3, 0);
  p.userData.vel.set(0, 0, 0);

  const dt = 1 / 72;
  let atravessou = 0, saiuRapido = 0;
  for (let n = 0; n < 72 * 8; n++) {
    const antes = p.position.x;
    s.update(n * dt, dt);
    if (p.position.x - antes > 2.0) {          // pulou de um lado ao outro
      atravessou++;
      saiuRapido = Math.max(saiuRapido, p.userData.vel.length());
    }
  }
  ok(atravessou >= 1, 'parado à beira do buraco, ele é sugado', `${atravessou}x em 8 s`);
  ok(saiuRapido > 0.7, 'e é CUSPIDO pelo outro, não largado ali',
    `${saiuRapido.toFixed(2)} m/s`);
  ok(atravessou < 20, 'sem virar vaivém sem fim entre os dois',
    `${atravessou} travessias`);
}

// --- 8. É UM SISTEMA SOLAR ----------------------------------------------
// Com uma estrela no centro, três coisas passam a ter de valer: ninguém cai
// nela, todo mundo dá a volta (órbita, não pêndulo), e quem está perto anda
// mais depressa que quem está longe — a terceira lei, que é o que distingue
// gravidade de elástico.
{
  const s = new Space();
  s.visible = true;
  const dt = 1 / 60;
  const volta = s.planets.map((g) => ({ g, ang: 0, r: 0, n: 0 }));
  let maisPerto = Infinity;

  for (let n = 0; n < 60 * 90; n++) {
    const antes = volta.map((o) => Math.atan2(o.g.position.z, o.g.position.x));
    s.update(n * dt, dt);
    for (let i = 0; i < volta.length; i++) {
      const o = volta[i];
      let d = Math.atan2(o.g.position.z, o.g.position.x) - antes[i];
      if (d > Math.PI) d -= 2 * Math.PI;
      if (d < -Math.PI) d += 2 * Math.PI;
      o.ang += d;
      o.r += Math.hypot(o.g.position.x, o.g.position.z);
      o.n++;
      maisPerto = Math.min(maisPerto,
        Math.hypot(o.g.position.x, o.g.position.y - 1.25, o.g.position.z)
        - o.g.userData.raio);
    }
  }

  ok(maisPerto > 0.15, 'nenhum planeta cai dentro da estrela',
    `superfície mais próxima ${maisPerto.toFixed(2)} m do centro`);

  const voltas = volta.map((o) => Math.abs(o.ang) / (2 * Math.PI));
  ok(Math.min(...voltas) > 1, 'em 90 s todo mundo deu ao menos uma volta',
    `${Math.min(...voltas).toFixed(1)} a ${Math.max(...voltas).toFixed(1)} voltas`);
  ok(new Set(volta.map((o) => Math.sign(o.ang))).size === 1,
    'e todos no mesmo sentido, como um disco que se condensou');

  // Kepler: ordenados por raio médio, a velocidade angular tem de cair.
  const porRaio = [...volta].sort((a, b) => a.r / a.n - b.r / b.n);
  const w = porRaio.map((o) => Math.abs(o.ang) / 90);
  const interno = w[0], externo = w[w.length - 1];
  ok(interno > externo * 1.5, 'quem está perto corre mais que quem está longe',
    `${interno.toFixed(2)} contra ${externo.toFixed(2)} rad/s`);
}

console.log(falhas
  ? `\n${falhas} falha(s) na física dos planetas.`
  : '\nTudo certo — os planetas se desviam, não se tocam, e atravessam.');
process.exit(falhas ? 1 : 0);
