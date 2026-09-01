/**
 * fixtures.js — Fixture Difficulty Rating grid and per-team fixtures
 */

import { state, getTeamFixtures } from './data.js';

const NUM_GWS = 5;

/** Render the full FDR grid for all 20 teams */
export function renderFixturesGrid() {
  const grid = document.getElementById('fixtures-grid');
  if (!grid) return;

  const teams = [...state.teams].sort((a, b) => a.name.localeCompare(b.name));

  // Find the next 5 upcoming gameweeks
  const gwList = getUpcomingGWs(NUM_GWS);

  grid.innerHTML = '';

  // Header row
  const header = buildHeaderRow(gwList);
  grid.appendChild(header);

  // Team rows
  teams.forEach(team => {
    const row = buildTeamRow(team, gwList);
    grid.appendChild(row);
  });
}

function getUpcomingGWs(n) {
  // Find first N unique GWs from all fixtures
  const gwSet = new Set();
  Object.values(state.fixtures).forEach(fixes => {
    fixes.forEach(f => gwSet.add(f.gw));
  });
  return Array.from(gwSet).sort((a, b) => a - b).slice(0, n);
}

function buildHeaderRow(gwList) {
  const row = document.createElement('div');
  row.className = 'fixtures-row header-row';
  row.innerHTML = `<div class="fix-team-name">Team</div>`;
  gwList.forEach(gw => {
    row.innerHTML += `<div class="fix-cell">GW${gw}</div>`;
  });
  return row;
}

function buildTeamRow(team, gwList) {
  const row = document.createElement('div');
  row.className = 'fixtures-row';
  row.dataset.teamId = team.id;

  const color = state.teamColors[team.id] || '#666';
  row.innerHTML = `
    <div class="fix-team-name">
      <span class="fix-team-dot" style="background:${color}"></span>
      <span>${team.name}</span>
    </div>
  `;

  const teamFixtures = state.fixtures[team.id] || [];
  const fixtureByGW = {};
  teamFixtures.forEach(f => {
    if (!fixtureByGW[f.gw]) fixtureByGW[f.gw] = [];
    fixtureByGW[f.gw].push(f);
  });

  gwList.forEach(gw => {
    const fixes = fixtureByGW[gw];
    if (!fixes || fixes.length === 0) {
      row.innerHTML += `<div class="fix-cell"><span class="fix-no-game">-</span></div>`;
    } else {
      // Double gameweek support
      const cellContent = fixes.map(f =>
        `<span class="fix-opponent">${f.opponentName}</span>
         <span class="fix-ha">${f.isHome ? 'H' : 'A'}</span>`
      ).join('<br>');
      const maxFdr = Math.max(...fixes.map(f => f.fdr));
      row.innerHTML += `<div class="fix-cell fdr-${maxFdr}" title="FDR: ${maxFdr}">${cellContent}</div>`;
    }
  });

  return row;
}

/** Render inline fixtures for a specific team (used in popup) */
export function renderTeamFixturesList(teamId, containerId, n = 5) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const fixes = getTeamFixtures(teamId, n);
  if (!fixes.length) {
    container.innerHTML = '<span style="color:var(--clr-text2);font-size:0.8rem">No upcoming fixtures</span>';
    return;
  }

  container.innerHTML = fixes.map(f =>
    `<span class="popup-fix-item fdr-${f.fdr}" title="FDR ${f.fdr}">
      <span>GW${f.gw}</span>
      <strong>${f.opponentName}</strong>
      <span class="ha">(${f.isHome ? 'H' : 'A'})</span>
    </span>`
  ).join('');
}

/** Render statistics tab */
export function renderStatsTab() {
  const tbody = document.getElementById('stats-body');
  if (!tbody) return;

  const players = getStatsPlayers();
  tbody.innerHTML = '';

  players.forEach(p => {
    const tr = document.createElement('tr');
    const posClass = p.position.toLowerCase();
    tr.innerHTML = `
      <td class="td-player">
        <div style="font-weight:600">${p.displayName}</div>
        <div style="font-size:0.7rem;color:var(--clr-text2)">${p.teamShort}</div>
      </td>
      <td class="td-team">${p.teamShort}</td>
      <td><span class="pi-pos-badge ${posClass}">${p.position}</span></td>
      <td class="td-price">£${p.price.toFixed(1)}</td>
      <td class="td-pts">${p.totalPoints}</td>
      <td>${p.form.toFixed(1)}</td>
      <td>${p.goals}</td>
      <td>${p.assists}</td>
      <td>${p.cleanSheets}</td>
      <td>${p.ictIndex.toFixed(1)}</td>
      <td>${p.selectedByPercent.toFixed(1)}%</td>
    `;
    tbody.appendChild(tr);
  });
}

function getStatsPlayers() {
  const { position, search, sort } = state.statsFilters;
  let players = state.allPlayers;

  if (position !== 'ALL') players = players.filter(p => p.position === position);
  if (search) {
    const q = search.toLowerCase();
    players = players.filter(p =>
      p.displayName.toLowerCase().includes(q) ||
      p.teamName.toLowerCase().includes(q)
    );
  }

  const sortMap = {
    total_points: (a, b) => b.totalPoints - a.totalPoints,
    form: (a, b) => b.form - a.form,
    goals_scored: (a, b) => b.goals - a.goals,
    assists: (a, b) => b.assists - a.assists,
    clean_sheets: (a, b) => b.cleanSheets - a.cleanSheets,
    bps: (a, b) => b.bps - a.bps,
    ict_index: (a, b) => b.ictIndex - a.ictIndex,
  };

  return [...players].sort(sortMap[sort] || sortMap.total_points).slice(0, 200);
}

/** Initialize stats tab filters */
export function initStatsTab() {
  const searchEl = document.getElementById('stats-search');
  const posEl = document.getElementById('stats-position-filter');
  const sortEl = document.getElementById('stats-sort');

  let debounce;
  searchEl?.addEventListener('input', (e) => {
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      state.statsFilters.search = e.target.value.trim();
      renderStatsTab();
    }, 200);
  });

  posEl?.addEventListener('change', () => {
    state.statsFilters.position = posEl.value;
    renderStatsTab();
  });

  sortEl?.addEventListener('change', () => {
    state.statsFilters.sort = sortEl.value;
    renderStatsTab();
  });
}
