/**
 * panel.js — Player selection panel with search, filters, and list rendering
 */

import {
  state, getFilteredPlayers, getSquadPlayerIds, getTeamFixtures, notify
} from './data.js';
import { addPlayerToSelectedSlot } from './pitch.js';

const PANEL_PAGE_SIZE = 80;

/** Initialize the player panel UI */
export function initPanel() {
  initSearch();
  initFilters();
  initSorting();
  initTeamFilter();
  initKeyboardNav();
}

function initSearch() {
  const searchEl = document.getElementById('player-search');
  if (!searchEl) return;

  let debounce;
  searchEl.addEventListener('input', (e) => {
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      state.filters.search = e.target.value.trim();
      renderPlayerList();
    }, 150);
  });

  // Focus search with / key
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && document.activeElement.tagName !== 'INPUT') {
      e.preventDefault();
      searchEl.focus();
      searchEl.select();
    }
    if (e.key === 'Escape' && document.activeElement === searchEl) {
      searchEl.value = '';
      state.filters.search = '';
      renderPlayerList();
      searchEl.blur();
    }
  });
}

function initFilters() {
  document.querySelectorAll('.filter-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-tab').forEach(b => {
        b.classList.remove('active');
        b.setAttribute('aria-selected', 'false');
      });
      btn.classList.add('active');
      btn.setAttribute('aria-selected', 'true');
      state.filters.position = btn.dataset.pos;
      renderPlayerList();
    });
  });
}

function initSorting() {
  const sortEl = document.getElementById('sort-filter');
  if (!sortEl) return;
  sortEl.addEventListener('change', () => {
    state.filters.sort = sortEl.value;
    renderPlayerList();
  });
}

function initTeamFilter() {
  const teamEl = document.getElementById('team-filter');
  if (!teamEl) return;

  // Populate team options
  const teams = [...state.teams].sort((a, b) => a.name.localeCompare(b.name));
  teams.forEach(team => {
    const opt = document.createElement('option');
    opt.value = team.id;
    opt.textContent = team.name;
    teamEl.appendChild(opt);
  });

  teamEl.addEventListener('change', () => {
    state.filters.team = teamEl.value;
    renderPlayerList();
  });
}

/** Filter to a specific position (called from pitch slot click) */
export function filterToPosition(position, benchIndex) {
  // Determine effective position filter
  let effectivePos = position;
  if (position === 'bench') {
    effectivePos = (benchIndex === 0) ? 'GKP' : 'ALL';
  }

  const tabs = document.querySelectorAll('.filter-tab');
  tabs.forEach(tab => {
    const isActive = tab.dataset.pos === effectivePos;
    tab.classList.toggle('active', isActive);
    tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
  });

  state.filters.position = effectivePos;
  renderPlayerList();
}

/** Update panel header based on selected slot */
export function updatePanelHeader(slot) {
  const title = document.getElementById('panel-title');
  const subtitle = document.getElementById('panel-subtitle');
  if (!title || !subtitle) return;

  if (!slot) {
    title.textContent = 'Player Panel';
    subtitle.textContent = 'Click a pitch slot to select a player';
    return;
  }

  const posLabels = {
    GKP: 'Goalkeeper', DEF: 'Defender', MID: 'Midfielder', FWD: 'Forward',
  };

  let label;
  if (slot.position === 'bench') {
    label = slot.index === 0 ? 'Bench Goalkeeper' : 'Bench Player';
  } else {
    label = posLabels[slot.position] || 'Player';
  }

  title.textContent = `Select ${label}`;
  subtitle.textContent = 'Click a player below to add to your squad';
}

/** Render the player list */
export function renderPlayerList() {
  const listEl = document.getElementById('player-list');
  if (!listEl) return;

  const players = getFilteredPlayers();
  const squadIds = getSquadPlayerIds();

  if (players.length === 0) {
    listEl.innerHTML = `
      <div class="list-empty">
        <div class="list-empty-icon">🔍</div>
        <div class="list-empty-text">No players found.<br>Try adjusting your filters.</div>
      </div>
    `;
    return;
  }

  // Render top N players (virtual scroll would be complex; limit for performance)
  const toRender = players.slice(0, PANEL_PAGE_SIZE);
  const fragment = document.createDocumentFragment();

  toRender.forEach((player, i) => {
    const row = buildPlayerRow(player, squadIds.has(player.id));
    fragment.appendChild(row);
  });

  listEl.innerHTML = '';
  listEl.appendChild(fragment);

  if (players.length > PANEL_PAGE_SIZE) {
    const more = document.createElement('div');
    more.className = 'list-empty';
    more.style.padding = '12px 16px';
    more.style.fontSize = '0.78rem';
    more.style.color = 'var(--clr-text2)';
    more.textContent = `Showing ${PANEL_PAGE_SIZE} of ${players.length} players. Refine filters to see more.`;
    listEl.appendChild(more);
  }
}

function buildPlayerRow(player, isInSquad) {
  const row = document.createElement('div');
  row.className = 'player-item' + (isInSquad ? ' in-squad' : '') + (player.status !== 'a' ? ' unavailable' : '');
  row.setAttribute('role', 'option');
  row.setAttribute('tabindex', '0');
  row.setAttribute('aria-selected', isInSquad ? 'true' : 'false');
  row.setAttribute('aria-label', `${player.displayName}, ${player.teamName}, ${player.position}, £${player.price}m, ${player.totalPoints} points`);
  row.dataset.playerId = player.id;

  const posLower = player.position.toLowerCase();
  const availClass = player.availabilityClass;

  // FDR for next 3 fixtures
  const fixes = getTeamFixtures(player.teamId, 3);
  const fdrPips = fixes.map(f =>
    `<span class="fdr-pip fdr-${f.fdr}" title="GW${f.gw}: ${f.opponentName} (${f.isHome ? 'H' : 'A'}) FDR${f.fdr}">${f.fdr}</span>`
  ).join('');

  const newsEl = player.news ? `<span class="pi-news" title="${player.news}">⚠</span>` : '';

  row.innerHTML = `
    <div class="pi-info">
      <div class="pi-name-row">
        <span class="pi-name">${player.displayName}</span>
        <span class="pi-pos-badge ${posLower}">${player.position}</span>
      </div>
      <div class="pi-meta">
        <span class="pi-availability ${availClass}" title="${availabilityTitle(player.status)}"></span>
        <span class="pi-team">${player.teamShort}</span>
        <span style="color:var(--clr-text3)">·</span>
        <span style="color:var(--clr-text2);font-size:0.68rem">${player.selectedByPercent.toFixed(1)}%</span>
        ${newsEl}
      </div>
    </div>
    <div class="pi-price">£${player.price.toFixed(1)}</div>
    <div class="pi-points">${player.totalPoints}</div>
    <div class="fdr-mini">${fdrPips}</div>
  `;

  row.addEventListener('click', () => {
    if (isInSquad) return; // already in squad
    addPlayerToSelectedSlot(player);
    renderPlayerList(); // re-render to update in-squad state
  });

  row.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !isInSquad) {
      addPlayerToSelectedSlot(player);
      renderPlayerList();
    }
  });

  return row;
}

function availabilityTitle(status) {
  if (status === 'a') return 'Available';
  if (status === 'd') return 'Doubtful';
  if (status === 'i') return 'Injured';
  if (status === 'n') return 'Not available';
  if (status === 's') return 'Suspended';
  return 'Unknown';
}

/** Keyboard navigation in player list */
function initKeyboardNav() {
  const listEl = document.getElementById('player-list');
  if (!listEl) return;

  listEl.addEventListener('keydown', (e) => {
    const items = Array.from(listEl.querySelectorAll('.player-item'));
    const focused = document.activeElement;
    const idx = items.indexOf(focused);

    if (e.key === 'ArrowDown' && idx < items.length - 1) {
      e.preventDefault();
      items[idx + 1].focus();
    } else if (e.key === 'ArrowUp' && idx > 0) {
      e.preventDefault();
      items[idx - 1].focus();
    } else if (e.key === 'Tab') {
      // Allow natural tab
    }
  });
}
