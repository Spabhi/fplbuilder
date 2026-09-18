// test_projected_points_ui.js
const assert = require('assert');

// Mock data & functions
const player1 = { id: 1, web_name: 'Haaland', form: '8.5', projected_points: 7.2, event_points: 12 };
const player2 = { id: 2, web_name: 'Salah', form: '7.0', projected_points: 6.8, event_points: 10 };

function computeProjectedPoints(p) {
  if (p.projected_points !== undefined && p.projected_points !== null) return p.projected_points;
  const base = parseFloat(p.form || 3.0);
  return parseFloat((base * 0.95 + 1.2).toFixed(1));
}

function isGWFinished(eventObj) {
  if (!eventObj) return false;
  return !!eventObj.finished;
}

const eventOngoing = { id: 2, is_current: true, finished: false };
const eventFinished = { id: 1, is_current: false, finished: true };

assert.strictEqual(computeProjectedPoints(player1), 7.2, 'Haaland projected points should be 7.2');
assert.strictEqual(isGWFinished(eventOngoing), false, 'Ongoing GW should be false');
assert.strictEqual(isGWFinished(eventFinished), true, 'Finished GW should be true');

console.log('Projected points logic tests passed successfully!');
