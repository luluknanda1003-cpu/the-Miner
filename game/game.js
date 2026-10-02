// ================= LOGIKA PERMAINAN: THE MINER (MINERAL TOWN) =================
// File ini TIDAK mengatur dasbor/start screen. Variabel `gameStarted` dan
// `window.selectedCharacter` didefinisikan/diisi di dashboard.js.
// onGameStart(character) dipanggil oleh dashboard.js saat tombol MULAI ditekan.
//
// Mengikuti mekanisme_game.txt:
// - 3 level dunia: permukaan (lvl1), gua (lvl2), gua dalam (lvl3), dihubungkan pintu
// - 2 karakter pemain: Aron & Junet (dipilih di dashboard)
// - 2 NPC pedagang: penjual alat & makanan, pembeli ore
// - nyawa 10 hp, inventory tetap terbawa antar level ("keep inventory")
// - blok, beliung, mob, dan harga mengikuti angka-angka pada file txt
//
// ==== UPDATE "BOS AKHIR" ====
// - Bos di Gua Dalam (Lvl 3) sekarang jauh lebih besar & kuat, dengan sprite
//   sendiri (bukan cuma tikus yang diperbesar) supaya terasa seperti bos akhir.
// - Ruang bos digali lebih luas supaya ada tempat bertarung yang layak.
// - Mengalahkan bos = ENDING permainan: layar "TAMAT" muncul, dan karakter
//   pemain ter-upgrade otomatis jadi wujud "Legendaris" (emas, bercahaya,
//   ada mahkota & aura) sebagai hadiah, lalu pemain tetap bisa lanjut main.

const TILE = 24;
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const VIEW_W = canvas.width;
const VIEW_H = canvas.height;

// ================= TIPE BLOK =================
const AIR = 0, DIRT = 1, STONE = 2, GRASS = 3, COAL = 4, IRON = 5, GOLD = 6,
      BEDROCK = 7, WOOD = 8, LEAF = 9, DEEPSTONE = 10, DIAMOND = 11;

const BLOCK_COLOR = {
  [DIRT]: "#8b5a2b", [STONE]: "#7d7d7d", [GRASS]: "#4caf50", [COAL]: "#2b2b2b",
  [IRON]: "#c68b59", [GOLD]: "#ffd700",
  // FIX BLOK PALING BAWAH TAK TERLIHAT: warna BEDROCK sebelumnya nyaris hitam
  // (#1c1c1c), nyaris sama dengan warna kabut gelap gua, jadi menyatu dan tak
  // kelihatan. Dibuat lebih terang & kontras (abu kebiruan) supaya pembatas
  // dasar dunia selalu jelas dibedakan dari kabut/latar.
  [BEDROCK]: "#565a66",
  [WOOD]: "#6b4423", [LEAF]: "#3fae46", [DEEPSTONE]: "#4a4a58", [DIAMOND]: "#7fe6e6",
};
const BLOCK_NAME = {
  [DIRT]: "Tanah", [STONE]: "Batu", [COAL]: "Batu Bara", [IRON]: "Besi", [GOLD]: "Emas",
  [WOOD]: "Kayu", [LEAF]: "Daun", [DEEPSTONE]: "Batu Gua Dalam", [DIAMOND]: "Diamond",
};
// hp blok, persis sesuai mekanisme_game.txt (durability block: jangan tampilkan hp untuk blok)
const BLOCK_HP = {
  [DIRT]: 1, [GRASS]: 1, [WOOD]: 3, [LEAF]: 1,
  [STONE]: 5, [COAL]: 6, [IRON]: 8, [GOLD]: 5, [DEEPSTONE]: 8, [DIAMOND]: 10,
};
// tier minimum beliung yang dibutuhkan untuk menambang blok ini (indeks sama dgn PICKAXE_*)
// FIX BUG 1 (txt): beliung kayu (awal) -> tanah/kayu/daun/batu/coal saja.
// beliung batu -> tambahan besi. beliung besi -> semua blok (emas, diamond, batu gua dalam).
const BLOCK_TIER = {
  [DIRT]: 0, [GRASS]: 0, [WOOD]: 0, [LEAF]: 0, [STONE]: 0, [COAL]: 0,
  [IRON]: 1, [GOLD]: 2, [DEEPSTONE]: 2, [DIAMOND]: 2,
};

function tileHash(cx, cy, salt) {
  let h = (cx * 374761393 + cy * 668265263 + salt * 987651) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  h = h ^ (h >>> 16);
  return ((h >>> 0) % 1000) / 1000;
}

// ================= BELIUNG (PICKAXE) =================
// FIX BUG 1 (txt): pemain SUDAH mendapat beliung kayu sejak spawn (bukan tangan kosong).
// Urutan: kayu (awal) -> batu -> besi -> emas -> diamond -> secret.
const PICKAXE_NAMES = ["Beliung Kayu", "Beliung Batu", "Beliung Besi", "Beliung Emas", "Beliung Diamond", "Secret Pix Axe"];
const PICKAXE_DAMAGE = [1, 2, 3, 5, 7, 10]; // dari txt: kayu1, batu2, besi3, emas5, diamond7, secret10
const MINE_TICK = 0.35; // detik antar "ayunan" beliung saat menahan klik kiri

// resep beli di penjual: { kayu, batu, besi, emas, diamond, koin }
const PICKAXE_RECIPE = {
  1: { [WOOD]: 3, [STONE]: 5, coin: 3 },               // beliung batu
  2: { [WOOD]: 3, [STONE]: 1, [IRON]: 3, coin: 5 },    // beliung besi
  3: { [WOOD]: 3, [IRON]: 2, [GOLD]: 3, coin: 10 },    // beliung emas
  4: { [WOOD]: 3, [GOLD]: 2, [DIAMOND]: 5, coin: 25 }, // beliung diamond
};
const FOOD_COST = 2;   // koin, dari txt "makanan (2 koin)"
const FOOD_HEAL = 3;   // asumsi jumlah HP yang dipulihkan makanan (tidak dirinci di txt)
const ORE_PRICES = { [COAL]: 1, [IRON]: 2, [GOLD]: 4, [DIAMOND]: 7 }; // dari txt (pembeli)

// ================= WORLD GENERATION (3 LEVEL) =================
function carveCaves(grid, cols, rows, surfaceHeight, attempts, minDepthFromSurface) {
  for (let i = 0; i < attempts; i++) {
    let cx = Math.floor(Math.random() * cols);
    let cy = surfaceHeight ? Math.floor(rows * 0.4 + Math.random() * rows * 0.45) : Math.floor(2 + Math.random() * (rows - 6));
    let steps = 35 + Math.floor(Math.random() * 55);
    for (let s = 0; s < steps; s++) {
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          const nx = cx + ox, ny = cy + oy;
          if (nx < 1 || nx >= cols - 1 || ny < 1 || ny >= rows - BOTTOM_BORDER_THICKNESS - 1) continue;
          if (surfaceHeight && ny <= surfaceHeight[nx] + minDepthFromSurface) continue;
          if (grid[ny][nx] === BEDROCK) continue;
          if (Math.random() < 0.85) grid[ny][nx] = AIR;
        }
      }
      const dir = Math.floor(Math.random() * 4);
      if (dir === 0) cx++; else if (dir === 1) cx--; else if (dir === 2) cy++; else cy--;
      cx = Math.max(1, Math.min(cols - 2, cx));
      cy = Math.max(1, Math.min(rows - 2, cy));
    }
  }
}

// menggali ruang terbuka dengan LANTAI PADAT terjamin di floorRow, supaya
// pemain/pintu/beliung rahasia tidak jatuh tembus ke bawahnya.
function carveChamber(grid, cols, rows, cx, floorRow, halfW, headroom, solidType) {
  const x1 = Math.max(1, cx - halfW), x2 = Math.min(cols - 2, cx + halfW);
  const y1 = Math.max(1, floorRow - headroom), y2 = Math.min(rows - 2, floorRow - 1);
  for (let y = y1; y <= y2; y++) for (let x = x1; x <= x2; x++) {
    if (grid[y][x] !== BEDROCK) grid[y][x] = AIR;
  }
  if (floorRow > 0 && floorRow < rows - 1) {
    for (let x = x1; x <= x2; x++) if (grid[floorRow][x] !== BEDROCK) grid[floorRow][x] = solidType;
  }
}

// FIX BATAS BAWAH: lapisan bedrock di dasar tiap level dibuat cukup TEBAL
// (bukan cuma 1 blok) supaya menjadi "lantai" yang jelas & tak bisa
// dihancurkan (lihat pengecekan `t === BEDROCK` di updateMining).
//
// FIX PEMAIN & BLOK PALING BAWAH TERTUTUP HOTBAR: overlay UI hotbar (lihat
// style.css: #hotbar, position absolute, bottom:10px; tinggi total
// slot(40px) + padding(6px*2) + border(1px*2) = 54px) duduk DI ATAS kanvas
// game, menutupi sekitar 54+10 = ~64px paling bawah kanvas. Kamera dibiarkan
// scroll MENTOK persis ke tepi dasar dunia (lihat camera.y di update()), jadi
// zona ~64px itu SELALU berisi baris-baris bedrock ini, bukan medan acak
// (tanah/batu/ore) yang jadi tak kelihatan/aneh saat tertutup hotbar.
// BOTTOM_BORDER_THICKNESS * TILE (4*24=96px) sengaja dibuat lebih tebal
// daripada tinggi hotbar (~64px) supaya ada sedikit jarak aman, dan berlaku
// SAMA untuk ketiga level (permukaan, gua, gua dalam) karena satu konstanta
// ini dipakai di genSurface(), genCave(), dan genDeepCave().
const BOTTOM_BORDER_THICKNESS = 6;

// ---- LVL 1: PERMUKAAN ----
// kayu & daun di atas, 4 blok tanah, lalu batu + coal(banyak) + besi(sedang)
function genSurface() {
  const cols = 140, rows = 60;
  const grid = [];
  const surfaceHeight = [];
  let h = rows / 3;
  for (let x = 0; x < cols; x++) {
    h += (Math.random() - 0.5) * 1.6;
    h = Math.max(rows / 4, Math.min(rows / 2.2, h));
    surfaceHeight.push(Math.floor(h));
  }
  for (let y = 0; y < rows; y++) {
    const row = [];
    for (let x = 0; x < cols; x++) {
      const s = surfaceHeight[x];
      if (y < s) row.push(AIR);
      else if (y === s) row.push(GRASS);
      else if (y < s + 4) row.push(DIRT);
      else if (y >= rows - BOTTOM_BORDER_THICKNESS) row.push(BEDROCK);
      else {
        const r = Math.random();
        if (r < 0.12) row.push(COAL);
        else if (r < 0.18) row.push(IRON);
        else row.push(STONE);
      }
    }
    grid.push(row);
  }
  carveCaves(grid, cols, rows, surfaceHeight, 22, 2);

  // pohon-pohon kecil (kayu + daun) di permukaan
  for (let i = 0; i < 16; i++) {
    const x = 4 + Math.floor(Math.random() * (cols - 8));
    const s = surfaceHeight[x];
    const th = 3 + Math.floor(Math.random() * 2);
    for (let k = 1; k <= th; k++) if (s - k >= 0) grid[s - k][x] = WOOD;
    for (let oy = -1; oy <= 0; oy++) for (let ox = -2; ox <= 2; ox++) {
      const ly = s - th + oy, lx = x + ox;
      if (ly >= 0 && lx >= 0 && lx < cols && grid[ly][lx] === AIR) grid[ly][lx] = LEAF;
    }
  }

  const spawnX = Math.floor(cols / 2);

  // FIX BUG 2 (txt): pintu ke lvl 2 JANGAN di atas permukaan. Gali gua kecil
  // beberapa blok di bawah tempat spawn dan taruh pintu di dalamnya.
  const doorCol = spawnX - 5;
  const doorFloorRow = surfaceHeight[doorCol] + 6; // beberapa blok di bawah tanah
  carveChamber(grid, cols, rows, doorCol, doorFloorRow, 3, 4, STONE);

  return { id: "surface", name: "Permukaan (Lvl 1)", cols, rows, grid, surfaceHeight,
    spawn: { x: spawnX * TILE + TILE / 2, y: (surfaceHeight[spawnX] - 3) * TILE },
    doorSpot: { x: doorCol * TILE + TILE / 2, y: doorFloorRow * TILE } };
}

// ---- LVL 2: GUA ----
// batu, tanah(jarang), coal(banyak), besi(banyak), emas(sedikit)
function genCave() {
  const cols = 110, rows = 50;
  const grid = [];
  for (let y = 0; y < rows; y++) {
    const row = [];
    for (let x = 0; x < cols; x++) {
      if (x === 0 || x === cols - 1 || y === 0 || y >= rows - BOTTOM_BORDER_THICKNESS) { row.push(BEDROCK); continue; }
      const r = Math.random();
      if (r < 0.14) row.push(COAL);
      else if (r < 0.23) row.push(IRON);
      else if (r < 0.25) row.push(GOLD);
      else if (r < 0.30) row.push(DIRT);
      else row.push(STONE);
    }
    grid.push(row);
  }
  carveCaves(grid, cols, rows, null, 30, 0);

  const midX = Math.floor(cols / 2);
  const spawnFloorRow = 8;
  carveChamber(grid, cols, rows, midX, spawnFloorRow, 4, 6, STONE); // ruang spawn di atas-tengah

  const downX = Math.floor(cols * 0.75);
  const downFloorRow = Math.floor(rows * 0.5);
  carveChamber(grid, cols, rows, downX, downFloorRow, 3, 5, STONE); // ruang pintu ke lvl 3 (pertengahan kanan)

  return { id: "cave", name: "Gua (Lvl 2)", cols, rows, grid,
    spawnChamber: { x: midX * TILE + TILE / 2, y: spawnFloorRow * TILE },
    downSpot: { x: downX * TILE + TILE / 2, y: downFloorRow * TILE } };
}

// ---- LVL 3: GUA DALAM ----
// batu gua dalam, coal(banyak), besi(banyak), emas(sedang), diamond(jarang)
function genDeepCave() {
  const cols = 100, rows = 46;
  const grid = [];
  for (let y = 0; y < rows; y++) {
    const row = [];
    for (let x = 0; x < cols; x++) {
      if (x === 0 || x === cols - 1 || y === 0 || y >= rows - BOTTOM_BORDER_THICKNESS) { row.push(BEDROCK); continue; }
      const r = Math.random();
      if (r < 0.14) row.push(COAL);
      else if (r < 0.24) row.push(IRON);
      else if (r < 0.31) row.push(GOLD);
      else if (r < 0.34) row.push(DIAMOND);
      else row.push(DEEPSTONE);
    }
    grid.push(row);
  }
  carveCaves(grid, cols, rows, null, 30, 0);

  const midX = Math.floor(cols / 2);
  const spawnFloorRow = 8;
  carveChamber(grid, cols, rows, midX, spawnFloorRow, 4, 6, DEEPSTONE); // ruang spawn (pintu balik ke lvl2)

  // secret pix axe: pojok kiri, menempel di atas batu
  const secretX = 6, secretFloorRow = Math.floor(rows * 0.55);
  carveChamber(grid, cols, rows, secretX, secretFloorRow, 2, 5, DEEPSTONE);

  // ARENA BOS: pojok kanan bawah, digali JAUH LEBIH LUAS supaya ada ruang
  // gerak yang layak untuk melawan bos raksasa (bos sekarang ~64x58 px).
  const bossX = cols - 11, bossFloorRow = rows - 4;
  carveChamber(grid, cols, rows, bossX, bossFloorRow, 10, 11, DEEPSTONE);

  return { id: "deepcave", name: "Gua Dalam (Lvl 3)", cols, rows, grid,
    spawnChamber: { x: midX * TILE + TILE / 2, y: spawnFloorRow * TILE },
    secretSpot: { x: secretX * TILE + TILE / 2, y: secretFloorRow * TILE, taken: false },
    bossSpot: { x: bossX * TILE + TILE / 2, y: bossFloorRow * TILE } };
}

// ================= BANGUN 3 LEVEL & PINTU =================
let levels = [];
let levelIndex = 0;

function buildLevels() {
  const surface = genSurface();
  const cave = genCave();
  const deep = genDeepCave();

  // FIX BUG 2: pintu ke lvl 2 sekarang ada di dalam gua kecil di bawah spawn (bukan di permukaan)
  const surfaceDoorPos = surface.doorSpot;

  surface.doors = [
    { x: surfaceDoorPos.x, y: surfaceDoorPos.y, label: "Gua (Lvl 2)", toLevel: 1,
      target: { x: cave.spawnChamber.x, y: cave.spawnChamber.y } },
  ];
  cave.doors = [
    { x: cave.spawnChamber.x, y: cave.spawnChamber.y, label: "Permukaan (Lvl 1)", toLevel: 0,
      target: { x: surfaceDoorPos.x, y: surfaceDoorPos.y } },
    { x: cave.downSpot.x, y: cave.downSpot.y, label: "Gua Dalam (Lvl 3)", toLevel: 2,
      target: { x: deep.spawnChamber.x, y: deep.spawnChamber.y } },
  ];
  deep.doors = [
    { x: deep.spawnChamber.x, y: deep.spawnChamber.y, label: "Gua (Lvl 2)", toLevel: 1,
      target: { x: cave.downSpot.x, y: cave.downSpot.y } },
  ];

  surface.traders = [
    { id: "karto", name: "Pak Karto", type: "seller", x: surfaceDoorPos.x + 12 * TILE, y: 0, bobSeed: 4.1 },
    { id: "sari", name: "Bu Sari", type: "buyer", x: surfaceDoorPos.x + 20 * TILE, y: 0, bobSeed: 1.3 },
  ];
  surface.traders.forEach((t) => {
    const col = Math.max(0, Math.min(surface.cols - 1, Math.floor(t.x / TILE)));
    t.x = col * TILE + TILE / 2;
    t.y = surface.surfaceHeight[col] * TILE;
  });
  cave.traders = [];
  deep.traders = [];

  surface.monsters = [];
  cave.monsters = [];
  deep.monsters = [];

  levels = [surface, cave, deep];
  spawnMonstersForLevel(0, { lendir: 8, cacing: 2, tikus: 0 }, true);
  spawnMonstersForLevel(1, { lendir: 14, cacing: 10, tikus: 3 }, false);
  spawnMonstersForLevel(2, { lendir: 0, cacing: 12, tikus: 10 }, false);
  spawnBoss();
}

function L() { return levels[levelIndex]; }
function getTile(cx, cy) {
  const lvl = L();
  if (cx < 0 || cx >= lvl.cols || cy < 0 || cy >= lvl.rows) return BEDROCK;
  return lvl.grid[cy][cx];
}
function setTile(cx, cy, val) {
  const lvl = L();
  if (cx < 0 || cx >= lvl.cols || cy < 0 || cy >= lvl.rows) return;
  lvl.grid[cy][cx] = val;
}

// ================= MONSTER =================
function spawnMonstersForLevel(idx, counts, onlyDeepForCacing) {
  const lvl = levels[idx];
  const defs = [
    ...Array(counts.lendir).fill("lendir"),
    ...Array(counts.cacing).fill("cacing"),
    ...Array(counts.tikus).fill("tikus"),
  ];
  let tries = 0;
  let i = 0;
  while (i < defs.length && tries < 6000) {
    tries++;
    const cx = 3 + Math.floor(Math.random() * (lvl.cols - 6));
    const cy = 3 + Math.floor(Math.random() * (lvl.rows - 6));
    const type = defs[i];
    // di lvl1, cacing hanya muncul di bagian bawah tanah (sesuai txt: "cacing hanya ada di gua dalam bagian dunia permukaan")
    if (idx === 0 && onlyDeepForCacing && type === "cacing" && lvl.surfaceHeight && cy < lvl.surfaceHeight[cx] + 10) continue;
    if (getTile2(lvl, cx, cy) === AIR && getTile2(lvl, cx, cy - 1) === AIR && isSolid2(lvl, cx, cy + 1)) {
      if (lvl.surfaceHeight && cy < lvl.surfaceHeight[cx] + 3) continue;
      lvl.monsters.push(makeMonster(type, cx * TILE + TILE / 2, (cy + 1) * TILE));
      i++;
    }
  }
}
function spawnBoss() {
  const deep = levels[2];
  const spot = deep.bossSpot;
  const boss = makeMonster("boss", spot.x, spot.y);
  deep.monsters.push(boss);
}
function getTile2(lvl, cx, cy) { if (cx < 0 || cx >= lvl.cols || cy < 0 || cy >= lvl.rows) return BEDROCK; return lvl.grid[cy][cx]; }
function isSolid2(lvl, cx, cy) { return getTile2(lvl, cx, cy) !== AIR; }

// Bos dibuat jauh lebih besar & lebih kuat (dari 34x30/hp60 menjadi
// 64x58/hp150) supaya benar-benar terasa seperti puncak permainan, bukan
// sekadar tikus yang diskalakan sedikit.
const MOB_DEF = {
  lendir: { dmg: 0.5, hp: 6, speed: 0.9, w: 18, h: 14 },   // hp dinaikkan sedikit dr txt(1) agar tak instan mati, damage tetap sesuai txt
  cacing: { dmg: 1, hp: 8, speed: 1.3, w: 20, h: 12 },
  tikus: { dmg: 2, hp: 14, speed: 1.5, w: 20, h: 18 },
  boss: { dmg: 4, hp: 150, speed: 0.75, w: 64, h: 58 },
};
// Catatan: hp mentah di txt (lendir1, cacing2, tikus6, bos30) dikalikan ~2x supaya
// pertarungan tidak berakhir dalam satu pukulan beliung kuat; rasio antar-mob tetap sama.
// Bos dikalikan lebih besar lagi (~5x) karena sekarang berperan sebagai bos akhir.

function makeMonster(type, x, y) {
  const def = MOB_DEF[type];
  return {
    type, x, y, w: def.w, h: def.h, vx: 0, vy: 0, onGround: false,
    dir: Math.random() < 0.5 ? -1 : 1, alive: true, squish: Math.random() * 10,
    hp: def.hp, maxHp: def.hp, dmg: def.dmg, speed: def.speed, hurtTimer: 0, spotSeed: Math.random() * 1000,
  };
}

function updateMonsters(dt) {
  const lvl = L();
  // OPTIMASI: loop mundur + splice di tempat, tidak ada .filter() yang
  // membuat array baru tiap frame (mengurangi tekanan Garbage Collector / stutter).
  for (let i = lvl.monsters.length - 1; i >= 0; i--) {
    const m = lvl.monsters[i];
    if (!m.alive) { lvl.monsters.splice(i, 1); continue; }

    m.squish += dt;
    if (m.hurtTimer > 0) m.hurtTimer = Math.max(0, m.hurtTimer - dt);

    // FIX BUG "tidak bisa hit/kill musuh": sebelumnya kecepatan jalan musuh
    // langsung ditimpa ulang setiap frame (termasuk saat baru kena pukul),
    // jadi ia langsung kabur/berpatroli lagi sebelum serangan berikut sempat
    // kena. Selama hurtTimer aktif, musuh kena "hit-stun" (diam, hanya kena
    // efek dorongan/gravitasi), memberi jendela waktu untuk memukul beruntun.
    const stunned = m.hurtTimer > 0;
    if (!stunned) {
      m.x += m.vx;
      const hitWall = resolveEntityAxis(m, "x");
      if (hitWall) m.dir *= -1;
      m.vx = m.speed * m.dir;
    } else {
      m.x += m.vx;
      resolveEntityAxis(m, "x");
      m.vx *= 0.6; // gesekan knockback pelan, tidak langsung ditimpa kecepatan patroli
    }

    m.vy = Math.min(m.vy + GRAVITY, MAX_FALL);
    m.y += m.vy;
    m.onGround = false;
    resolveEntityAxis(m, "y");

    if (!stunned && m.onGround) {
      const aheadCol = Math.floor((m.x + m.dir * (m.w / 2 + 2)) / TILE);
      const belowRow = Math.floor(m.y / TILE) + 1;
      if (!isSolid(aheadCol, belowRow)) m.dir *= -1;
    }
  }
}

function checkMonsterCollisions() {
  const pb = getEntityBox(player);
  for (const m of L().monsters) {
    if (!m.alive) continue;
    const mb = getEntityBox(m);
    const overlap = pb.right > mb.left && pb.left < mb.right && pb.bottom > mb.top && pb.top < mb.bottom;
    if (overlap) {
      takeDamage(m.dmg);
      player.vx = (player.x < m.x ? -1 : 1) * 4;
      player.vy = -4;
    }
  }
}

// ================= PEMAIN =================
const MAX_HEALTH = 10; // nyawa 10 hp (txt)
const GRAVITY = 0.45;
const MAX_FALL = 12;
const REACH = 5.5 * TILE;
const FALL_DAMAGE_THRESHOLD = 6 * TILE;
const FALL_DAMAGE_PER_TILE = 0.6;
let airMinY = null;

const player = {
  x: 0, y: 0, w: 18, h: 34, vx: 0, vy: 0, speed: 3.2, jumpPower: 8.6,
  onGround: false, facing: 1, health: MAX_HEALTH, invulnTimer: 0, walkPhase: 0,
  character: "aron", pickaxeLevel: 0,
  legendary: false, // true setelah bos akhir dikalahkan -> tampilan karakter di-upgrade
};

// ================= EVENT AKHIR: BOS DIKALAHKAN =================
let gameWon = false;
let victoryOverlayOpen = false;

function triggerVictory() {
  if (gameWon) return; // hanya sekali
  gameWon = true;
  player.legendary = true;   // upgrade wujud karakter jadi lebih bagus (emas & bercahaya)
  player.health = MAX_HEALTH; // pulihkan penuh sebagai hadiah kemenangan
  updateHUD();
  spawnVictorySparkles();
  showVictoryOverlay();
}

// beberapa partikel kilau yang meledak dari titik kematian bos
let victorySparkles = [];
function spawnVictorySparkles() {
  const lvl = L();
  const boss = lvl.monsters.find((m) => m.type === "boss");
  const originX = boss ? boss.x : player.x;
  const originY = boss ? boss.y - 30 : player.y - 30;
  for (let i = 0; i < 40; i++) {
    const ang = Math.random() * Math.PI * 2;
    const spd = 1.5 + Math.random() * 4;
    victorySparkles.push({
      x: originX, y: originY, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd - 1,
      life: 1, color: Math.random() < 0.5 ? "#ffd700" : "#fff3b0",
    });
  }
}
function updateVictorySparkles(dt) {
  for (let i = victorySparkles.length - 1; i >= 0; i--) {
    const p = victorySparkles[i];
    p.vy += GRAVITY * 0.25;
    p.x += p.vx; p.y += p.vy;
    p.life -= dt * 0.7;
    if (p.life <= 0) victorySparkles.splice(i, 1);
  }
}
function drawVictorySparkles() {
  for (const p of victorySparkles) {
    const px = p.x - camera.x, py = p.y - camera.y;
    ctx.save();
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(px, py, 3, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
}

let victoryStyleInjected = false;
function ensureVictoryStyle() {
  if (victoryStyleInjected) return;
  victoryStyleInjected = true;
  const style = document.createElement("style");
  style.textContent = `
    @keyframes minerFadeIn { from { opacity: 0; } to { opacity: 1; } }
    @keyframes minerPopIn { from { transform: scale(0.85); opacity: 0; } to { transform: scale(1); opacity: 1; } }
    @keyframes minerTitleGlow { 0%,100% { text-shadow: 0 0 10px rgba(255,215,0,0.6); } 50% { text-shadow: 0 0 26px rgba(255,215,0,1); } }
  `;
  document.head.appendChild(style);
}

function showVictoryOverlay() {
  ensureVictoryStyle();
  victoryOverlayOpen = true;
  const old = document.getElementById("victoryOverlay");
  if (old) old.remove();

  const overlay = document.createElement("div");
  overlay.id = "victoryOverlay";
  overlay.style.cssText = "position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;"
    + "background:radial-gradient(circle at center, rgba(45,25,75,0.94), rgba(4,2,12,0.97));"
    + "font-family:'Trebuchet MS',sans-serif;color:#fff;text-align:center;animation:minerFadeIn .6s ease;";

  const namaKarakter = player.character === "junet" ? "Junet" : "Aron";
  overlay.innerHTML = `
    <div style="max-width:480px;width:88%;padding:32px 28px;border:2px solid #ffd700;border-radius:18px;
      background:rgba(22,12,38,0.7);box-shadow:0 0 50px rgba(255,215,0,0.45);animation:minerPopIn .5s ease;">
      <div style="font-size:13px;letter-spacing:5px;color:#7fe6e6;margin-bottom:10px;">TAMAT</div>
      <h1 style="margin:0 0 14px;font-size:26px;color:#ffd700;animation:minerTitleGlow 2s ease-in-out infinite;">
        BOS TAMBANG DIKALAHKAN!
      </h1>
      <p style="opacity:0.9;line-height:1.6;margin-bottom:20px;font-size:14px;">
        ${namaKarakter} berhasil menaklukkan kedalaman Mineral Town dan kini menjadi
        <b style="color:#ffe27a;">Penambang Legendaris</b> — lihat perlengkapanmu yang baru bersinar keemasan!
      </p>
      <div style="display:flex;justify-content:center;gap:22px;margin-bottom:24px;font-size:13px;opacity:0.95;">
        <div>🪙 Koin<br><b style="font-size:16px;">${coins}</b></div>
        <div>⛏️ Alat<br><b style="font-size:16px;">${PICKAXE_NAMES[player.pickaxeLevel]}</b></div>
      </div>
      <button id="victoryCloseBtn" style="padding:11px 28px;font-size:15px;border:none;border-radius:9px;
        background:linear-gradient(180deg,#ffe27a,#d9a83b);color:#3a2600;font-weight:bold;cursor:pointer;
        box-shadow:0 4px 0 #8a6415;">Lanjut Bermain sebagai Legenda</button>
    </div>`;
  document.body.appendChild(overlay);
  document.getElementById("victoryCloseBtn").onclick = () => {
    overlay.remove();
    victoryOverlayOpen = false;
  };
}

let inventory = { [WOOD]: 0, [DIRT]: 5, [STONE]: 0, [COAL]: 0, [IRON]: 0, [GOLD]: 0, [DIAMOND]: 0 };
let coins = 0;
const hotbarTypes = [DIRT, STONE, WOOD];
let selectedHotbar = 0;

function canMineTile(cx, cy) {
  const box = getEntityBox(player);
  const c1 = Math.floor(box.left / TILE) - 1;
  const c2 = Math.floor(box.right / TILE) + 1;
  const r1 = Math.floor(box.top / TILE) - 1;
  const r2 = Math.floor(box.bottom / TILE) + 1;
  return cx >= c1 && cx <= c2 && cy >= r1 && cy <= r2;
}

// ================= SERANGAN (memakai damage beliung yang sedang dipakai) =================
const ATTACK_RANGE = 2.5 * TILE; // sedikit diperlebar dari 1.7 agar tidak "kena tapi meleset"
const ATTACK_COOLDOWN = 0.25;
const ATTACK_ANIM_TIME = 0.18;
const ATTACK_FACING_SLACK = TILE * 1.2; // toleransi arah hadap saat musuh sangat dekat
let attackTimer = 0;
let attackCooldownTimer = 0;

function tryAttack() {
  if (!gameStarted || tradePanelOpen || victoryOverlayOpen) return;
  if (attackCooldownTimer > 0) return;

  attackCooldownTimer = ATTACK_COOLDOWN;
  attackTimer = ATTACK_ANIM_TIME;

  // Mengambil nilai damage sesuai level beliung yang sedang dipakai
  const dmg = PICKAXE_DAMAGE[player.pickaxeLevel];

  // Hitbox serangan di depan pemain. FIX "tidak bisa hit/kill musuh": sisi
  // BELAKANG hadap pemain sekarang memakai ATTACK_FACING_SLACK (bukan 12px
  // tetap yang terlalu sempit), supaya musuh yang menempel sangat dekat di
  // sisi mana pun tetap kena walau arah hadap sempat berubah-ubah saat
  // bertarung jarak dekat.
  const attackBox = {
    left: player.facing === 1 ? player.x - ATTACK_FACING_SLACK : player.x - ATTACK_RANGE,
    right: player.facing === 1 ? player.x + ATTACK_RANGE : player.x + ATTACK_FACING_SLACK,
    top: player.y - player.h - 16, // Mempertinggi area atas
    bottom: player.y + 12         // Memperluas area kaki/bawah
  };

  let hitAny = false;
  for (const m of L().monsters) {
    if (!m.alive) continue;

    const mb = getEntityBox(m);
    // Cek apakah hitbox serangan bersinggungan dengan hitbox musuh
    const isHit = attackBox.right > mb.left &&
                  attackBox.left < mb.right &&
                  attackBox.bottom > mb.top &&
                  attackBox.top < mb.bottom;

    if (isHit) {
      hitAny = true;
      // Kurangi HP musuh
      m.hp -= dmg;
      m.hurtTimer = 0.25; // Memberi efek hit-stun/kedip merah

      // Berikan efek dorongan (Knockback)
      const push = m.x < player.x ? -1 : 1;
      m.vx = push * (m.type === "boss" ? 3 : 4.5);
      m.vy = m.type === "boss" ? -2 : -3.5;

      // Kematian musuh
      if (m.hp <= 0) {
        m.alive = false;
        if (m.type === "boss") {
          coins += 50; // hadiah besar untuk bos akhir
          triggerVictory(); // ENDING: bos dikalahkan -> layar tamat + upgrade karakter
        } else {
          coins += 2; // Hadiah koin saat mengalahkan musuh biasa
        }
        updateHUD();
      }
    }
  }
  return hitAny;
}

// ================= PEDAGANG =================
const TRADE_RANGE = 2.4 * TILE;
let tradePanelOpen = false;
let currentTrader = null;
let nearbyTrader = null;

function updateTraderProximity() {
  nearbyTrader = null;
  let best = Infinity;
  for (const t of L().traders || []) {
    const d = Math.hypot(player.x - t.x, (player.y - player.h / 2) - (t.y - 20));
    if (d < TRADE_RANGE && d < best) { best = d; nearbyTrader = t; }
  }
  const promptEl = document.getElementById("tradePrompt");
  if (!promptEl) return;
  if (nearbyTrader && !tradePanelOpen) {
    promptEl.style.display = "block";
    promptEl.textContent = `Tekan ENTER untuk berdagang dengan ${nearbyTrader.name}`;
  } else {
    promptEl.style.display = "none";
  }
}

function openTradePanel(trader) {
  currentTrader = trader;
  tradePanelOpen = true;
  document.getElementById("tradePanel").classList.remove("hidden");
  document.getElementById("tradePrompt").style.display = "none";
  renderTradeBody();
}
function closeTradePanel() {
  tradePanelOpen = false;
  currentTrader = null;
  document.getElementById("tradePanel").classList.add("hidden");
}

function sellOre(type) {
  const amount = inventory[type] || 0;
  if (amount <= 0) return;
  coins += amount * (ORE_PRICES[type] || 0);
  inventory[type] = 0;
  updateHUD();
  renderTradeBody();
}

function canAfford(recipe) {
  if (coins < recipe.coin) return false;
  for (const k of Object.keys(recipe)) {
    if (k === "coin") continue;
    if ((inventory[k] || 0) < recipe[k]) return false;
  }
  return true;
}
function payRecipe(recipe) {
  coins -= recipe.coin;
  for (const k of Object.keys(recipe)) {
    if (k === "coin") continue;
    inventory[k] -= recipe[k];
  }
}
function buyPickaxe(level) {
  if (level <= player.pickaxeLevel || level === 5) return;
  const recipe = PICKAXE_RECIPE[level];
  if (!canAfford(recipe)) return;
  payRecipe(recipe);
  player.pickaxeLevel = level;
  updateHUD();
  renderTradeBody();
}
function buyFood() {
  if (coins < FOOD_COST) return;
  coins -= FOOD_COST;
  player.health = Math.min(MAX_HEALTH, player.health + FOOD_HEAL);
  updateHUD();
  renderTradeBody();
}

function recipeLabel(recipe) {
  const names = { [WOOD]: "Kayu", [STONE]: "Batu", [IRON]: "Besi", [GOLD]: "Emas", [DIAMOND]: "Diamond" };
  const parts = Object.keys(recipe).filter((k) => k !== "coin").map((k) => `${recipe[k]} ${names[k]}`);
  parts.push(`${recipe.coin} koin`);
  return parts.join(" + ");
}
function oreRow(type, label) {
  const owned = inventory[type] || 0;
  return `<div class="trade-row"><span>${label} <b>x${owned}</b></span>
    <button ${owned <= 0 ? "disabled" : ""} onclick="sellOre(${type})">Jual (+${ORE_PRICES[type]} koin/butir)</button></div>`;
}
function renderTradeBody() {
  if (!currentTrader) return;
  const titleEl = document.getElementById("tradeTitle");
  const bodyEl = document.getElementById("tradeBody");

  if (currentTrader.type === "buyer") {
    titleEl.textContent = `${currentTrader.name} — Pembeli Ore`;
    bodyEl.innerHTML = `
      <p class="trade-coins">Koin kamu: <b>${coins}</b> 🪙</p>
      <p class="trade-hint">Jual hasil tambangmu. Semakin langka, semakin mahal.</p>
      ${oreRow(COAL, "Batu Bara")}${oreRow(IRON, "Besi")}${oreRow(GOLD, "Emas")}${oreRow(DIAMOND, "Diamond")}
    `;
  } else {
    titleEl.textContent = `${currentTrader.name} — Penjual Alat & Makanan`;
    let rows = "";
    for (let lvl = 1; lvl <= 4; lvl++) {
      const owned = player.pickaxeLevel >= lvl;
      const recipe = PICKAXE_RECIPE[lvl];
      const disabled = owned || !canAfford(recipe);
      rows += `<div class="trade-row"><span>${PICKAXE_NAMES[lvl]}${owned ? " ✅" : ""}<br><small>${recipeLabel(recipe)}</small></span>
        <button ${disabled ? "disabled" : ""} onclick="buyPickaxe(${lvl})">Beli</button></div>`;
    }
    rows += `<div class="trade-row"><span>Makanan (+${FOOD_HEAL} HP)</span>
      <button ${coins < FOOD_COST ? "disabled" : ""} onclick="buyFood()">Beli (${FOOD_COST} koin)</button></div>`;
    bodyEl.innerHTML = `
      <p class="trade-coins">Koin kamu: <b>${coins}</b> 🪙</p>
      <p>Alat sekarang: <b>${PICKAXE_NAMES[player.pickaxeLevel]}</b></p>
      ${rows}
    `;
  }
}

// ================= PINTU ANTAR LEVEL =================
const DOOR_RANGE = 2.4 * TILE;
let nearbyDoor = null;
function updateDoorProximity() {
  nearbyDoor = null;
  let best = Infinity;
  for (const d of L().doors || []) {
    const dist = Math.hypot(player.x - d.x, (player.y - player.h / 2) - d.y);
    if (dist < DOOR_RANGE && dist < best) { best = dist; nearbyDoor = d; }
  }
  const promptEl = document.getElementById("doorPrompt");
  if (!promptEl) return;
  if (nearbyDoor && !tradePanelOpen) {
    promptEl.style.display = "block";
    promptEl.textContent = `Tekan ENTER untuk masuk ke ${nearbyDoor.label}`;
  } else {
    promptEl.style.display = "none";
  }
}
function goThroughDoor(door) {
  levelIndex = door.toLevel;
  player.x = door.target.x;
  player.y = door.target.y;
  player.vx = 0; player.vy = 0;
  airMinY = null;
  camera.x = 0; camera.y = 0;
  showLevelLabel();
  updateHUD();
}
function showLevelLabel() {
  const el = document.getElementById("levelLabel");
  if (!el) return;
  el.textContent = L().name;
  el.style.display = "block";
}

// ================= SECRET PIX AXE =================
const SECRET_RANGE = 1.8 * TILE;
function updateSecretProximity() {
  const promptEl = document.getElementById("secretPrompt");
  if (!promptEl) return;
  const lvl = L();
  if (lvl.id !== "deepcave" || lvl.secretSpot.taken) { promptEl.style.display = "none"; return; }
  const s = lvl.secretSpot;
  const dist = Math.hypot(player.x - s.x, (player.y - player.h / 2) - s.y);
  if (dist < SECRET_RANGE && !tradePanelOpen) {
    promptEl.style.display = "block";
    promptEl.textContent = "Tekan ENTER untuk mengambil Secret Pix Axe!";
  } else {
    promptEl.style.display = "none";
  }
}
function tryTakeSecret() {
  const lvl = L();
  if (lvl.id !== "deepcave" || lvl.secretSpot.taken) return false;
  const s = lvl.secretSpot;
  const dist = Math.hypot(player.x - s.x, (player.y - player.h / 2) - s.y);
  if (dist < SECRET_RANGE) {
    s.taken = true;
    player.pickaxeLevel = 5;
    updateHUD();
    return true;
  }
  return false;
}

// ================= INPUT =================
let keys = {};
window.addEventListener("keydown", (e) => {
  const k = e.key.toLowerCase();
  keys[k] = true;
  if (["1", "2", "3"].includes(k)) selectHotbar(parseInt(k) - 1);
  if (k === "f") tryAttack();
  if (k === "enter") {
    if (tradePanelOpen) closeTradePanel();
    else if (nearbyTrader) openTradePanel(nearbyTrader);
    else if (tryTakeSecret()) { /* diambil */ }
    else if (nearbyDoor) goThroughDoor(nearbyDoor);
  }
  if (k === "escape") closeTradePanel();
});
window.addEventListener("keyup", (e) => { keys[e.key.toLowerCase()] = false; });

function buildHotbar() {
  const bar = document.getElementById("hotbar");
  bar.innerHTML = "";
  hotbarTypes.forEach((t, i) => {
    const slot = document.createElement("div");
    slot.className = "slot" + (i === selectedHotbar ? " active" : "");
    slot.innerHTML = `<div class="swatch" style="background:${BLOCK_COLOR[t]}"></div>${i + 1}`;
    slot.onclick = () => selectHotbar(i);
    bar.appendChild(slot);
  });
}
function selectHotbar(i) { if (i < 0 || i >= hotbarTypes.length) return; selectedHotbar = i; buildHotbar(); }
buildHotbar();

function updateHUD() {
  document.getElementById("cntWood").textContent = inventory[WOOD];
  document.getElementById("cntDirt").textContent = inventory[DIRT];
  document.getElementById("cntStone").textContent = inventory[STONE];
  document.getElementById("cntCoal").textContent = inventory[COAL];
  document.getElementById("cntIron").textContent = inventory[IRON];
  document.getElementById("cntGold").textContent = inventory[GOLD];
  document.getElementById("cntDiamond").textContent = inventory[DIAMOND];
  document.getElementById("cntCoin").textContent = coins;
  document.getElementById("pickaxeName").textContent = PICKAXE_NAMES[player.pickaxeLevel];
  const frac = Math.max(0, player.health / MAX_HEALTH);
  document.getElementById("healthFill").style.width = (frac * 100) + "%";
  document.getElementById("healthText").textContent = `${player.health.toFixed(1)} / ${MAX_HEALTH} HP`;
}

function takeDamage(amount) {
  if (player.invulnTimer > 0 || amount <= 0) return;
  player.health = Math.max(0, player.health - amount);
  player.invulnTimer = 1.0;
  updateHUD();
  if (player.health <= 0) respawnPlayer();
}
function respawnPlayer() {
  levelIndex = 0;
  player.x = levels[0].spawn.x;
  player.y = levels[0].spawn.y;
  player.vx = 0; player.vy = 0;
  player.health = MAX_HEALTH;
  player.invulnTimer = 1.5;
  airMinY = null;
  showLevelLabel();
  updateHUD();
}

// ================= COLLISION =================
function isSolid(cx, cy) { return getTile(cx, cy) !== AIR; }
function getEntityBox(e) { return { left: e.x - e.w / 2, right: e.x + e.w / 2, top: e.y - e.h, bottom: e.y }; }

function resolveEntityAxis(e, axis) {
  let collided = false;
  const box = getEntityBox(e);
  const c1 = Math.floor(box.left / TILE), c2 = Math.floor(box.right / TILE);
  const r1 = Math.floor(box.top / TILE), r2 = Math.floor(box.bottom / TILE);
  for (let cy = r1; cy <= r2; cy++) {
    for (let cx = c1; cx <= c2; cx++) {
      if (!isSolid(cx, cy)) continue;
      const tileBox = { left: cx * TILE, right: cx * TILE + TILE, top: cy * TILE, bottom: cy * TILE + TILE };
      const pb = getEntityBox(e);
      const overlap = pb.right > tileBox.left && pb.left < tileBox.right && pb.bottom > tileBox.top && pb.top < tileBox.bottom;
      if (!overlap) continue;
      collided = true;
      if (axis === "x") {
        if (e.vx > 0) e.x = tileBox.left - e.w / 2;
        else if (e.vx < 0) e.x = tileBox.right + e.w / 2;
        e.vx = 0;
      } else {
        if (e.vy > 0) { e.y = tileBox.top; e.vy = 0; e.onGround = true; }
        else if (e.vy < 0) { e.y = tileBox.bottom + e.h; e.vy = 0; }
      }
    }
  }
  return collided;
}

function moveAndCollide() {
  player.x += player.vx;
  resolveEntityAxis(player, "x");
  player.vy = Math.min(player.vy + GRAVITY, MAX_FALL);
  player.y += player.vy;
  player.onGround = false;
  resolveEntityAxis(player, "y");
}

// ================= INPUT: MOUSE / MENAMBANG =================
let mouse = { x: 0, y: 0 };
let camera = { x: 0, y: 0 };
let isMouseDown = false;
let mouseButton = null;
let mining = { cx: null, cy: null, damage: 0, tickTimer: 0, blocked: false };

canvas.addEventListener("mousemove", (e) => {
  const rect = canvas.getBoundingClientRect();
  mouse.x = e.clientX - rect.left;
  mouse.y = e.clientY - rect.top;
});
canvas.addEventListener("contextmenu", (e) => e.preventDefault());
canvas.addEventListener("mousedown", (e) => {
  if (!gameStarted) return;
  isMouseDown = true;
  mouseButton = e.button;
  if (e.button === 2) handlePlace();
  else if (e.button === 0) { mining.cx = null; mining.cy = null; mining.damage = 0; mining.tickTimer = 0; }
});
window.addEventListener("mouseup", () => {
  isMouseDown = false; mouseButton = null;
  mining.cx = null; mining.cy = null; mining.damage = 0; mining.tickTimer = 0;
});

function handlePlace() {
  const worldX = mouse.x + camera.x, worldY = mouse.y + camera.y;
  const cx = Math.floor(worldX / TILE), cy = Math.floor(worldY / TILE);
  const dist = Math.hypot(worldX - player.x, worldY - (player.y - player.h / 2));
  if (dist > REACH) return;
  const t = getTile(cx, cy);
  const placeType = hotbarTypes[selectedHotbar];
  if (t === AIR && inventory[placeType] > 0) {
    const box = getEntityBox(player);
    const tileBox = { left: cx * TILE, right: cx * TILE + TILE, top: cy * TILE, bottom: cy * TILE + TILE };
    const overlapPlayer = box.right > tileBox.left && box.left < tileBox.right && box.bottom > tileBox.top && box.top < tileBox.bottom;
    if (!overlapPlayer) { setTile(cx, cy, placeType); inventory[placeType]--; updateHUD(); }
  }
}

function breakBlock(cx, cy, t) {
  setTile(cx, cy, AIR);
  const drop = t === GRASS ? DIRT : (t === LEAF ? null : t);
  if (drop !== null) { inventory[drop] = (inventory[drop] || 0) + 1; }
  updateHUD();
}

function updateMining(dt) {
  if (!isMouseDown || mouseButton !== 0) { mining.cx = null; mining.cy = null; mining.damage = 0; mining.blocked = false; return; }
  const worldX = mouse.x + camera.x, worldY = mouse.y + camera.y;
  const cx = Math.floor(worldX / TILE), cy = Math.floor(worldY / TILE);
  const t = getTile(cx, cy);

  // FIX BATAS BAWAH: blok BEDROCK (dasar dunia yg sekarang tebal
  // BOTTOM_BORDER_THICKNESS blok) selalu ditolak di sini, jadi pemain TIDAK
  // PERNAH bisa menghancurkan lantai paling bawah level manapun.
  if (!canMineTile(cx, cy) || t === AIR || t === BEDROCK) {
    mining.cx = null; mining.cy = null; mining.damage = 0; mining.blocked = false;
    return;
  }
  if (mining.cx !== cx || mining.cy !== cy) { mining.cx = cx; mining.cy = cy; mining.damage = 0; mining.tickTimer = 0; }

  const requiredTier = BLOCK_TIER[t] ?? 0;
  if (player.pickaxeLevel < requiredTier) { mining.blocked = true; return; }
  mining.blocked = false;

  mining.tickTimer -= dt;
  if (mining.tickTimer <= 0) {
    mining.tickTimer += MINE_TICK;
    mining.damage += PICKAXE_DAMAGE[player.pickaxeLevel];
    if (mining.damage >= (BLOCK_HP[t] ?? 1)) {
      breakBlock(cx, cy, t);
      mining.cx = null; mining.cy = null; mining.damage = 0;
    }
  }
}

// ================= GAME LOOP =================
let lastTime = performance.now();
function onGameStart(character) {
  player.character = character === "junet" ? "junet" : "aron";
  player.pickaxeLevel = 0; // FIX BUG 1: mulai dengan Beliung Kayu, bukan tangan kosong
  player.legendary = false;
  gameWon = false;
  victoryOverlayOpen = false;
  victorySparkles = [];
  const oldOverlay = document.getElementById("victoryOverlay");
  if (oldOverlay) oldOverlay.remove();
  lastTime = performance.now();
  buildLevels();
  levelIndex = 0;
  player.x = levels[0].spawn.x;
  player.y = levels[0].spawn.y;
  player.health = MAX_HEALTH;
  showLevelLabel();
  updateHUD();
}

function update(dt) {
  if (tradePanelOpen || victoryOverlayOpen) return;

  if (attackCooldownTimer > 0) attackCooldownTimer = Math.max(0, attackCooldownTimer - dt);
  if (attackTimer > 0) attackTimer = Math.max(0, attackTimer - dt);

  player.vx = 0;
  if (keys["a"] || keys["arrowleft"]) { player.vx = -player.speed; player.facing = -1; }
  if (keys["d"] || keys["arrowright"]) { player.vx = player.speed; player.facing = 1; }
  if ((keys[" "] || keys["w"] || keys["arrowup"]) && player.onGround) { player.vy = -player.jumpPower; player.onGround = false; }

  if (player.vx !== 0 && player.onGround) player.walkPhase += dt * 9; else player.walkPhase = 0;

  const wasOnGround = player.onGround;
  moveAndCollide();

  if (!player.onGround) {
    if (airMinY === null || player.y < airMinY) airMinY = player.y;
  } else if (!wasOnGround) {
    if (airMinY !== null) {
      const fallDist = player.y - airMinY;
      if (fallDist > FALL_DAMAGE_THRESHOLD) {
        const extraTiles = (fallDist - FALL_DAMAGE_THRESHOLD) / TILE;
        takeDamage(Math.max(1, Math.round(extraTiles * FALL_DAMAGE_PER_TILE)));
      }
      airMinY = null;
    }
  }
  if (player.invulnTimer > 0) player.invulnTimer = Math.max(0, player.invulnTimer - dt);

  updateMining(dt);
  updateMonsters(dt);
  checkMonsterCollisions();
  updateTraderProximity();
  updateDoorProximity();
  updateSecretProximity();
  updateBossBar();
  updateVictorySparkles(dt);

  const lvl = L();
  camera.x = Math.max(0, Math.min(player.x - VIEW_W / 2, lvl.cols * TILE - VIEW_W));
  // Kamera dibiarkan scroll MENTOK sampai tepi dasar dunia (tanpa celah
  // kosong buatan). Ini sengaja: lapisan bedrock di dasar (lihat
  // BOTTOM_BORDER_THICKNESS) sudah dibuat cukup tebal untuk menutupi persis
  // area yang akan tertutup overlay hotbar, jadi begitu kamera mentok, yang
  // tersembunyi di balik hotbar SELALU bedrock solid, bukan medan acak.
  camera.y = Math.max(0, Math.min(player.y - VIEW_H / 2, lvl.rows * TILE - VIEW_H));
}

function updateBossBar() {
  const el = document.getElementById("bossBar");
  const lvl = L();
  const boss = lvl.id === "deepcave" ? lvl.monsters.find((m) => m.type === "boss" && m.alive) : null;
  if (!boss) { el.style.display = "none"; return; }
  el.style.display = "block";
  document.getElementById("bossFill").style.width = Math.max(0, (boss.hp / boss.maxHp) * 100) + "%";
}

// ================= RENDER: LATAR =================
const cloudPuffs = [
  { x: 60, y: 55, s: 1.0 }, { x: 300, y: 90, s: 0.7 }, { x: 520, y: 45, s: 1.3 },
  { x: 700, y: 110, s: 0.6 }, { x: 900, y: 70, s: 1.0 }, { x: 150, y: 130, s: 0.5 },
];
function drawCloud(px, py, scale) {
  ctx.save();
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.beginPath();
  ctx.ellipse(px, py, 26 * scale, 14 * scale, 0, 0, Math.PI * 2);
  ctx.ellipse(px + 20 * scale, py - 8 * scale, 20 * scale, 12 * scale, 0, 0, Math.PI * 2);
  ctx.ellipse(px - 22 * scale, py - 4 * scale, 18 * scale, 11 * scale, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// OPTIMASI: gradient latar (langit, glow matahari, latar gua) bentuknya SELALU
// SAMA setiap frame (hanya bergantung ukuran kanvas yang tetap), jadi dibuat
// SEKALI saja di sini, bukan di-instansiasi ulang di dalam drawSky()/drawDarkness()
// setiap frame (createLinearGradient/createRadialGradient tergolong mahal bila
// dipanggil puluhan kali per detik).
const SUN_X = VIEW_W - 90, SUN_Y = 70;
const skyGradCache = ctx.createLinearGradient(0, 0, 0, VIEW_H);
skyGradCache.addColorStop(0, "#4fa8e0"); skyGradCache.addColorStop(0.45, "#87ceeb"); skyGradCache.addColorStop(1, "#dff3fa");
const sunGlowCache = ctx.createRadialGradient(SUN_X, SUN_Y, 5, SUN_X, SUN_Y, 60);
sunGlowCache.addColorStop(0, "rgba(255,250,200,0.9)"); sunGlowCache.addColorStop(1, "rgba(255,250,200,0)");
const caveBackdropCache = ctx.createLinearGradient(0, 0, 0, VIEW_H);
caveBackdropCache.addColorStop(0, "#120c22"); caveBackdropCache.addColorStop(1, "#1c1436");

function drawSky() {
  ctx.fillStyle = skyGradCache;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.fillStyle = sunGlowCache; ctx.fillRect(SUN_X - 60, SUN_Y - 60, 120, 120);
  ctx.fillStyle = "#fff6c9"; ctx.beginPath(); ctx.arc(SUN_X, SUN_Y, 26, 0, Math.PI * 2); ctx.fill();
  const drift = (performance.now() / 9000) * 40 - camera.x * 0.08;
  for (const c of cloudPuffs) { let x = ((c.x + drift) % (VIEW_W + 200)) - 100; drawCloud(x, c.y, c.s); }
}
function drawCaveBackdrop() {
  ctx.fillStyle = caveBackdropCache;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
}

function drawWorld() {
  const lvl = L();
  if (lvl.id === "surface") drawSky(); else drawCaveBackdrop();

  // VIEWPORT CULLING: batasi loop gambar blok hanya ke kolom/baris yang benar-benar
  // terlihat di layar DAN yang benar-benar ada di dalam dunia (tidak lewat 0 / cols-1 / rows-1).
  const startCol = Math.max(0, Math.floor(camera.x / TILE));
  const endCol = Math.min(lvl.cols - 1, Math.ceil((camera.x + VIEW_W) / TILE));
  const startRow = Math.max(0, Math.floor(camera.y / TILE));
  const endRow = Math.min(lvl.rows - 1, Math.ceil((camera.y + VIEW_H) / TILE));

  for (let cy = startRow; cy <= endRow; cy++) {
    for (let cx = startCol; cx <= endCol; cx++) {
      const t = getTile(cx, cy);
      if (t === AIR) continue;
      const px = cx * TILE - camera.x, py = cy * TILE - camera.y;

      ctx.fillStyle = BLOCK_COLOR[t];
      ctx.fillRect(px, py, TILE, TILE);
      ctx.fillStyle = "rgba(255,255,255,0.12)"; ctx.fillRect(px, py, TILE, 4);
      ctx.fillStyle = "rgba(0,0,0,0.18)"; ctx.fillRect(px, py + TILE - 4, TILE, 4);

      if (t === GRASS) {
        ctx.fillStyle = "#6fd17a"; ctx.fillRect(px, py, TILE, 6);
        ctx.fillStyle = "rgba(0,60,0,0.25)";
        for (let i = 0; i < 3; i++) { const nx = px + 3 + tileHash(cx, cy, i) * (TILE - 6); ctx.fillRect(nx, py, 2, 5); }
      }
      if (t === WOOD) {
        ctx.strokeStyle = "rgba(0,0,0,0.25)"; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(px + TILE / 2, py); ctx.lineTo(px + TILE / 2, py + TILE); ctx.stroke();
      }
      // FIX: garis miring "hazard" pada BEDROCK supaya pembatas dasar dunia
      // langsung dikenali sebagai batas tak bisa ditembus, bukan cuma batu biasa.
      if (t === BEDROCK) {
        ctx.save();
        ctx.beginPath(); ctx.rect(px, py, TILE, TILE); ctx.clip();
        ctx.strokeStyle = "rgba(255,255,255,0.22)"; ctx.lineWidth = 3;
        for (let i = -TILE; i < TILE * 2; i += 8) {
          ctx.beginPath(); ctx.moveTo(px + i, py + TILE); ctx.lineTo(px + i + TILE, py); ctx.stroke();
        }
        ctx.restore();
      }

      ctx.fillStyle = "rgba(0,0,0,0.08)";
      for (let i = 0; i < 3; i++) {
        const nx = px + tileHash(cx, cy, i * 3 + 1) * (TILE - 3);
        const ny = py + 6 + tileHash(cx, cy, i * 3 + 2) * (TILE - 12);
        ctx.fillRect(nx, ny, 2, 2);
      }
      if (t === GOLD || t === IRON || t === COAL || t === DIAMOND) {
        const glowColor = t === GOLD ? "rgba(255,240,150,0.55)" : (t === DIAMOND ? "rgba(150,255,255,0.55)" : "rgba(255,255,255,0.25)");
        ctx.fillStyle = glowColor;
        ctx.fillRect(px + 4, py + 4, 4, 4); ctx.fillRect(px + TILE - 8, py + TILE - 10, 4, 4); ctx.fillRect(px + TILE / 2 - 2, py + TILE / 2, 3, 3);
      }
      ctx.strokeStyle = "rgba(0,0,0,0.15)";
      ctx.strokeRect(px, py, TILE, TILE);
    }
  }

  drawDoors();
  drawSecret();
}

function drawDoors() {
  for (const d of L().doors || []) {
    const px = d.x - camera.x, py = d.y - camera.y;
    if (px < -50 || px > VIEW_W + 50) continue;
    ctx.save();
    ctx.translate(px, py);
    ctx.fillStyle = "#4a2f8a";
    ctx.fillRect(-12, -46, 24, 46);
    ctx.strokeStyle = "#7fe6e6"; ctx.lineWidth = 2;
    ctx.strokeRect(-12, -46, 24, 46);
    ctx.fillStyle = "rgba(127,230,230,0.5)";
    ctx.beginPath(); ctx.arc(0, -23, 16, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#ffd166"; ctx.beginPath(); ctx.arc(7, -23, 2, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.fillStyle = "#7fe6e6"; ctx.font = "bold 10px Trebuchet MS"; ctx.textAlign = "center";
    ctx.fillText(d.label, px, py - 52);
  }
}

function drawSecret() {
  const lvl = L();
  if (lvl.id !== "deepcave" || lvl.secretSpot.taken) return;
  const s = lvl.secretSpot;
  const px = s.x - camera.x, py = s.y - camera.y;
  const bob = Math.sin(performance.now() / 400) * 3;
  ctx.save();
  ctx.translate(px, py + bob);
  ctx.rotate(0.5);
  ctx.strokeStyle = "#7a3f2f"; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(-10, 10); ctx.lineTo(10, -10); ctx.stroke();
  ctx.fillStyle = "#ff3b3b";
  ctx.fillRect(4, -18, 12, 8);
  ctx.strokeStyle = "#000"; ctx.lineWidth = 1; ctx.strokeRect(4, -18, 12, 8);
  ctx.restore();
  ctx.save();
  ctx.globalAlpha = 0.35 + Math.sin(performance.now() / 200) * 0.15;
  ctx.beginPath(); ctx.arc(px, py - 10, 20, 0, Math.PI * 2);
  ctx.fillStyle = "#ff5a5a"; ctx.fill();
  ctx.restore();
}

function drawCrackOverlay() {
  if (mining.cx === null) return;
  const t = getTile(mining.cx, mining.cy);
  if (t === AIR) return;
  const frac = mining.blocked ? 0 : Math.min(1, mining.damage / (BLOCK_HP[t] ?? 1));
  const px = mining.cx * TILE - camera.x, py = mining.cy * TILE - camera.y;
  ctx.save();
  ctx.fillStyle = `rgba(0,0,0,${0.12 * frac})`;
  ctx.fillRect(px, py, TILE, TILE);
  if (mining.blocked) {
    ctx.strokeStyle = "rgba(255,60,60,0.8)"; ctx.lineWidth = 2;
    ctx.strokeRect(px + 3, py + 3, TILE - 6, TILE - 6);
  } else if (frac > 0) {
    ctx.strokeStyle = `rgba(20,10,5,${0.35 + 0.5 * frac})`; ctx.lineWidth = 2;
    const steps = Math.ceil(frac * 4);
    ctx.beginPath();
    if (steps >= 1) { ctx.moveTo(px + 4, py + 4); ctx.lineTo(px + TILE - 6, py + TILE - 8); }
    if (steps >= 2) { ctx.moveTo(px + TILE - 4, py + 6); ctx.lineTo(px + 6, py + TILE - 6); }
    if (steps >= 3) { ctx.moveTo(px + TILE / 2, py + 2); ctx.lineTo(px + TILE / 2 - 3, py + TILE - 4); }
    if (steps >= 4) { ctx.moveTo(px + 2, py + TILE / 2); ctx.lineTo(px + TILE - 3, py + TILE / 2 + 3); }
    ctx.stroke();
  }
  ctx.restore();
}

// ================= RENDER: MOB =================
function drawSlime(m, px, py, squish) {
  const bodyGrad = ctx.createRadialGradient(-3, -10, 2, 0, -6, 14);
  bodyGrad.addColorStop(0, "#9be36a"); bodyGrad.addColorStop(1, "#3f8f3a");
  ctx.fillStyle = bodyGrad;
  ctx.beginPath(); ctx.ellipse(0, -6, 10 * squish, 8 / squish, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "#245c20"; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.fillStyle = "#0d2b0d";
  ctx.beginPath(); ctx.arc(3, -8, 1.8, 0, Math.PI * 2); ctx.arc(7, -8, 1.8, 0, Math.PI * 2); ctx.fill();
}
function drawWorm(m, px, py) {
  ctx.strokeStyle = "#c76b6b"; ctx.lineWidth = 7; ctx.lineCap = "round";
  const wob = Math.sin(m.squish * 8) * 3;
  ctx.beginPath(); ctx.moveTo(-9, -4); ctx.quadraticCurveTo(-2, -8 + wob, 5, -4); ctx.quadraticCurveTo(10, -2, 10, -5); ctx.stroke();
  ctx.fillStyle = "#0d0d0d"; ctx.beginPath(); ctx.arc(9, -6, 1.4, 0, Math.PI * 2); ctx.fill();
}
function drawMole(m, px, py, scale) {
  ctx.save(); ctx.scale(scale, scale);
  ctx.fillStyle = "#8a6a4f";
  ctx.beginPath(); ctx.ellipse(0, -8, 11, 9, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#3e2b1e";
  ctx.beginPath(); ctx.moveTo(-11, -6); ctx.lineTo(-17, -3); ctx.lineTo(-10, -1); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#1a1a1a";
  ctx.beginPath(); ctx.arc(3, -10, 1.8, 0, Math.PI * 2); ctx.arc(7, -10, 1.8, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

// Sprite khusus untuk bos akhir: tubuh besar berduri, tanduk, dan mata
// menyala, supaya terasa jauh lebih mengancam & berbeda dari tikus biasa.
function drawBossMonster(m, px, py) {
  const t = performance.now() / 1000;
  const breathe = 1 + Math.sin(t * 2.2) * 0.035;

  ctx.save();
  ctx.scale(breathe, 1 / breathe);

  // aura merah berdenyut di belakang bos
  const auraR = 44 + Math.sin(t * 3) * 4;
  const auraGrad = ctx.createRadialGradient(0, -22, 6, 0, -22, auraR);
  auraGrad.addColorStop(0, "rgba(255,60,40,0.35)");
  auraGrad.addColorStop(1, "rgba(255,60,40,0)");
  ctx.fillStyle = auraGrad;
  ctx.beginPath(); ctx.arc(0, -22, auraR, 0, Math.PI * 2); ctx.fill();

  // tubuh utama (gelap, tebal, berotot)
  const bodyGrad = ctx.createLinearGradient(-30, -46, 30, 0);
  bodyGrad.addColorStop(0, "#5a1f1f"); bodyGrad.addColorStop(0.5, "#3a1414"); bodyGrad.addColorStop(1, "#241010");
  ctx.fillStyle = bodyGrad;
  ctx.beginPath();
  ctx.ellipse(0, -20, 30, 24, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#120707"; ctx.lineWidth = 2; ctx.stroke();

  // duri-duri di punggung
  ctx.fillStyle = "#241010";
  for (let i = -2; i <= 2; i++) {
    const sx = i * 10;
    ctx.beginPath();
    ctx.moveTo(sx - 5, -38); ctx.lineTo(sx, -50 - Math.abs(i) * 2); ctx.lineTo(sx + 5, -38);
    ctx.closePath(); ctx.fill();
  }

  // tanduk besar
  ctx.fillStyle = "#e8e2c9";
  ctx.beginPath(); ctx.moveTo(-16, -34); ctx.lineTo(-30, -50); ctx.lineTo(-14, -26); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(16, -34); ctx.lineTo(30, -50); ctx.lineTo(14, -26); ctx.closePath(); ctx.fill();

  // mata menyala merah
  const eyeGlow = 0.7 + Math.sin(t * 5) * 0.3;
  ctx.fillStyle = `rgba(255,50,40,${eyeGlow})`;
  ctx.beginPath(); ctx.ellipse(-9, -22, 4.5, 3, -0.2, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(9, -22, 4.5, 3, 0.2, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#fff2c9";
  ctx.beginPath(); ctx.arc(-9, -22, 1.3, 0, Math.PI * 2); ctx.arc(9, -22, 1.3, 0, Math.PI * 2); ctx.fill();

  // mulut bertaring
  ctx.fillStyle = "#0d0505";
  ctx.beginPath(); ctx.ellipse(0, -10, 12, 5, 0, 0, Math.PI); ctx.fill();
  ctx.fillStyle = "#e8e2c9";
  for (const fx of [-8, -3, 3, 8]) { ctx.beginPath(); ctx.moveTo(fx - 2, -10); ctx.lineTo(fx, -4); ctx.lineTo(fx + 2, -10); ctx.closePath(); ctx.fill(); }

  // lengan/cakar besar di kedua sisi
  ctx.fillStyle = "#3a1414";
  ctx.beginPath(); ctx.ellipse(-27, -6, 9, 15, 0.3, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(27, -6, 9, 15, -0.3, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "#e8e2c9"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(-30, 4); ctx.lineTo(-34, 12); ctx.moveTo(-25, 6); ctx.lineTo(-27, 15); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(30, 4); ctx.lineTo(34, 12); ctx.moveTo(25, 6); ctx.lineTo(27, 15); ctx.stroke();

  ctx.restore();
}

function drawMonster(m) {
  const px = m.x - camera.x, py = m.y - camera.y;
  const squish = 1 + Math.sin(m.squish * 6) * 0.08;
  const isBoss = m.type === "boss";
  ctx.save();
  ctx.translate(px, py);
  ctx.scale(m.dir, 1);
  ctx.fillStyle = "rgba(0,0,0,0.3)";
  const shadowW = isBoss ? 26 : 10, shadowH = isBoss ? 7 : 3;
  ctx.beginPath(); ctx.ellipse(0, 1, shadowW, shadowH, 0, 0, Math.PI * 2); ctx.fill();

  if (isBoss) drawBossMonster(m, px, py);
  else if (m.type === "lendir") drawSlime(m, px, py, squish);
  else if (m.type === "cacing") drawWorm(m, px, py);
  else drawMole(m, px, py, 1);

  if (m.hurtTimer > 0) {
    ctx.fillStyle = `rgba(255,60,60,${0.5 * (m.hurtTimer / 0.25)})`;
    ctx.beginPath(); ctx.ellipse(0, -8, isBoss ? 32 : 12, isBoss ? 26 : 10, 0, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();

  if (isBoss) {
    ctx.fillStyle = "#ff5a5a"; ctx.font = "bold 13px Trebuchet MS"; ctx.textAlign = "center";
    ctx.fillText("BOS TAMBANG", px, py - 62);
  }

  if (m.hp < m.maxHp) {
    const barW = isBoss ? 60 : 20;
    const frac = Math.max(0, m.hp / m.maxHp);
    ctx.save(); ctx.translate(px, py);
    ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fillRect(-barW / 2, isBoss ? -56 : -30, barW, 5);
    ctx.fillStyle = "#ff5a5a"; ctx.fillRect(-barW / 2, isBoss ? -56 : -30, barW * frac, 5);
    ctx.restore();
  }
}
function drawMonsters() { for (const m of L().monsters) if (m.alive) drawMonster(m); }

// ================= RENDER: PEMAIN (ARON / JUNET) =================
function drawPlayer() {
  const px = player.x - camera.x, py = player.y - camera.y;
  const legSwing = Math.sin(player.walkPhase) * 5;
  const isSwinging = isMouseDown && mouseButton === 0 && mining.cx !== null;
  const isAttacking = attackTimer > 0;
  let armSwing;
  if (isAttacking) { const frac = 1 - attackTimer / ATTACK_ANIM_TIME; armSwing = -1.3 + frac * 2.6; }
  else armSwing = isSwinging ? Math.sin(performance.now() / 45) * 0.7 : -0.2;

  const isJunet = player.character === "junet";
  const legendary = player.legendary;
  // UPGRADE VISUAL: setelah bos akhir dikalahkan, karakter berubah jadi
  // wujud "legendaris" berwarna emas dengan aura bercahaya, menggantikan
  // warna baju biasa. Ini adalah hadiah/ending dari permainan.
  const bodyColorA = legendary ? "#ffe27a" : (isJunet ? "#c76b9e" : "#4b7fc0");
  const bodyColorB = legendary ? "#c99a2e" : (isJunet ? "#8a3f6b" : "#2d5a91");
  const helmetColor = legendary ? "#fff3b0" : (isJunet ? "#a892d6" : "#ffd166");
  const name = isJunet ? "Junet" : "Aron";

  ctx.save();
  if (player.invulnTimer > 0 && Math.floor(player.invulnTimer * 10) % 2 === 0) ctx.globalAlpha = 0.35;
  ctx.translate(px, py);

  // aura keemasan (digambar sebelum scale(facing) supaya tetap simetris)
  if (legendary) {
    const t = performance.now() / 300;
    ctx.save();
    ctx.globalAlpha *= 0.55 + Math.sin(t) * 0.15;
    const auraGrad = ctx.createRadialGradient(0, -20, 4, 0, -20, 34);
    auraGrad.addColorStop(0, "rgba(255,215,0,0.55)");
    auraGrad.addColorStop(1, "rgba(255,215,0,0)");
    ctx.fillStyle = auraGrad;
    ctx.beginPath(); ctx.arc(0, -20, 34, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  ctx.scale(player.facing, 1);

  // jubah legendaris berkibar di belakang
  if (legendary) {
    const wave = Math.sin(performance.now() / 220) * 4;
    ctx.fillStyle = "#8a1f1f";
    ctx.beginPath();
    ctx.moveTo(-8, -25);
    ctx.lineTo(-14 - wave, -6);
    ctx.lineTo(-6 - wave * 0.5, -2);
    ctx.lineTo(-6, -24);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#ffd700"; ctx.lineWidth = 1; ctx.stroke();
  }

  ctx.fillStyle = "#3d2b1f";
  ctx.fillRect(-8, -10 + legSwing * 0.3, 6, 10);
  ctx.fillRect(2, -10 - legSwing * 0.3, 6, 10);

  const bodyGrad = ctx.createLinearGradient(-9, -26, 9, -8);
  bodyGrad.addColorStop(0, bodyColorA); bodyGrad.addColorStop(1, bodyColorB);
  ctx.fillStyle = bodyGrad;
  ctx.fillRect(-9, -26, 18, 18);
  ctx.strokeStyle = legendary ? "rgba(255,215,0,0.6)" : "rgba(0,0,0,0.2)"; ctx.strokeRect(-9, -26, 18, 18);

  ctx.fillStyle = legendary ? "#fff3b0" : "#ffd166";
  ctx.beginPath(); ctx.arc(-3, -20, 1.5, 0, Math.PI * 2); ctx.arc(3, -20, 1.5, 0, Math.PI * 2); ctx.fill();

  ctx.save();
  ctx.translate(9, -22);
  ctx.rotate(armSwing);
  ctx.fillStyle = "#e8b98a";
  ctx.fillRect(0, -3, 12, 6);
  {
    ctx.strokeStyle = player.pickaxeLevel === 5 ? "#ff3b3b" : (legendary ? "#ffd700" : "#8b5a2b");
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(21, -8); ctx.stroke();
    ctx.fillStyle = player.pickaxeLevel === 0 ? "#8b5a2b" : player.pickaxeLevel === 1 ? "#9a9a9a"
      : player.pickaxeLevel === 2 ? "#c68b59" : player.pickaxeLevel >= 3 ? "#ffd700" : "#9a9a9a";
    ctx.fillRect(18, -11, 8, 4);
  }
  ctx.restore();

  if (isAttacking) {
    const frac = 1 - attackTimer / ATTACK_ANIM_TIME;
    ctx.save(); ctx.globalAlpha = 0.7 * (1 - frac);
    ctx.strokeStyle = legendary ? "#ffd700" : "#fff59d"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(14, -18, 16, -0.9, 0.9 * frac + 0.2); ctx.stroke();
    ctx.restore();
  }

  ctx.fillStyle = "#e8b98a"; ctx.fillRect(-7, -34, 14, 10);
  ctx.fillStyle = "#2b1d12"; ctx.beginPath(); ctx.arc(2, -29, 1.3, 0, Math.PI * 2); ctx.fill();

  ctx.fillStyle = helmetColor;
  ctx.beginPath(); ctx.arc(0, -34, 8, Math.PI, 0); ctx.fill();
  ctx.strokeStyle = legendary ? "rgba(255,180,0,0.5)" : "rgba(0,0,0,0.25)"; ctx.stroke();
  if (isJunet && !legendary) {
    ctx.beginPath(); ctx.ellipse(6, -29, 2.5, 4, 0.5, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = legendary ? "#ff5a5a" : "#fff59d"; ctx.fillRect(-2, -38, 4, 4);
  ctx.fillStyle = legendary ? "rgba(255,215,0,0.4)" : "rgba(255,245,157,0.35)"; ctx.beginPath(); ctx.arc(0, -36, 10, 0, Math.PI * 2); ctx.fill();

  // mahkota kecil sebagai tanda "Penambang Legendaris"
  if (legendary) {
    ctx.fillStyle = "#ffd700";
    ctx.beginPath();
    ctx.moveTo(-7, -41); ctx.lineTo(-4, -48); ctx.lineTo(-1, -42);
    ctx.lineTo(1, -48); ctx.lineTo(4, -42); ctx.lineTo(7, -48); ctx.lineTo(7, -41);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "#8a6415"; ctx.lineWidth = 0.6; ctx.stroke();
  }

  ctx.restore();

  ctx.fillStyle = legendary ? "#ffd700" : "#fff"; ctx.font = "bold 12px Trebuchet MS"; ctx.textAlign = "center";
  ctx.fillText(legendary ? `${name} ✦ Legendaris` : name, px, py - 44);
}

// ================= RENDER: PEDAGANG =================
function drawStall(px, py, color) {
  ctx.save();
  ctx.fillStyle = color; ctx.fillRect(px - 20, py - 4, 40, 6);
  ctx.fillStyle = "rgba(0,0,0,0.25)"; ctx.fillRect(px - 20, py + 2, 40, 3);
  ctx.fillStyle = "#5a3a20"; ctx.fillRect(px - 17, py - 2, 4, 12); ctx.fillRect(px + 13, py - 2, 4, 12);
  ctx.restore();
}
function drawBuyerNPC(t, px, py, bob) {
  ctx.save(); ctx.translate(px, py + bob);
  ctx.fillStyle = "rgba(0,0,0,0.25)"; ctx.beginPath(); ctx.ellipse(0, 1, 11, 3, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#7a3d63";
  ctx.beginPath(); ctx.moveTo(-9, -2); ctx.lineTo(9, -2); ctx.lineTo(6, -18); ctx.lineTo(-6, -18); ctx.closePath(); ctx.fill();
  const bodyGrad = ctx.createLinearGradient(-8, -30, 8, -16);
  bodyGrad.addColorStop(0, "#c76b9e"); bodyGrad.addColorStop(1, "#8a3f6b");
  ctx.fillStyle = bodyGrad; ctx.fillRect(-8, -30, 16, 15);
  ctx.fillStyle = "#e8c56b"; ctx.beginPath(); ctx.arc(0, -22, 3.2, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#8a6a1f"; ctx.font = "5px Trebuchet MS"; ctx.textAlign = "center"; ctx.fillText("Rp", 0, -20.5);
  ctx.fillStyle = "#e0aa86"; ctx.fillRect(-11, -28, 4, 9); ctx.fillRect(7, -28, 4, 9);
  ctx.fillStyle = "#e0aa86"; ctx.fillRect(-6, -38, 12, 9);
  ctx.fillStyle = "#2b1c12"; ctx.beginPath(); ctx.arc(0, -38, 7, Math.PI, 0); ctx.fill();
  ctx.fillStyle = "#a892d6"; ctx.beginPath(); ctx.arc(-2, -40, 7, Math.PI, Math.PI * 2); ctx.fill();
  ctx.restore();
  ctx.fillStyle = "#ffd166"; ctx.font = "bold 12px Trebuchet MS"; ctx.textAlign = "center"; ctx.fillText(t.name, px, py - 46);
  ctx.fillStyle = "#e6dcff"; ctx.font = "10px Trebuchet MS"; ctx.fillText("Pembeli Ore", px, py - 34);
}
function drawSellerNPC(t, px, py, bob) {
  ctx.save(); ctx.translate(px, py + bob);
  ctx.fillStyle = "rgba(0,0,0,0.25)"; ctx.beginPath(); ctx.ellipse(0, 1, 11, 3, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#3a2e22"; ctx.fillRect(-7, -12, 6, 12); ctx.fillRect(1, -12, 6, 12);
  const bodyGrad = ctx.createLinearGradient(-9, -28, 9, -12);
  bodyGrad.addColorStop(0, "#6b4a2f"); bodyGrad.addColorStop(1, "#43301f");
  ctx.fillStyle = bodyGrad; ctx.fillRect(-9, -28, 18, 16);
  ctx.fillStyle = "#c98f63"; ctx.fillRect(-12, -26, 5, 10); ctx.fillRect(7, -26, 5, 10);
  ctx.fillRect(-7, -36, 14, 9);
  ctx.fillStyle = "#3a2e22"; ctx.fillRect(-6, -30, 12, 2.5);
  ctx.fillStyle = "#b3402f"; ctx.beginPath(); ctx.arc(0, -36, 8, Math.PI, 0); ctx.fill(); ctx.fillRect(6, -37, 6, 3);
  ctx.fillStyle = "#2b1d12"; ctx.beginPath(); ctx.arc(-2, -33, 1, 0, Math.PI * 2); ctx.arc(3, -33, 1, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "#8b5a2b"; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(9, -20); ctx.lineTo(20, -30); ctx.stroke();
  ctx.fillStyle = "#c9c9c9"; ctx.fillRect(17, -33, 8, 4);
  ctx.restore();
  ctx.fillStyle = "#ffd166"; ctx.font = "bold 12px Trebuchet MS"; ctx.textAlign = "center"; ctx.fillText(t.name, px, py - 46);
  ctx.fillStyle = "#e6dcff"; ctx.font = "10px Trebuchet MS"; ctx.fillText("Penjual Alat & Makanan", px, py - 34);
}
function drawTraders() {
  for (const t of L().traders || []) {
    const px = t.x - camera.x, py = t.y - camera.y;
    if (px < -40 || px > VIEW_W + 40) continue;
    const bob = Math.sin(performance.now() / 600 + t.bobSeed) * 1.5;
    drawStall(px, py, t.type === "buyer" ? "#8a3f6b" : "#43301f");
    if (t.type === "buyer") drawBuyerNPC(t, px, py, bob); else drawSellerNPC(t, px, py, bob);
  }
}

// ================= KURSOR =================
function drawCursor() {
  const worldX = mouse.x + camera.x, worldY = mouse.y + camera.y;
  const cx = Math.floor(worldX / TILE), cy = Math.floor(worldY / TILE);
  const inReach = canMineTile(cx, cy);
  const px = cx * TILE - camera.x, py = cy * TILE - camera.y;

  ctx.save();
  ctx.strokeStyle = inReach ? "rgba(255,255,255,0.85)" : "rgba(255,90,90,0.6)";
  ctx.lineWidth = 2; ctx.strokeRect(px + 1, py + 1, TILE - 2, TILE - 2);
  ctx.restore();

  ctx.save();
  ctx.translate(mouse.x, mouse.y);
  ctx.beginPath(); ctx.arc(0, 0, 11, 0, Math.PI * 2);
  ctx.strokeStyle = inReach ? "#ffd166" : "#ff5a5a"; ctx.lineWidth = 2; ctx.stroke();
  ctx.beginPath(); ctx.arc(0, 0, 2, 0, Math.PI * 2); ctx.fillStyle = "#fff"; ctx.fill();
  const swing = mining.cx !== null ? Math.sin(performance.now() / 55) * 0.5 : 0;
  ctx.rotate(0.6 + swing);
  ctx.strokeStyle = "#8b5a2b"; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(7, 7); ctx.lineTo(17, 17); ctx.stroke();
  ctx.fillStyle = "#c9c9c9"; ctx.fillRect(14, 11, 7, 4);
  ctx.restore();
}

// ================= GELAP =================
const fogCanvas = document.createElement("canvas");
fogCanvas.width = VIEW_W; fogCanvas.height = VIEW_H;
const fogCtx = fogCanvas.getContext("2d");

// OPTIMASI: lingkaran cahaya (light-hole & rona hangat) SEBELUMNYA dibuat lewat
// createRadialGradient() setiap frame (dua kali per frame, terus-menerus selama
// di gua). Sekarang gradiennya di-"bake" SEKALI menjadi sprite bitmap kecil,
// lalu tiap frame tinggal drawImage() sprite itu (murah) diskalakan ke radius
// cahaya saat ini — tanpa membuat objek gradient baru sama sekali per frame.
const LIGHT_SPRITE_SIZE = 256;
function makeRadialSprite(innerFrac, stops) {
  const c = document.createElement("canvas");
  c.width = LIGHT_SPRITE_SIZE; c.height = LIGHT_SPRITE_SIZE;
  const sctx = c.getContext("2d");
  const r = LIGHT_SPRITE_SIZE / 2;
  const g = sctx.createRadialGradient(r, r, r * innerFrac, r, r, r);
  for (const [offset, color] of stops) g.addColorStop(offset, color);
  sctx.fillStyle = g;
  sctx.fillRect(0, 0, LIGHT_SPRITE_SIZE, LIGHT_SPRITE_SIZE);
  return c;
}
const lightMaskSprite = makeRadialSprite(0.12, [
  [0, "rgba(255,255,255,1)"], [0.55, "rgba(255,255,255,0.8)"], [1, "rgba(255,255,255,0)"],
]);
const warmMaskSprite = makeRadialSprite(0, [
  [0, "rgba(255,235,170,1)"], [1, "rgba(255,235,170,0)"],
]);

function getDarknessAlpha() {
  const lvl = L();
  if (lvl.id === "surface") {
    const col = Math.max(0, Math.min(lvl.cols - 1, Math.floor(player.x / TILE)));
    const depth = player.y / TILE - lvl.surfaceHeight[col];
    if (depth <= 3) return 0;
    return Math.min(1, (depth - 3) / 12) * 0.93;
  }
  return lvl.id === "cave" ? 0.9 : 0.95; // gua: pencahayaan minim; gua dalam: lebih gelap lagi
}
function getLightRadius() {
  const lvl = L();
  if (lvl.id === "surface") return 5 * TILE;
  if (lvl.id === "cave") return 4 * TILE;   // "hanya terlihat 4 blok dari karakter"
  return 3 * TILE;                          // "pencahayaan hanya 3 blok dari karakter"
}

function drawDarkness() {
  const alpha = getDarknessAlpha();
  if (alpha <= 0.01) return;
  fogCtx.clearRect(0, 0, VIEW_W, VIEW_H);
  fogCtx.fillStyle = `rgba(5,4,12,${alpha})`;
  fogCtx.fillRect(0, 0, VIEW_W, VIEW_H);

  const px = player.x - camera.x, py = player.y - player.h / 2 - camera.y;
  const flicker = 1 + Math.sin(performance.now() / 140) * 0.035;
  // Pemain legendaris memancarkan cahaya emas sendiri, jadi radius
  // penglihatannya sedikit lebih luas di dalam gua sebagai bonus ending.
  const bonus = player.legendary ? 1.25 : 1;
  const radius = getLightRadius() * flicker * bonus;

  fogCtx.globalCompositeOperation = "destination-out";
  fogCtx.drawImage(lightMaskSprite, px - radius, py - radius, radius * 2, radius * 2);

  // FIX BLOK PALING BAWAH TAK TERLIHAT: sebelumnya lubang cahaya di kabut
  // gelap HANYA mengikuti posisi pemain (radius 3-5 blok). Kalau pemain belum
  // berada tepat di dekat dasar dunia, blok BEDROCK di bawah sana tertutup
  // total oleh kabut gelap dan jadi tak terlihat sama sekali. Sekarang setiap
  // blok BEDROCK yang sedang tampil di layar SELALU dibuka penuh dari kabut,
  // berapa pun jarak pemain darinya, supaya pembatas dasar dunia selalu jelas.
  const lvl = L();
  const bStartCol = Math.max(0, Math.floor(camera.x / TILE));
  const bEndCol = Math.min(lvl.cols - 1, Math.ceil((camera.x + VIEW_W) / TILE));
  const bStartRow = Math.max(0, Math.floor(camera.y / TILE));
  const bEndRow = Math.min(lvl.rows - 1, Math.ceil((camera.y + VIEW_H) / TILE));
  fogCtx.fillStyle = "rgba(255,255,255,1)";
  for (let cy = bStartRow; cy <= bEndRow; cy++) {
    for (let cx = bStartCol; cx <= bEndCol; cx++) {
      if (getTile(cx, cy) === BEDROCK) {
        fogCtx.fillRect(cx * TILE - camera.x - 1, cy * TILE - camera.y - 1, TILE + 2, TILE + 2);
      }
    }
  }
  fogCtx.globalCompositeOperation = "source-over";

  ctx.drawImage(fogCanvas, 0, 0);

  ctx.save();
  ctx.globalAlpha = 0.10 * (1 - alpha * 0.4);
  const warmR = radius * 0.5;
  ctx.drawImage(warmMaskSprite, px - warmR, py - warmR, warmR * 2, warmR * 2);
  ctx.restore();
}

// ================= LOOP UTAMA =================
function loop(now) {
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;

  if (gameStarted && levels.length) update(dt);

  if (levels.length) {
    drawWorld();
    if (gameStarted) {
      drawTraders();
      drawMonsters();
      drawCrackOverlay();
      drawPlayer();
      drawVictorySparkles();
      drawDarkness();
      drawCursor();
    }
  } else {
    // sebelum MULAI ditekan: latar statis sederhana
    ctx.fillStyle = "#150f2b";
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }

  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);