/**
 * data.js — Reactive state management for FPL Team Builder
 */

export const POSITION_LIMITS = {
  GKP: { total: 2, minPlay: 1, maxPlay: 1 },
  DEF: { total: 5, minPlay: 3, maxPlay: 5 },
  MID: { total: 5, minPlay: 2, maxPlay: 5 },
  FWD: { total: 3, minPlay: 1, maxPlay: 3 },
};

export const BUDGET = 1000; // in tenths (£100.0m)
export const MAX_PER_TEAM = 3;

// ── App State ──
export const state = {
  allPlayers: [],
  teams: [],
  fixtures: {},
  rawFixtures: [],
  teamColors: {},
  currentGW: 1,
  nextGW: 2,

  // livePoints: map of playerId → { points, minutes, goals, assists, ... }
  livePoints: {},

  // lastTransfers: list of transfers made by improveTeam
  lastTransfers: [],

  // Squad: exactly 15 FPL slots
  squad: {
    GKP: [null, null],
    DEF: [null, null, null, null, null],
    MID: [null, null, null, null, null],
    FWD: [null, null, null],
  },

  // bench: array of { pos, index } describing which 4 slots are on the bench
  bench: [
    { pos: 'GKP', index: 1 },
    { pos: 'DEF', index: 4 },
    { pos: 'MID', index: 4 },
    { pos: 'FWD', index: 2 },
  ],

  selectedSlot: null,
  captainId: null,
  viceCaptainId: null,

  filters: { position: 'ALL', team: 'ALL', search: '', sort: 'points' },
  statsFilters: { position: 'ALL', search: '', sort: 'total_points' },
  _listeners: [],
};

// ── Pub/Sub ──
export function subscribe(fn) { state._listeners.push(fn); }
export function notify(event = 'update') { state._listeners.forEach(fn => fn(event)); }

// ── Bench helpers ──
export function isBenched(position, index) {
  return state.bench.some(b => b.pos === position && b.index === index);
}

/**
 * Recalculate bench after any squad change.
 * Picks the best 11 starters (1 GKP + 10 outfield) by live score,
 * enforcing FPL min/max per-position rules. Remaining 4 go to bench.
 */
export function recalcBench() {
  // Gather all filled slots
  const allFilled = [];
  ['GKP', 'DEF', 'MID', 'FWD'].forEach(pos => {
    state.squad[pos].forEach((p, idx) => {
      if (p) allFilled.push({ p, pos, idx, score: computePlayerScore(p) });
    });
  });

  const total = allFilled.length;
  if (total < 2) {
    // Not enough players to bench anyone — put all on pitch
    state.bench = [];
    return;
  }

  // Always pick best GKP as starter
  const gkps = allFilled.filter(x => x.pos === 'GKP').sort((a, b) => b.score - a.score);
  const startGKP = gkps[0];
  const benchGKP = gkps.slice(1);

  // Outfield: pick best 10 respecting min/max rules
  const outfield = allFilled.filter(x => x.pos !== 'GKP').sort((a, b) => b.score - a.score);

  // How many outfield starters do we need? max 10, but might have fewer players
  const outfieldCount = Math.min(10, outfield.length);

  const pitchCounts = { DEF: 0, MID: 0, FWD: 0 };
  const pitchOutfield = [];
  const benchOutfield = [];

  // Phase 1: enforce minimums (3 DEF, 2 MID, 1 FWD)
  const byPos = { DEF: [], MID: [], FWD: [] };
  outfield.forEach(x => byPos[x.pos].push(x));

  const forcePitch = (pos, minCount) => {
    for (let i = 0; i < minCount && i < byPos[pos].length; i++) {
      pitchOutfield.push(byPos[pos][i]);
      pitchCounts[pos]++;
    }
  };

  // Minimum requirements
  forcePitch('DEF', POSITION_LIMITS.DEF.minPlay);
  forcePitch('MID', POSITION_LIMITS.MID.minPlay);
  forcePitch('FWD', POSITION_LIMITS.FWD.minPlay);

  // Phase 2: fill remaining slots by score, respecting maxPlay
  const mandatoryIds = new Set(pitchOutfield.map(x => x.idx + '_' + x.pos));
  const remaining = outfield.filter(x => !mandatoryIds.has(x.idx + '_' + x.pos));
  const slotsLeft = outfieldCount - pitchOutfield.length;

  for (const x of remaining) {
    if (pitchOutfield.length >= outfieldCount) break;
    if (pitchCounts[x.pos] < POSITION_LIMITS[x.pos].maxPlay) {
      pitchOutfield.push(x);
      pitchCounts[x.pos]++;
    } else {
      benchOutfield.push(x);
    }
  }

  // Anything not on pitch goes to bench
  const pitchOutfieldIds = new Set(pitchOutfield.map(x => x.idx + '_' + x.pos));
  outfield.forEach(x => {
    if (!pitchOutfieldIds.has(x.idx + '_' + x.pos)) {
      if (!benchOutfield.includes(x)) benchOutfield.push(x);
    }
  });

  // Build new bench array
  state.bench = [
    ...benchGKP.map(x => ({ pos: x.pos, index: x.idx })),
    ...benchOutfield.map(x => ({ pos: x.pos, index: x.idx })),
  ];

  // Keep captain and vice on pitch — if they ended up benched, swap with highest bench player
  [state.captainId, state.viceCaptainId].forEach(id => {
    if (!id) return;
    const onBench = state.bench.find(b => getSlotPlayer(b.pos, b.index)?.id === id);
    if (onBench) {
      // Find a pitch player of the same position to swap
      const swap = pitchOutfield.find(x => x.pos !== 'GKP' && x.p.id !== id);
      if (swap) {
        state.bench = state.bench.filter(b => !(b.pos === onBench.pos && b.index === onBench.index));
        state.bench.push({ pos: swap.pos, index: swap.idx });
      }
    }
  });
}

// ── Squad helpers ──
export function getSquadPlayers() {
  const all = [];
  ['GKP', 'DEF', 'MID', 'FWD'].forEach(pos => {
    state.squad[pos].forEach((p, i) => {
      if (p) all.push({ player: p, position: pos, index: i, isBench: isBenched(pos, i) });
    });
  });
  return all;
}

export function getTotalSpent() {
  return getSquadPlayers().reduce((s, { player }) => s + Math.round(player.price * 10), 0);
}

export function getRemainingBudget() {
  return (BUDGET - getTotalSpent()) / 10;
}

export function getTeamCounts() {
  const counts = {};
  getSquadPlayers().forEach(({ player }) => {
    counts[player.teamId] = (counts[player.teamId] || 0) + 1;
  });
  return counts;
}

export function getSquadPlayerIds() {
  return new Set(getSquadPlayers().map(({ player }) => player.id));
}

// ── FPL-accurate points calculation ──
/**
 * Get the live GW points for a player from state.livePoints,
 * falling back to bootstrap eventPoints if not available.
 */
export function getPlayerGWPoints(player) {
  const live = state.livePoints[player.id];
  if (live) return live.points;
  return player.eventPoints ?? 0;
}

/**
 * Get the live stats breakdown for display in the popup.
 */
export function getPlayerLiveStats(player) {
  return state.livePoints[player.id] || null;
}

/**
 * Calculate the expected FPL points from a live stats object.
 * This mirrors the official FPL scoring rules exactly.
 */
export function calculateFPLPoints(player, stats) {
  if (!stats) return 0;
  const pos = player.position;
  let pts = 0;

  // Appearance bonus
  if (stats.minutes >= 1) pts += 1;
  if (stats.minutes >= 60) pts += 2;

  // Goals scored
  const goalPts = { GKP: 6, DEF: 6, MID: 5, FWD: 4 };
  pts += stats.goals * (goalPts[pos] || 4);

  // Assists
  pts += stats.assists * 3;

  // Clean sheets (only applies if played 60+ min)
  if (stats.minutes >= 60) {
    if (pos === 'GKP' || pos === 'DEF') pts += stats.cleanSheet * 4;
    else if (pos === 'MID') pts += stats.cleanSheet * 1;
  }

  // Goals conceded (GKP/DEF only — every 2 goals conceded)
  if (pos === 'GKP' || pos === 'DEF') {
    pts -= Math.floor(stats.goalsConceded / 2);
  }

  // GKP saves
  if (pos === 'GKP') pts += Math.floor(stats.saves / 3);

  // Penalty saves/misses
  pts += stats.penaltiesSaved * 5;
  pts -= stats.penaltiesMissed * 2;

  // Yellow/Red cards
  pts -= stats.yellowCards * 1;
  pts -= stats.redCards * 3;

  // Own goals
  pts -= stats.ownGoals * 2;

  // Bonus
  pts += stats.bonus;

  return pts;
}

/**
 * Total GW points for the starting XI (captain doubled, bench excluded).
 */
export function getTotalGWPoints() {
  let total = 0;
  getSquadPlayers().forEach(({ player, isBench }) => {
    if (isBench) return;
    const pts = getPlayerGWPoints(player);
    const isCapt = state.captainId === player.id;
    total += isCapt ? pts * 2 : pts;
  });
  return total;
}

// ── Player placement ──
export function canAddPlayer(player, position, index) {
  const squadIds = getSquadPlayerIds();
  if (squadIds.has(player.id)) return { ok: false, reason: 'Player already in squad' };
  if (player.position !== position) return { ok: false, reason: `Must be a ${position}` };

  const teamCounts = getTeamCounts();
  const current = getSlotPlayer(position, index);
  const currentCount = teamCounts[player.teamId] || 0;
  const effectiveCount = current && current.teamId === player.teamId ? currentCount - 1 : currentCount;
  if (effectiveCount >= MAX_PER_TEAM) return { ok: false, reason: `Max ${MAX_PER_TEAM} players per team` };

  const cost = current ? player.price - current.price : player.price;
  if (cost > getRemainingBudget() + 0.001)
    return { ok: false, reason: `Not enough budget (need £${cost.toFixed(1)}m more)` };

  return { ok: true };
}

export function getSlotPlayer(position, index) {
  return state.squad[position]?.[index] || null;
}

export function setSlotPlayer(position, index, player) {
  state.squad[position][index] = player;
  notify('squad');
}

export function removePlayer(position, index) {
  const player = getSlotPlayer(position, index);
  if (!player) return;
  if (state.captainId === player.id) state.captainId = null;
  if (state.viceCaptainId === player.id) state.viceCaptainId = null;
  state.squad[position][index] = null;
  recalcBench();
  notify('squad');
}

// ── Swap logic ──
function getPitchCounts() {
  const counts = { GKP: 0, DEF: 0, MID: 0, FWD: 0 };
  ['GKP', 'DEF', 'MID', 'FWD'].forEach(pos => {
    state.squad[pos].forEach((_, i) => {
      if (!isBenched(pos, i)) counts[pos]++;
    });
  });
  return counts;
}

export function swapSlots(posA, idxA, posB, idxB) {
  const aIsBench = isBenched(posA, idxA);
  const bIsBench = isBenched(posB, idxB);
  const pA = getSlotPlayer(posA, idxA);
  const pB = getSlotPlayer(posB, idxB);

  // Cross-zone swap (one on pitch, one on bench) with different positions
  // requires formation validation
  if (aIsBench !== bIsBench && posA !== posB) {
    // Determine who's coming on and who's going off
    const comingOnPos = aIsBench ? posA : posB; // bench player's position
    const goingOffPos = aIsBench ? posB : posA; // pitch player's position

    // Calculate current pitch counts (filled pitch slots by position)
    const pitchCounts = { GKP: 0, DEF: 0, MID: 0, FWD: 0 };
    ['GKP', 'DEF', 'MID', 'FWD'].forEach(pos => {
      state.squad[pos].forEach((p, i) => {
        if (p && !isBenched(pos, i)) pitchCounts[pos]++;
      });
    });

    const newCounts = { ...pitchCounts };
    newCounts[comingOnPos]++;
    newCounts[goingOffPos]--;

    if (newCounts[goingOffPos] < POSITION_LIMITS[goingOffPos].minPlay) {
      return { ok: false, reason: `Invalid: Need ≥${POSITION_LIMITS[goingOffPos].minPlay} ${goingOffPos}s on pitch` };
    }
    if (newCounts[comingOnPos] > POSITION_LIMITS[comingOnPos].maxPlay) {
      return { ok: false, reason: `Invalid: Max ${POSITION_LIMITS[comingOnPos].maxPlay} ${comingOnPos}s on pitch` };
    }
  }

  // Perform the physical swap in the squad arrays
  state.squad[posA][idxA] = pB;
  state.squad[posB][idxB] = pA;

  // Rebuild bench automatically — this handles all bench membership updates correctly
  recalcBench();
  notify('squad');
  return { ok: true };
}


// ── Captain ──
export function setCaptain(playerId) {
  if (state.viceCaptainId === playerId) state.viceCaptainId = null;
  state.captainId = playerId;
  notify('squad');
}

export function setViceCaptain(playerId) {
  if (state.captainId === playerId) state.captainId = null;
  state.viceCaptainId = playerId;
  notify('squad');
}

// ── Scoring heuristic ──
export function computePlayerScore(p) {
  const gwPts = getPlayerGWPoints(p);
  return (p.totalPoints * 0.3) + (gwPts * 1.5) + (p.form * 5) + (p.epNext * 7) + (p.pointsPerGame * 2);
}

// ── Reset ──
export function resetSquad() {
  state.squad = {
    GKP: [null, null],
    DEF: [null, null, null, null, null],
    MID: [null, null, null, null, null],
    FWD: [null, null, null],
  };
  state.bench = [
    { pos: 'GKP', index: 1 },
    { pos: 'DEF', index: 4 },
    { pos: 'MID', index: 4 },
    { pos: 'FWD', index: 2 },
  ];
  state.captainId = null;
  state.viceCaptainId = null;
  state.selectedSlot = null;
  notify('squad');
}

// ── Auto Fill / Improve Team ──
/**
 * Main auto-fill function.
 * If squad has 5+ players → "Improve Team" mode (targeted swaps).
 * Otherwise → full squad builder from scratch.
 */
export function autoFill() {
  const currentCount = getSquadCount();
  if (currentCount >= 5) {
    improveTeam();
  } else {
    buildFullSquad();
  }
}

function buildFullSquad() {
  resetSquad();
  const used = new Set();
  const teamCount = {};
  let spent = 0;
  const MIN_COST = 40;

  function canAfford(player, reserveSlots = 0) {
    const cost = Math.round(player.price * 10);
    return (
      !used.has(player.id) &&
      (teamCount[player.teamId] || 0) < MAX_PER_TEAM &&
      spent + cost + reserveSlots * MIN_COST <= BUDGET
    );
  }

  const pools = { GKP: [], DEF: [], MID: [], FWD: [] };
  state.allPlayers.forEach(p => { if (pools[p.position]) pools[p.position].push(p); });
  Object.keys(pools).forEach(k => pools[k].sort((a, b) => computePlayerScore(b) - computePlayerScore(a)));

  const slots = { GKP: 2, DEF: 5, MID: 5, FWD: 3 };
  let remaining = 15;

  ['GKP', 'DEF', 'MID', 'FWD'].forEach(pos => {
    let filled = 0;
    for (const p of pools[pos]) {
      if (filled >= slots[pos]) break;
      if (canAfford(p, remaining - 1)) {
        used.add(p.id);
        teamCount[p.teamId] = (teamCount[p.teamId] || 0) + 1;
        spent += Math.round(p.price * 10);
        state.squad[pos][filled] = p;
        filled++;
        remaining--;
      }
    }
  });

  recalcBench();

  // Set captain/vice to highest scorers on pitch
  const starters = getSquadPlayers()
    .filter(x => !x.isBench)
    .sort((a, b) => computePlayerScore(b.player) - computePlayerScore(a.player));
  if (starters.length > 0) state.captainId = starters[0].player.id;
  if (starters.length > 1) state.viceCaptainId = starters[1].player.id;

  notify('squad');
}

/**
 * Improve existing team: find the weakest player in each position
 * and swap them for the best available alternative within budget.
 * Max 3 transfers per call (mimicking FPL free transfers).
 * Stores results in state.lastTransfers for the Transfer Log widget.
 */
function improveTeam() {
  const squadIds = getSquadPlayerIds();
  const teamCount = getTeamCounts();
  let budget = getRemainingBudget();
  let transfers = 0;
  const MAX_TRANSFERS = 3;
  const transferLog = [];

  // Score each current squad player — lower score = candidate for replacement
  const squadList = getSquadPlayers()
    .map(({ player, position, index, isBench }) => ({
      player, position, index, isBench,
      score: computePlayerScore(player),
    }))
    .sort((a, b) => a.score - b.score); // weakest first

  for (const slot of squadList) {
    if (transfers >= MAX_TRANSFERS) break;

    const { player, position, index } = slot;
    const sellingPrice = player.price;
    const availableBudget = budget + sellingPrice;

    // Find best replacement of same position not in squad, within budget, within team limit
    const candidates = state.allPlayers
      .filter(p =>
        p.position === player.position &&
        !squadIds.has(p.id) &&
        p.id !== player.id &&
        p.price <= availableBudget - 0.1 &&
        (teamCount[p.teamId] || 0) < MAX_PER_TEAM &&
        computePlayerScore(p) > slot.score * 1.1 // at least 10% better
      )
      .sort((a, b) => computePlayerScore(b) - computePlayerScore(a));

    if (candidates.length === 0) continue;

    const best = candidates[0];
    const costDiff = best.price - sellingPrice;

    // Record the transfer
    transferLog.push({
      out: player,
      in: best,
      position,
      costDiff: +costDiff.toFixed(1),
      timestamp: Date.now(),
    });

    // Make the swap
    state.squad[position][index] = best;
    squadIds.delete(player.id);
    squadIds.add(best.id);
    teamCount[player.teamId] = Math.max(0, (teamCount[player.teamId] || 1) - 1);
    teamCount[best.teamId] = (teamCount[best.teamId] || 0) + 1;
    budget -= costDiff;
    transfers++;
  }

  state.lastTransfers = transferLog;
  recalcBench();
  notify('squad');
  notify('transfers');
}


// ── Utilities ──
export function getTeamFixtures(teamId, n = 5) {
  return (state.fixtures[teamId] || []).slice(0, n);
}

export function getSquadCount() {
  let count = 0;
  ['GKP', 'DEF', 'MID', 'FWD'].forEach(pos => {
    state.squad[pos].forEach(p => { if (p) count++; });
  });
  return count;
}

export function getFilteredPlayers() {
  const { position, team, search, sort } = state.filters;
  let players = state.allPlayers;
  if (position !== 'ALL') players = players.filter(p => p.position === position);
  if (team !== 'ALL') players = players.filter(p => String(p.teamId) === String(team));
  if (search) {
    const q = search.toLowerCase();
    players = players.filter(p =>
      p.displayName.toLowerCase().includes(q) ||
      p.webName.toLowerCase().includes(q) ||
      p.teamName.toLowerCase().includes(q) ||
      p.teamShort.toLowerCase().includes(q)
    );
  }
  const sortFn = {
    points: (a, b) => b.totalPoints - a.totalPoints,
    form: (a, b) => b.form - a.form,
    price: (a, b) => b.price - a.price,
    selected: (a, b) => b.selectedByPercent - a.selectedByPercent,
  }[sort] || (() => 0);
  return [...players].sort(sortFn);
}
