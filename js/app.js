/**
 * app.js — Bootstrap and application coordinator
 * Entry point for the FPL Team Builder app.
 */

import {
  fetchBootstrap, fetchFixtures, fetchLivePoints,
  buildPlayers, buildTeamFixtures, buildTeamColors
} from './api.js';
import {
  state, subscribe, notify, getRemainingBudget, getSquadCount, getSquadPlayers, autoFill, resetSquad, loadSquadFromLocalStorage
} from './data.js';
import { renderPitch, initPitchKeyboard, addPlayerToSelectedSlot, renderLiveFixtures, renderSquadTotalPoints } from './pitch.js';
import { initPanel, renderPlayerList, filterToPosition, updatePanelHeader } from './panel.js';
import { renderFixturesGrid, renderStatsTab, initStatsTab } from './fixtures.js';
import { initPopup } from './popup.js';
import { initWidgets } from './widgets.js';

// ── Toast system ──
export function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
  toast.innerHTML = `<span>${icons[type] || ''}</span><span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(40px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ── Header UI update ──
function updateHeader() {
  const remaining = getRemainingBudget();
  const budgetEl = document.getElementById('budget-value');
  if (budgetEl) {
    budgetEl.textContent = `£${remaining.toFixed(1)}m`;
    budgetEl.classList.remove('warning', 'danger');
    if (remaining < 0) budgetEl.classList.add('danger');
    else if (remaining < 5) budgetEl.classList.add('warning');
  }

  const countEl = document.getElementById('count-value');
  if (countEl) countEl.textContent = getSquadCount();

  const gwEl = document.getElementById('gw-badge');
  if (gwEl && state.currentGW) gwEl.textContent = `GW${state.currentGW}`;

  // Dynamic auto-pick button label
  const autoBtn = document.getElementById('btn-auto-fill');
  if (autoBtn) {
    autoBtn.textContent = getSquadCount() >= 5 ? '🔄 Improve Team' : '✨ Auto Pick';
  }
}

// ── Tabs ──
function initTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      document.querySelectorAll('.tab-btn').forEach(b => {
        b.classList.remove('active');
        b.setAttribute('aria-selected', 'false');
      });
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      btn.setAttribute('aria-selected', 'true');
      document.getElementById(`panel-${tab}`)?.classList.add('active');
      if (tab === 'fixtures') renderFixturesGrid();
      if (tab === 'stats') renderStatsTab();
    });
  });
}

// ── State subscriptions ──
function initSubscriptions() {
  subscribe((event) => {
    if (event === 'squad' || event === 'update' || event === 'chips') {
      updateHeader();
      renderPlayerList();
      renderSquadTotalPoints();
      renderSquadStatus();
    }
    if (event === 'transfers') {
      renderTransferLog();
    }
    if (event === 'slotSelected') {
      const slot = state.selectedSlot;
      updatePanelHeader(slot);
      if (slot) filterToPosition(slot.position, slot.index);
    }
    if (event === 'slotDeselected') {
      updatePanelHeader(null);
    }
  });
}

// ── Transfer Log renderer ──
function renderTransferLog() {
  const container = document.getElementById('transfer-log-list');
  if (!container) return;
  const transfers = state.lastTransfers || [];

  if (transfers.length === 0) {
    container.innerHTML = '<div class="transfer-log-empty">No transfers yet — click <strong>Improve Team</strong></div>';
    return;
  }

  const posColors = { GKP: 'var(--clr-gkp)', DEF: 'var(--clr-def)', MID: 'var(--clr-mid)', FWD: 'var(--clr-fwd)' };

  container.innerHTML = transfers.map((t, i) => {
    const costSign = t.costDiff > 0 ? `+£${t.costDiff.toFixed(1)}m` : t.costDiff < 0 ? `−£${Math.abs(t.costDiff).toFixed(1)}m` : 'Same price';
    const costClass = t.costDiff > 0 ? 'cost-up' : t.costDiff < 0 ? 'cost-down' : '';
    const posColor = posColors[t.position] || '#fff';
    return `
      <div class="transfer-row">
        <div class="transfer-num">${i + 1}</div>
        <div class="transfer-pos-badge" style="background:${posColor}">${t.position}</div>
        <div class="transfer-players">
          <div class="transfer-out">⬆ ${t.out.webName} <span class="transfer-team-out">${t.out.teamShort}</span></div>
          <div class="transfer-in">⬇ ${t.in.webName} <span class="transfer-team-in">${t.in.teamShort}</span></div>
        </div>
        <div class="transfer-cost ${costClass}">${costSign}</div>
      </div>`;
  }).join('');
}

// ── Player Status & Injury Widget Renderer ──
function renderSquadStatus() {
  const container = document.getElementById('squad-status-list');
  const summaryBadge = document.getElementById('squad-status-summary');
  if (!container || !summaryBadge) return;

  const squad = getSquadPlayers();
  if (squad.length === 0) {
    container.innerHTML = '<div class="squad-status-empty">Add players to your squad to monitor injuries & availability.</div>';
    summaryBadge.textContent = '0/15 Squad';
    summaryBadge.className = 'squad-status-summary';
    return;
  }

  let availCount = 0;
  let doubtCount = 0;
  let unavailCount = 0;

  const posColors = { GKP: 'var(--clr-gkp)', DEF: 'var(--clr-def)', MID: 'var(--clr-mid)', FWD: 'var(--clr-fwd)' };

  const rowsHtml = squad.map(({ player, isBench }) => {
    const status = player.status;
    let statusIcon = '🟢';
    let statusLabel = 'Available';
    let statusClass = 'avail';

    if (status === 'd') {
      doubtCount++;
      statusIcon = '🟡';
      statusLabel = player.chanceNextRound !== null ? `${player.chanceNextRound}% Chance` : 'Doubtful';
      statusClass = 'doubt';
    } else if (status !== 'a') {
      unavailCount++;
      statusIcon = '🔴';
      statusLabel = status === 's' ? 'Suspended' : 'Injured/Out';
      statusClass = 'unavail';
    } else {
      availCount++;
    }

    const newsText = player.news ? player.news : (status === 'a' ? 'Fully fit' : 'No news details');
    const posColor = posColors[player.position] || '#fff';

    return `
      <div class="squad-status-row ${statusClass}">
        <div class="status-player-head">
          <span class="status-pos-badge" style="background:${posColor}">${player.position}</span>
          <span class="status-player-name">${player.webName} <span class="status-team-short">(${player.teamShort})</span></span>
          ${isBench ? '<span class="status-bench-tag">BENCH</span>' : ''}
        </div>
        <div class="status-details">
          <span class="status-badge-pill ${statusClass}">${statusIcon} ${statusLabel}</span>
          <span class="status-news-text">${newsText}</span>
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = rowsHtml;

  if (unavailCount > 0) {
    summaryBadge.textContent = `${unavailCount} Out · ${doubtCount} Doubt · ${availCount} Fit`;
    summaryBadge.className = 'squad-status-summary danger';
  } else if (doubtCount > 0) {
    summaryBadge.textContent = `${doubtCount} Doubt · ${availCount} Fit`;
    summaryBadge.className = 'squad-status-summary warning';
  } else {
    summaryBadge.textContent = `${availCount}/15 All Fit 🟢`;
    summaryBadge.className = 'squad-status-summary success';
  }
}

// ── Live points fetcher + poller ──
async function fetchAndApplyLivePoints() {
  try {
    const liveMap = await fetchLivePoints(state.currentGW);
    state.livePoints = liveMap;
    renderPitch();
    renderSquadTotalPoints();
  } catch (e) {
    console.warn('Failed to fetch live GW points:', e);
  }
}

function initLivePolling() {
  // Fetch live points every 2 minutes
  fetchAndApplyLivePoints(); // initial fetch
  setInterval(fetchAndApplyLivePoints, 2 * 60 * 1000);

  // Refresh fixture scores every 5 minutes
  setInterval(async () => {
    try {
      const fixtures = await fetchFixtures();
      state.rawFixtures = fixtures;
      renderLiveFixtures();
    } catch (e) {
      console.warn('Failed to poll live fixtures', e);
    }
  }, 5 * 60 * 1000);
}

// ── Main bootstrap ──
async function main() {
  try {
    const [bootstrap, fixtures] = await Promise.all([
      fetchBootstrap(),
      fetchFixtures(),
    ]);

    state.teams = bootstrap.teams || [];
    state.teamColors = buildTeamColors();
    state.allPlayers = buildPlayers(
      bootstrap.elements || [],
      bootstrap.teams || [],
      bootstrap.element_types || []
    );
    state.fixtures = buildTeamFixtures(fixtures, bootstrap.teams || []);
    state.rawFixtures = fixtures;

    // Determine current GW
    const events = bootstrap.events || [];
    let currentEvent = events.find(e => e.is_current) || events.find(e => e.id === 1);
    const nextEvent = events.find(e => e.is_next);

    if (nextEvent) {
      const hoursUntilDeadline = (new Date(nextEvent.deadline_time) - new Date()) / 3600000;
      if (hoursUntilDeadline <= 24) currentEvent = nextEvent;
    }

    state.currentGW = currentEvent?.id || 1;
    state.nextGW = nextEvent?.id || state.currentGW + 1;

    // Assign FDR to players
    state.allPlayers.forEach(player => {
      player.fdrNext = (state.fixtures[player.teamId] || []).slice(0, 5);
    });

    // Load persisted squad from localStorage if available
    loadSquadFromLocalStorage();

    // Initialize UI modules
    initTabs();
    initSubscriptions();
    initPitchKeyboard();
    initPanel();
    initPopup();
    initStatsTab();
    initWidgets();

    // Auto Pick / Improve Team button
    const autoBtn = document.getElementById('btn-auto-fill');
    if (autoBtn) {
      autoBtn.addEventListener('click', () => {
        const count = getSquadCount();
        autoFill();
        const made = state.lastTransfers?.length || 0;
        const isUnlimited = state.chips?.wildcard?.active || state.chips?.freeHit?.active;
        let msg = '';
        if (count >= 5) {
          if (made > 0) {
            if (isUnlimited) {
              msg = `⚡ Unlimited Overhaul: ${made} transfer${made > 1 ? 's' : ''} made!`;
            } else {
              const t = state.lastTransfers[0];
              msg = `Weekly transfer: ${t.out.webName} (${t.out.teamShort}) ➔ ${t.in.webName} (${t.in.teamShort})`;
            }
          } else {
            msg = 'No beneficial transfer found within budget & 3-player team limit';
          }
        } else {
          msg = 'Squad auto-filled!';
        }
        showToast(msg, made > 0 || count < 5 ? 'success' : 'info');
        renderPitch();
        updateHeader();
        renderTransferLog();
      });
    }

    document.getElementById('btn-reset')?.addEventListener('click', () => {
      if (confirm('Reset your squad?')) {
        resetSquad();
        state.lastTransfers = [];
        showToast('Squad reset', 'info');
        renderPitch();
        renderPlayerList();
        renderTransferLog();
        updatePanelHeader(null);
        updateHeader();
      }
    });

    document.getElementById('transfer-log-clear')?.addEventListener('click', () => {
      state.lastTransfers = [];
      renderTransferLog();
    });

    // Initial render
    renderPitch();
    renderPlayerList();
    updateHeader();
    renderSquadStatus();

    // Start live polling (after initial render)
    initLivePolling();

    // Hide loading
    document.getElementById('loading-screen')?.classList.add('hidden');
    document.getElementById('app')?.classList.remove('hidden');

    showToast(`${state.allPlayers.length} players loaded · GW${state.currentGW}`, 'success');

  } catch (err) {
    console.error('Failed to load FPL data:', err);
    const loadingText = document.querySelector('.loading-text');
    if (loadingText) {
      loadingText.textContent = '⚠ Failed to load data. Please check your connection and refresh.';
      loadingText.style.color = 'var(--clr-red)';
    }
    const spinner = document.querySelector('.loading-spinner');
    if (spinner) spinner.style.display = 'none';
  }
}

main();
