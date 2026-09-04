/**
 * pitch.js — Pitch view renderer and interaction handler
 */

import {
  state, notify, getSlotPlayer, setSlotPlayer, removePlayer,
  swapSlots, getSquadPlayers, canAddPlayer, setCaptain, setViceCaptain,
  getTeamFixtures, isBenched, recalcBench, getPlayerGWPoints,
  getPlayerLiveStats, getTotalGWPoints, toggleChip, getActiveChip, getChipName
} from './data.js';
import { playerPhotoUrl } from './api.js';
import { showToast } from './app.js';
import { openPopup } from './popup.js';

// ── Main render ──
export function renderPitch() {
  renderStartingXI();
  renderBench();
  renderSquadTotalPoints();
  renderLiveFixtures();
  renderChipsWidget();
}

// ── Total GW points badge ──
export function renderSquadTotalPoints() {
  const el = document.getElementById('squad-gw-points');
  if (!el) return;
  const total = getTotalGWPoints();
  el.textContent = `GW${state.currentGW} Points: ${total}`;
}

// ── Live Fixtures ──
export function renderLiveFixtures() {
  const container = document.getElementById('live-fixtures-list');
  const badge = document.getElementById('live-gw-badge');
  if (!container || !badge) return;

  const currentFixtures = (state.rawFixtures || []).filter(f => f.event === state.currentGW);
  badge.textContent = state.currentGW;

  if (currentFixtures.length === 0) {
    container.innerHTML = '<div style="color:var(--clr-text3); font-size:0.8rem;">No live fixtures found</div>';
    return;
  }

  const teamMap = {};
  state.teams.forEach(t => { teamMap[t.id] = t; });

  const playerMap = {};
  state.allPlayers.forEach(p => { playerMap[p.id] = p.webName; });

  container.innerHTML = currentFixtures.map(f => {
    const home = teamMap[f.team_h];
    const away = teamMap[f.team_a];
    if (!home || !away) return '';

    let timeText = '';
    let timeClass = '';
    if (f.finished_provisional || f.finished) {
      timeText = 'FT';
    } else if (f.started) {
      timeText = f.minutes + "'";
      timeClass = 'live';
    } else {
      const d = new Date(f.kickoff_time);
      timeText = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    const homeScore = f.team_h_score !== null ? f.team_h_score : '-';
    const awayScore = f.team_a_score !== null ? f.team_a_score : '-';

    const buildStatList = (statsArr, identifier, isHome) => {
      const statObj = statsArr.find(s => s.identifier === identifier);
      if (!statObj) return '';
      const events = isHome ? statObj.h : statObj.a;
      if (!events || events.length === 0) return '';
      const icons = { goals_scored: '⚽', assists: '🎯', yellow_cards: '🟨', red_cards: '🟥' };
      return events.map(e => {
        const pName = playerMap[e.element] || 'Unknown';
        const valStr = e.value > 1 ? ` (x${e.value})` : '';
        return `<div class="stat-row ${isHome ? 'home' : 'away'}">
          <span class="stat-icon">${icons[identifier] || ''}</span>
          <span class="stat-name">${pName}${valStr}</span>
        </div>`;
      }).join('');
    };

    const stats = f.stats || [];
    const hGoals = buildStatList(stats, 'goals_scored', true);
    const aGoals = buildStatList(stats, 'goals_scored', false);
    const hAssists = buildStatList(stats, 'assists', true);
    const aAssists = buildStatList(stats, 'assists', false);
    const hYellow = buildStatList(stats, 'yellow_cards', true);
    const aYellow = buildStatList(stats, 'yellow_cards', false);
    const hRed = buildStatList(stats, 'red_cards', true);
    const aRed = buildStatList(stats, 'red_cards', false);

    const hasStats = hGoals || aGoals || hAssists || aAssists || hYellow || aYellow || hRed || aRed;

    return `
      <div class="live-fix-wrapper">
        <div class="live-fix-item" data-id="${f.id}">
          <div class="live-fix-team" style="color: ${state.teamColors[f.team_h] || 'inherit'}">${home.short_name}</div>
          <div class="live-fix-center">
            <div class="live-fix-score">${homeScore} - ${awayScore}</div>
            <div class="live-fix-time ${timeClass}">${timeText}</div>
          </div>
          <div class="live-fix-team" style="color: ${state.teamColors[f.team_a] || 'inherit'}">${away.short_name}</div>
        </div>
        ${hasStats ? `
        <div class="live-fix-details" id="details-${f.id}">
          <div class="live-fix-stats-col home">${hGoals}${hAssists}${hYellow}${hRed}</div>
          <div class="live-fix-stats-col away">${aGoals}${aAssists}${aYellow}${aRed}</div>
        </div>` : ''}
      </div>
    `;
  }).join('');

  container.removeEventListener('click', handleAccordionClick);
  container.addEventListener('click', handleAccordionClick);
}

function handleAccordionClick(e) {
  const header = e.target.closest('.live-fix-item');
  if (!header) return;
  const details = document.getElementById(`details-${header.dataset.id}`);
  if (details) details.classList.toggle('open');
}

// ── Starting XI ──
function renderStartingXI() {
  ['GKP', 'DEF', 'MID', 'FWD'].forEach(pos => {
    const row = document.getElementById(`row-${pos.toLowerCase()}`);
    if (!row) return;
    row.innerHTML = '';
    state.squad[pos].forEach((player, i) => {
      if (!isBenched(pos, i)) {
        row.appendChild(createPlayerSlot(pos, i, player, false));
      }
    });
  });
}

// ── Bench ──
function renderBench() {
  const benchRow = document.getElementById('bench-row');
  if (!benchRow) return;
  benchRow.innerHTML = '';

  const isBenchBoost = state.chips?.benchBoost?.active;
  if (isBenchBoost) {
    const banner = document.createElement('div');
    banner.className = 'bench-boost-banner';
    banner.innerHTML = '⚡ BENCH BOOST ACTIVE — Bench Points Count!';
    benchRow.appendChild(banner);
  }

  state.bench.forEach(b => {
    const player = getSlotPlayer(b.pos, b.index);
    benchRow.appendChild(createPlayerSlot(b.pos, b.index, player, true));
  });
}

// ── FPL Chips Widget Renderer ──
export function renderChipsWidget() {
  const grid = document.getElementById('chips-grid');
  const badge = document.getElementById('chips-active-badge');
  if (!grid || !badge) return;

  const activeChipKey = getActiveChip();
  if (activeChipKey) {
    badge.textContent = `⚡ ${getChipName(activeChipKey)} Active`;
    badge.className = 'chips-active-badge active';
  } else {
    badge.textContent = 'No active chip';
    badge.className = 'chips-active-badge';
  }

  const chipsDef = [
    { key: 'wildcard', icon: '🃏', name: 'Wildcard', desc: 'Unlimited free transfers for this GW' },
    { key: 'freeHit', icon: '🎯', name: 'Free Hit', desc: 'Unlimited transfers for 1 GW; squad resets next GW' },
    { key: 'tripleCaptain', icon: '👑', name: 'Triple Captain', desc: 'Captain earns 3x points instead of 2x' },
    { key: 'benchBoost', icon: '🚀', name: 'Bench Boost', desc: 'Bench player points count towards total score' },
  ];

  grid.innerHTML = chipsDef.map(chip => {
    const chipState = state.chips?.[chip.key] || { status: 'available', active: false };
    const isActive = chipState.active;
    const isUsed = chipState.status === 'used';

    let statusText = 'AVAILABLE';
    let statusClass = 'available';
    let btnText = 'Play Chip';
    let btnClass = 'play';

    if (isActive) {
      statusText = 'ACTIVE ⚡';
      statusClass = 'active';
      btnText = 'Cancel Chip';
      btnClass = 'cancel';
    } else if (isUsed) {
      statusText = 'USED';
      statusClass = 'used';
      btnText = 'Played';
      btnClass = 'used';
    }

    return `
      <div class="chip-card ${isActive ? 'active' : ''} ${isUsed ? 'disabled' : ''}">
        <div class="chip-head">
          <span class="chip-icon">${chip.icon}</span>
          <div class="chip-info">
            <div class="chip-title">${chip.name}</div>
            <div class="chip-desc">${chip.desc}</div>
          </div>
        </div>
        <div class="chip-footer">
          <span class="chip-status-pill ${statusClass}">${statusText}</span>
          <button class="chip-btn ${btnClass}" data-chip="${chip.key}" ${isUsed ? 'disabled' : ''}>
            ${btnText}
          </button>
        </div>
      </div>
    `;
  }).join('');

  grid.querySelectorAll('.chip-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const chipKey = btn.dataset.chip;
      const res = toggleChip(chipKey);
      if (res.ok) {
        showToast(res.message, res.active ? 'success' : 'info');
        renderPitch();
      } else {
        showToast(res.reason, 'error');
      }
    });
  });
}

// ── Slot builders ──
function buildFilledSlot(player, isBench) {
  const posClass = player.position.toLowerCase();
  const isCaptain = state.captainId === player.id;
  const isVice = state.viceCaptainId === player.id;
  const isTripleCaptain = state.chips?.tripleCaptain?.active;

  const captainBadge = isCaptain
    ? `<span class="captain-badge ${isTripleCaptain ? 'triple' : ''}" title="${isTripleCaptain ? 'Triple Captain (3x)' : 'Captain (2x)'}">${isTripleCaptain ? '3x' : 'C'}</span>` : '';
  const viceBadge = isVice
    ? '<span class="vice-badge" title="Vice-Captain">V</span>' : '';

  // Live GW points
  const gwPts = getPlayerGWPoints(player);
  const displayPts = isCaptain ? gwPts * (isTripleCaptain ? 3 : 2) : gwPts;
  const ptsSuffix = isCaptain ? (isTripleCaptain ? ' (C×3)' : ' (C×2)') : (isVice ? ' (VC)' : '');

  // Stats tooltip for live breakdown
  const live = getPlayerLiveStats(player);
  let statsTitle = `${player.webName} | £${player.price.toFixed(1)}m | Season: ${player.totalPoints}pts`;
  if (live) {
    const parts = [];
    if (live.goals) parts.push(`⚽ ${live.goals}`);
    if (live.assists) parts.push(`🎯 ${live.assists}`);
    if (live.cleanSheet) parts.push(`🧤 CS`);
    if (live.bonus) parts.push(`⭐ ${live.bonus} bonus`);
    if (live.yellowCards) parts.push(`🟨 ${live.yellowCards}`);
    if (live.redCards) parts.push(`🟥 ${live.redCards}`);
    if (live.minutes !== undefined) parts.push(`⏱ ${live.minutes}'`);
    if (parts.length) statsTitle += ' | ' + parts.join(' ');
  }

  const benchClass = isBench ? 'bench-player' : '';
  const gwBadgeClass = gwPts > 0 ? 'pts-positive' : (gwPts < 0 ? 'pts-negative' : '');

  return `
    <div class="player-photo" title="${statsTitle}">
      ${captainBadge}
      ${viceBadge}
      <button class="remove-btn" title="Remove Player" data-action="remove">×</button>
      <img src="${playerPhotoUrl(player.code)}" alt="${player.webName}" loading="lazy"
           onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
      <div class="fallback-shirt shirt-${posClass}" style="display:none">${player.teamShort}</div>
    </div>
    <div class="player-info ${benchClass}">
      <div class="player-name bg-${posClass}">${player.webName}</div>
      <div class="player-price-pts">
        <span class="player-price">£${player.price.toFixed(1)}</span>
        <span class="player-gw-pts ${gwBadgeClass}" title="GW${state.currentGW} points">${displayPts}pts${ptsSuffix}</span>
      </div>
    </div>
  `;
}

function buildEmptySlot(position, isBench) {
  const posLabel = position;
  return `
    <div class="slot-shirt empty">
      <div class="fallback-shirt">
        <span class="plus-icon">+</span>
      </div>
    </div>
    <div class="slot-name empty">${posLabel}</div>
    <div class="slot-meta"></div>
  `;
}

function createPlayerSlot(position, index, player, isBench) {
  const slot = document.createElement('div');
  slot.className = 'player-slot' + (isBench ? ' bench-slot' : '');
  slot.dataset.position = position;
  slot.dataset.index = index;
  slot.setAttribute('tabindex', '0');
  slot.setAttribute('role', 'button');

  // Highlight slot as swap source or selected
  const isSelected = state.selectedSlot &&
    state.selectedSlot.position === position &&
    state.selectedSlot.index === index;
  const isSwapSource = state._swapMode &&
    state._swapSource &&
    state._swapSource.position === position &&
    state._swapSource.index === index;
  if (isSelected || isSwapSource) slot.classList.add('selected');
  if (state._swapMode && !isSwapSource) slot.classList.add('swap-target');

  if (player) {
    slot.setAttribute('aria-label', `${player.displayName} - ${player.position} - £${player.price.toFixed(1)}m`);
    slot.innerHTML = buildFilledSlot(player, isBench);
  } else {
    slot.setAttribute('aria-label', `Empty ${position} slot - click to add player`);
    slot.innerHTML = buildEmptySlot(position, isBench);
  }

  slot.addEventListener('click', e => {
    // Remove button inside slot
    if (e.target.dataset.action === 'remove' && player) {
      e.stopPropagation();
      removePlayer(position, index);
      renderPitch();
      return;
    }
    handleSlotClick(position, index, player, slot);
  });

  slot.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleSlotClick(position, index, player, slot);
    }
  });

  return slot;
}

// ── Slot click ──
function handleSlotClick(position, index, player, slotEl) {
  // ── SWAP MODE: clicking any slot completes the swap ──
  if (state._swapMode && state._swapSource) {
    const src = state._swapSource;
    // Don't swap a slot with itself
    if (src.position === position && src.index === index) {
      // Cancel swap mode
      state._swapMode = false;
      state._swapSource = null;
      state.selectedSlot = null;
      renderPitch();
      showToast('Swap cancelled', 'info');
      return;
    }
    const result = swapSlots(src.position, src.index, position, index);
    state._swapMode = false;
    state._swapSource = null;
    state.selectedSlot = null;
    if (result.ok) {
      showToast('Players swapped!', 'success');
    } else {
      showToast(result.reason, 'error');
    }
    renderPitch();
    return;
  }

  // ── Normal mode: filled slot opens popup, empty slot selects ──
  if (player) {
    openPopup(player, position, index);
    return;
  }

  const prev = state.selectedSlot;
  state.selectedSlot = { position, index };
  renderPitch();
  notify('slotSelected');
}

// ── Add player to selected slot ──
export function addPlayerToSelectedSlot(player) {
  const slot = state.selectedSlot;
  if (!slot) {
    // Auto-find first empty slot matching this position
    const pos = player.position;
    const idx = state.squad[pos].findIndex(p => p === null);
    if (idx === -1) {
      showToast(`No empty ${pos} slots`, 'error');
      return;
    }
    state.selectedSlot = { position: pos, index: idx };
    addPlayerToSelectedSlot(player);
    return;
  }

  const { position, index } = slot;
  const check = canAddPlayer(player, position, index);
  if (!check.ok) {
    showToast(check.reason, 'error');
    return;
  }

  setSlotPlayer(position, index, player);
  state.selectedSlot = null;

  // Auto-assign captain/vice if first high-scorers
  if (!state.captainId || !state.viceCaptainId) {
    const starters = getSquadPlayers()
      .filter(x => !x.isBench)
      .sort((a, b) => b.player.totalPoints - a.player.totalPoints);
    if (!state.captainId && starters.length > 0) state.captainId = starters[0].player.id;
    if (!state.viceCaptainId && starters.length > 1) state.viceCaptainId = starters[1].player.id;
  }

  showToast(`${player.displayName} added!`, 'success');
  renderPitch();
  notify('squad');
}

// ── Swap mode ──
export function enterSwapMode(position, index) {
  state._swapMode = true;
  state._swapSource = { position, index };
  state.selectedSlot = { position, index };
  renderPitch();
  showToast('Click a slot to swap', 'info');
  notify('swapMode');
}

// ── Keyboard navigation ──
export function initPitchKeyboard() {
  document.getElementById('pitch')?.addEventListener('keydown', e => {
    const focused = document.activeElement;
    if (!focused?.classList.contains('player-slot')) return;
    const allSlots = Array.from(document.querySelectorAll('.player-slot'));
    const idx = allSlots.indexOf(focused);
    if (e.key === 'ArrowRight' && idx < allSlots.length - 1) { e.preventDefault(); allSlots[idx + 1].focus(); }
    else if (e.key === 'ArrowLeft' && idx > 0) { e.preventDefault(); allSlots[idx - 1].focus(); }
    else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = allSlots.slice(idx + 1).find(s => s.getBoundingClientRect().top > focused.getBoundingClientRect().top + 10);
      if (next) next.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = [...allSlots.slice(0, idx)].reverse().find(s => s.getBoundingClientRect().top < focused.getBoundingClientRect().top - 10);
      if (prev) prev.focus();
    } else if (e.key === 'Escape') {
      state.selectedSlot = null;
      state._swapMode = false;
      renderPitch();
      notify('slotDeselected');
    }
  });
}
