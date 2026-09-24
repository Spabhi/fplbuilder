// test_unified_improve_team.js
const assert = require('assert');

// Mock state
const state = { currentGW: 5 };

// Copy of computeProjectedPoints for standalone test validation
function computeProjectedPoints(player, nextFixtureOverride = null) {
  if (!player) return 0;

  const nextFix = nextFixtureOverride || (player.fdrNext && player.fdrNext.length > 0 ? player.fdrNext[0] : null);
  const fdr = nextFix ? (nextFix.fdr || 3) : 3;
  const isHome = nextFix ? !!nextFix.isHome : true;

  const ppg = player.pointsPerGame || 0;
  const form = player.form || 0;
  const epNext = player.epNext || 0;
  const xg = player.xg || 0;
  const xa = player.xa || 0;

  const formBaseline = (ppg * 0.35) + (form * 0.40) + (epNext * 0.25);
  const expectedThreatBonus = (xg * 2.2) + (xa * 1.8);

  let setPieceBonus = 0;
  if (player.penaltiesOrder === 1) setPieceBonus += 0.8;
  if (player.directFreesOrder === 1) setPieceBonus += 0.4;
  if (player.cornersOrder === 1) setPieceBonus += 0.4;

  const fdrImpact = (3 - fdr) * 0.8;
  const homeAdvantageBonus = isHome ? 0.7 : -0.3;

  const pos = player.position || 'UNK';
  let xgConcessionBonus = 0;

  if (pos === 'GKP' || pos === 'DEF') {
    const csProbability = isHome ? (6 - fdr) * 0.22 : (5 - fdr) * 0.18;
    xgConcessionBonus = csProbability * 2.2;
  } else {
    const attackConcessionMultiplier = (6 - fdr) * 0.35;
    xgConcessionBonus = attackConcessionMultiplier + expectedThreatBonus;
  }

  const tacticalPositionalBase = { GKP: 2.2, DEF: 2.5, MID: 3.0, FWD: 3.2 };
  const baseRating = tacticalPositionalBase[pos] || 2.5;

  const rawProjection = (formBaseline * 0.45) + baseRating + fdrImpact + homeAdvantageBonus + xgConcessionBonus + setPieceBonus;

  let availabilityMultiplier = 1.0;
  if (player.status === 'd') {
    availabilityMultiplier = player.chanceNextRound !== null ? (player.chanceNextRound / 100) : 0.5;
  } else if (player.status !== 'a') {
    availabilityMultiplier = 0.05;
  }

  let minutesFactor = 1.0;
  if (player.minutes !== undefined && player.minutes > 0) {
    const estGwCount = Math.max(1, state.currentGW || 1);
    const avgMins = player.minutes / estGwCount;
    if (avgMins < 60) {
      minutesFactor = Math.max(0.4, avgMins / 60);
    }
  }

  const projected = Math.max(0.5, Math.min(15.0, rawProjection * availabilityMultiplier * minutesFactor));
  return parseFloat(projected.toFixed(1));
}

function computePlayerScore(p) {
  if (!p) return 0;
  const proj1 = computeProjectedPoints(p);
  let projHorizon = proj1;
  if (p.fdrNext && p.fdrNext.length > 1) {
    const proj2 = computeProjectedPoints(p, p.fdrNext[1]);
    const proj3 = p.fdrNext[2] ? computeProjectedPoints(p, p.fdrNext[2]) : proj2;
    projHorizon = (proj1 * 0.50) + (proj2 * 0.30) + (proj3 * 0.20);
  }
  let captainBonus = 1.0;
  if (proj1 >= 6.0) captainBonus = 1.20;
  else if (proj1 >= 5.0) captainBonus = 1.10;

  const price = Math.max(3.8, p.price || 4.5);
  const ppm = (projHorizon / price) * 10;
  const overallScore = ((projHorizon * captainBonus) * 10 * 0.70) + (ppm * 0.30);
  return parseFloat(overallScore.toFixed(2));
}

// Test cases
const palmerNoSetPiece = { id: 1, position: 'MID', pointsPerGame: 7.5, form: 8.0, epNext: 7.0, xg: 0.5, xa: 0.4, status: 'a', minutes: 450, price: 10.5 };
const palmerWithPenalties = { id: 1, position: 'MID', pointsPerGame: 7.5, form: 8.0, epNext: 7.0, xg: 0.5, xa: 0.4, status: 'a', minutes: 450, price: 10.5, penaltiesOrder: 1, directFreesOrder: 1 };

const projBasic = computeProjectedPoints(palmerNoSetPiece);
const projSetPiece = computeProjectedPoints(palmerWithPenalties);

assert(projSetPiece > projBasic, 'Set-piece taker should get a projected points boost');

const scorePalmer = computePlayerScore(palmerWithPenalties);
console.log(`Palmer Projected Pts: ${projSetPiece}, Composite Score: ${scorePalmer}`);

assert(scorePalmer > 40, 'Composite score should be high for top premium midfielder');

console.log('Unified projected points & composite player score tests passed successfully!');
