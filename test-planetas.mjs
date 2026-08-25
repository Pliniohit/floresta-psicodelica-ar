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

console.log(falhas
  ? `\n${falhas} falha(s) na física dos planetas.`
  : '\nTudo certo — os planetas se desviam, não se tocam, e atravessam.');
process.exit(falhas ? 1 : 0);
