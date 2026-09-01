/**
 * popup.js — Player action popup (Captain/VC/Swap/Remove + Points Breakdown)
 */

import {
  state, removePlayer, setCaptain, setViceCaptain, getTeamFixtures, notify,
  getPlayerGWPoints, getPlayerLiveStats
} from './data.js';
import { renderPitch, enterSwapMode } from './pitch.js';
import { showToast } from './app.js';
import { renderTeamFixturesList } from './fixtures.js';

let _currentSlot = null;

// ── Points breakdown per position ──
const POINTS_PER = {
  GKP: { goal: 10, cs: 4, savesForPoint: 3, penSaved: 5 },
  DEF: { goal: 6,  cs: 4, savesForPoint: 0, penSaved: 0 },
  MID: { goal: 5,  cs: 1, savesForPoint: 0, penSaved: 0 },
  FWD: { goal: 4,  cs: 0, savesForPoint: 0, penSaved: 0 },
};

function buildPointsBreakdown(player) {
  const pos = player.position;
  const pp = POINTS_PER[pos] || POINTS_PER.FWD;

  const rows = [];

  // Appearances (rough estimate: ~2pts per start, not tracked precisely without per-game data)
  const appPts = Math.round((player.totalPoints
    - player.goals * pp.goal
    - player.assists * 3
    - player.cleanSheets * pp.cs
    - Math.floor(player.saves / (pp.savesForPoint || 99)) * 1
    - player.bonus
    + player.yellowCards * 1
    + player.redCards * 3
    + player.ownGoals * 2
    + player.penaltiesMissed * 2
    - player.penaltiesSaved * pp.penSaved
  ));

  // Build meaningful rows
  const breakdown = [];

  if (player.goals > 0) {
    const pts = player.goals * pp.goal;
    breakdown.push({ label: `⚽ Goals (${player.goals})`, pts, type: 'positive' });
  }
  if (player.assists > 0) {
    const pts = player.assists * 3;
    breakdown.push({ label: `🅰️ Assists (${player.assists})`, pts, type: 'positive' });
  }
  if (player.cleanSheets > 0 && pp.cs > 0) {
    const pts = player.cleanSheets * pp.cs;
    breakdown.push({ label: `🔒 Clean Sheets (${player.cleanSheets})`, pts, type: 'positive' });
  }
  if (pos === 'GKP' && player.saves > 0) {
    const savePts = Math.floor(player.saves / 3);
    breakdown.push({ label: `🧤 Saves (${player.saves})`, pts: savePts, type: 'positive' });
  }
  if (player.penaltiesSaved > 0) {
    breakdown.push({ label: `🛡️ Pen Saved (${player.penaltiesSaved})`, pts: player.penaltiesSaved * 5, type: 'positive' });
  }
  if (player.bonus > 0) {
    breakdown.push({ label: `⭐ Bonus Points`, pts: player.bonus, type: 'positive' });
  }
  if (player.yellowCards > 0) {
    breakdown.push({ label: `🟨 Yellow Cards (${player.yellowCards})`, pts: -player.yellowCards, type: 'negative' });
  }
  if (player.redCards > 0) {
    breakdown.push({ label: `🟥 Red Cards (${player.redCards})`, pts: -player.redCards * 3, type: 'negative' });
  }
  if (player.ownGoals > 0) {
    breakdown.push({ label: `⚠️ Own Goals (${player.ownGoals})`, pts: -player.ownGoals * 2, type: 'negative' });
  }
  if (player.penaltiesMissed > 0) {
    breakdown.push({ label: `❌ Pens Missed (${player.penaltiesMissed})`, pts: -player.penaltiesMissed * 2, type: 'negative' });
  }

  // Appearance / minutes (total minus all accounted-for points)
  const accountedPts = breakdown.reduce((s, r) => s + r.pts, 0);
  const appearancePts = player.totalPoints - accountedPts;
  if (appearancePts !== 0) {
    breakdown.unshift({ label: `⏱️ Appearances / Mins`, pts: appearancePts, type: appearancePts >= 0 ? 'neutral' : 'negative' });
  }

  return breakdown;
}

export function openPopup(player, position, index) {
  _currentSlot = { player, position, index };

  const popup = document.getElementById('player-popup');
  popup.classList.remove('hidden');

  // ── Header ──
  const posClass = player.position.toLowerCase();
  document.getElementById('popup-shirt').innerHTML =
    `<div class="fallback-shirt shirt-${posClass}" style="width:44px;height:52px;border-radius:6px 6px 0 0;clip-path:polygon(20% 0%, 80% 0%, 100% 20%, 100% 100%, 0% 100%, 0% 20%);display:flex;align-items:center;justify-content:center;font-size:0.7rem;font-weight:800;color:rgba(255,255,255,0.95)">${player.teamShort}</div>`;
  document.getElementById('popup-player-name').textContent = player.displayName;
  document.getElementById('popup-player-meta').textContent =
    `${player.teamName} · ${player.position} · £${player.price.toFixed(1)}m`;

  // ── GW points badge (live) ──
  const gwPts = getPlayerGWPoints(player);
  const live = getPlayerLiveStats(player);
  const isCapt = state.captainId === player.id;
  let gwBadge = document.getElementById('popup-gw-pts');
  if (!gwBadge) {
    gwBadge = document.createElement('div');
    gwBadge.id = 'popup-gw-pts';
    gwBadge.className = 'popup-gw-pts-badge';
    document.getElementById('popup-player-name').insertAdjacentElement('afterend', gwBadge);
  }
  gwBadge.innerHTML = `GW${state.currentGW}: <strong>${isCapt ? gwPts * 2 : gwPts} pts</strong>${isCapt ? ' <span class="capt-tag">C×2</span>' : ''}`;
  if (live) {
    const bits = [];
    if (live.minutes !== undefined) bits.push(`⏱ ${live.minutes}'`);
    if (live.goals) bits.push(`⚽ ${live.goals}`);
    if (live.assists) bits.push(`🎯 ${live.assists}`);
    if (live.cleanSheet) bits.push(`🧤 CS`);
    if (live.bonus) bits.push(`⭐ ${live.bonus}B`);
    if (live.yellowCards) bits.push(`🟨`);
    if (live.redCards) bits.push(`🟥`);
    if (bits.length) gwBadge.innerHTML += `<span class="gw-live-bits">${bits.join(' ')}</span>`;
  }

  // ── Season stats grid ──
  document.getElementById('popup-stats').innerHTML = `
    <div class="popup-stat">
      <div class="popup-stat-value highlight">${player.totalPoints}</div>
      <div class="popup-stat-label">Pts</div>
    </div>
    <div class="popup-stat">
      <div class="popup-stat-value">£${player.price.toFixed(1)}</div>
      <div class="popup-stat-label">Price</div>
    </div>
    <div class="popup-stat">
      <div class="popup-stat-value">${player.form.toFixed(1)}</div>
      <div class="popup-stat-label">Form</div>
    </div>
    <div class="popup-stat">
      <div class="popup-stat-value">${player.epNext.toFixed(1)}</div>
      <div class="popup-stat-label">xPts</div>
    </div>
    <div class="popup-stat">
      <div class="popup-stat-value">${player.goals}</div>
      <div class="popup-stat-label">Goals</div>
    </div>
    <div class="popup-stat">
      <div class="popup-stat-value">${player.assists}</div>
      <div class="popup-stat-label">Assists</div>
    </div>
    <div class="popup-stat">
      <div class="popup-stat-value">${player.cleanSheets}</div>
      <div class="popup-stat-label">CS</div>
    </div>
    <div class="popup-stat">
      <div class="popup-stat-value">${player.selectedByPercent.toFixed(1)}%</div>
      <div class="popup-stat-label">Sel%</div>
    </div>
  `;

  // ── Captain / Vice buttons ──
  const captainBtn = document.getElementById('popup-captain');
  const viceBtn    = document.getElementById('popup-vice');
  const isCaptain  = state.captainId    === player.id;
  const isVice     = state.viceCaptainId === player.id;
  captainBtn.textContent = isCaptain ? '👑 Remove Captain'   : '👑 Set Captain';
  viceBtn.textContent    = isVice    ? '⭐ Remove Vice-C'    : '⭐ Set Vice-Captain';

  // ── Fixtures section ──
  const fixContainer = document.getElementById('popup-fixtures');
  fixContainer.innerHTML = `
    <div class="popup-section-title">📅 Next Fixtures</div>
    <div class="popup-fix-list" id="popup-fix-list"></div>
  `;
  renderTeamFixturesList(player.teamId, 'popup-fix-list', 5);

  // Availability news
  if (player.news) {
    fixContainer.innerHTML += `<div class="popup-news">⚠ ${player.news}</div>`;
  }

  // ── Points breakdown section ──
  const ptsBd = document.getElementById('popup-points-breakdown');
  const rows  = buildPointsBreakdown(player);

  if (rows.length > 0) {
    const rowsHtml = rows.map(r => {
      const sign = r.pts >= 0 ? '+' : '';
      return `
        <div class="pts-bd-row ${r.type}">
          <span class="pts-bd-label">${r.label}</span>
          <span class="pts-bd-value">${sign}${r.pts} pts</span>
        </div>
      `;
    }).join('');

    ptsBd.innerHTML = `
      <div class="popup-section-title">📊 Points Breakdown</div>
      <div class="pts-bd-list">${rowsHtml}</div>
      <div class="pts-bd-total">
        <span>Season Total</span>
        <span class="pts-total-value">${player.totalPoints} pts</span>
      </div>
    `;
  } else {
    ptsBd.innerHTML = '';
  }

  document.getElementById('popup-close').focus();
}

export function closePopup() {
  document.getElementById('player-popup').classList.add('hidden');
  _currentSlot = null;
}

export function initPopup() {
  document.getElementById('popup-close')?.addEventListener('click', closePopup);

  document.getElementById('popup-captain')?.addEventListener('click', () => {
    if (!_currentSlot) return;
    const { player } = _currentSlot;
    if (state.captainId === player.id) {
      state.captainId = null;
      showToast(`${player.displayName} captain removed`, 'info');
    } else {
      setCaptain(player.id);
      showToast(`${player.displayName} set as Captain 👑`, 'success');
    }
    closePopup();
    renderPitch();
  });

  document.getElementById('popup-vice')?.addEventListener('click', () => {
    if (!_currentSlot) return;
    const { player } = _currentSlot;
    if (state.viceCaptainId === player.id) {
      state.viceCaptainId = null;
      showToast(`${player.displayName} vice-captain removed`, 'info');
    } else {
      setViceCaptain(player.id);
      showToast(`${player.displayName} set as Vice-Captain ⭐`, 'success');
    }
    closePopup();
    renderPitch();
  });

  document.getElementById('popup-swap')?.addEventListener('click', () => {
    if (!_currentSlot) return;
    const { position, index } = _currentSlot;
    closePopup();
    enterSwapMode(position, index);
  });

  document.getElementById('popup-remove')?.addEventListener('click', () => {
    if (!_currentSlot) return;
    const { player, position, index } = _currentSlot;
    removePlayer(position, index);
    showToast(`${player.displayName} removed`, 'warning');
    closePopup();
    renderPitch();
    notify('squad');
  });

  // Close on Escape or backdrop click
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closePopup(); });
  document.getElementById('player-popup')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) closePopup();
  });
}
