// Verifica pegar / carregar / soltar sem precisar de headset.
// A pinça em si vem do three.js; o que testamos é a decisão da floresta:
// o que está ao alcance, e se o lugar onde você soltou serve.
import { Vector2, Vector3, Quaternion } from './vendor/three/three.module.min.js';
import { Forest } from './src/forest.js';
import { fallbackRoom } from './src/room.js';

let failures = 0;
const check = (ok, label, detail = '') => {
  if (!ok) failures++;
  console.log(`${ok ? '  ok  ' : ' FALHA'} ${label}${detail ? '  — ' + detail : ''}`);
};

/**
 * Avança até as animações acabarem, em vez de contar frames. Contar frames
 * amarra o teste à duração dos tweens, e ele quebra a cada ajuste de ritmo.
 */
const assentar = (f, limite = 20) => {
  let t = 0;
  while (f.growing.length && t < limite) { f.update(1 / 60); t += 1 / 60; }
  f.update(1 / 60);
  return t;
};

const build = () => {
  const f = new Forest();
  f.applyRoom({ footprint: fallbackRoom(new Vector2(0, 0), 5, 4), obstacles: [], floorY: 0 });
  return f;
};

const posOf = (set, i) => {
  const p = new Vector3(), q = new Quaternion(), s = new Vector3();
  set.read(i, p, q, s);
  return { p, q, s };
};

// ---- alcance --------------------------------------------------------------
{
  const f = build();
  const { p, s } = posOf(f.mushrooms, 0);
  const atCap = new Vector3(p.x, p.y + 0.6 * s.y, p.z);

  const here = f.pick(atCap);
  check(here?.kind === 'mushroom' && here.idx === 0,
    'cogumelo é pego na altura do chapéu');

  // A floresta é densa: a 1,5 m existem outras plantas legitimamente ao
  // alcance. O que importa é que ESTE cogumelo saiu do alcance.
  const far = f.pick(new Vector3(p.x + 1.5, 0.6, p.z));
  check(!(far?.set === f.mushrooms && far.idx === 0),
    'o mesmo cogumelo não é pego a 1,5 m de distância');

  const trunk = posOf(f.species[0].set, 0);
  check(f.pick(new Vector3(trunk.p.x, 1.2, trunk.p.z))?.kind === 'tree',
    'árvore é pega pelo tronco, na altura do peito');

  // No rés do chão a mão deve encontrar o que está no chão, nunca o tronco —
  // senão pegar um cogumelo arrancaria a árvore junto.
  check(f.pick(new Vector3(trunk.p.x, 0.05, trunk.p.z))?.kind !== 'tree',
    'mão no rés do chão não agarra o tronco');
}

// ---- carregar e replantar em lugar válido ---------------------------------
{
  const f = build();
  const target = f.pick(((m) => new Vector3(m.p.x, m.p.y + 0.6 * m.s.y, m.p.z))(posOf(f.mushrooms, 0)));
  const home = posOf(target.set, target.idx);
  const handle = f.lift(target);

  const hand = new Vector3(0.2, 1.3, 0.4);
  f.carry(handle, hand, 0.5);
  const held = posOf(target.set, target.idx);
  check(held.p.distanceTo(hand) < 1e-6, 'o objeto segue a mão');
  check(held.s.x < home.s.x * 0.6, 'encolhe enquanto está na mão',
    `${home.s.x.toFixed(2)} -> ${held.s.x.toFixed(2)}`);

  const destino = new Vector3(-1.6, 1.0, 1.2);
  check(f.drop(handle, destino) === 'plantado', 'solto dentro do cômodo: replanta');
  assentar(f);
  const final = posOf(target.set, target.idx);
  check(Math.hypot(final.p.x - destino.x, final.p.z - destino.z) < 0.02,
    'termina no ponto onde foi solto');
  check(Math.abs(final.s.x - home.s.x) < 0.02, 'recupera o tamanho original');
  check(final.p.y < 1e-6, 'volta a assentar no chão');
}

// ---- soltar fora do cômodo devolve ao lugar -------------------------------
{
  const f = build();
  const target = f.pick(((m) => new Vector3(m.p.x, m.p.y + 0.6 * m.s.y, m.p.z))(posOf(f.mushrooms, 0)));
  const home = posOf(target.set, target.idx);
  const handle = f.lift(target);
  f.carry(handle, new Vector3(0, 1.4, 0));

  check(f.drop(handle, new Vector3(20, 1.0, 20)) === 'devolvido',
    'solto fora do cômodo: recusa');
  assentar(f);
  const final = posOf(target.set, target.idx);
  check(final.p.distanceTo(home.p) < 0.02, 'volta exatamente para onde estava');
}

// ---- árvore não pode ser solta em cima de outra ---------------------------
{
  const f = build();
  const a = posOf(f.species[0].set, 0);
  const b = posOf(f.species[1].set, 0);
  const handle = f.lift(f.pick(new Vector3(a.p.x, 1.2, a.p.z)));
  f.carry(handle, new Vector3(b.p.x, 1.4, b.p.z));

  check(f.drop(handle, new Vector3(b.p.x + 0.2, 1.0, b.p.z)) === 'devolvido',
    'árvore solta colada em outra: recusa e volta');
  assentar(f);
  check(posOf(f.species[0].set, 0).p.distanceTo(a.p) < 0.02, 'a árvore volta ao lugar');
}

// ---- o que está na mão não pode ser pego de novo --------------------------
{
  const f = build();
  const m = posOf(f.mushrooms, 0);
  const at = new Vector3(m.p.x, m.p.y + 0.6 * m.s.y, m.p.z);
  const handle = f.lift(f.pick(at));
  f.carry(handle, new Vector3(0, 1.2, 0));
  const again = f.pick(new Vector3(0, 1.2, 0));
  check(!again || !(again.set === handle.set && again.idx === handle.idx),
    'a outra mão não rouba o que já está na primeira');
}

console.log(`\n${failures === 0 ? 'Tudo certo — pegar, carregar e soltar se comportam.' : failures + ' verificação(ões) falharam.'}`);
process.exit(failures ? 1 : 0);
