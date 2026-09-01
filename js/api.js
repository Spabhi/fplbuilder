/**
 * api.js — FPL API fetcher and data transformer
 * Fetches live data from the official Fantasy Premier League API.
 * Uses local Node.js proxy at /api/ to bypass CORS restrictions.
 */

// Use local proxy (relative URL) — works when served by server.js
const API_BASE = '/api';

// Player photo CDN
export const playerPhotoUrl = (code) =>
  `https://resources.premierleague.com/premierleague/photos/players/110x140/p${code}.png`;

// Element type map
export const POSITION_MAP = { 1: 'GKP', 2: 'DEF', 3: 'MID', 4: 'FWD' };

/**
 * Fetch from local proxy
 */
async function fetchFPL(path) {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`FPL API error: ${res.status} for ${url}`);
  return res.json();
}

/**
 * Fetch all bootstrap data (players, teams, events, element_types)
 */
export async function fetchBootstrap() {
  return fetchFPL('/bootstrap-static/');
}

/**
 * Fetch fixtures for a specific gameweek (or all)
 */
export async function fetchFixtures(event = null) {
  const path = event ? `/fixtures/?event=${event}` : '/fixtures/';
  return fetchFPL(path);
}

/**
 * Fetch live GW points — /event/{gw}/live/
 * Returns a Map<playerId, { points, breakdown }>
 */
export async function fetchLivePoints(gw) {
  const data = await fetchFPL(`/event/${gw}/live/`);
  const map = {};
  (data.elements || []).forEach(el => {
    const s = el.stats || {};
    map[el.id] = {
      points: s.total_points ?? 0,
      minutes: s.minutes ?? 0,
      goals: s.goals_scored ?? 0,
      assists: s.assists ?? 0,
      cleanSheet: s.clean_sheets ?? 0,
      goalsConceded: s.goals_conceded ?? 0,
      ownGoals: s.own_goals ?? 0,
      penaltiesSaved: s.penalties_saved ?? 0,
      penaltiesMissed: s.penalties_missed ?? 0,
      yellowCards: s.yellow_cards ?? 0,
      redCards: s.red_cards ?? 0,
      saves: s.saves ?? 0,
      bonus: s.bonus ?? 0,
      bps: s.bps ?? 0,
    };
  });
  return map;
}

/**
 * Build enriched player objects from raw API data
 */
export function buildPlayers(elements, teams, elementTypes) {
  const teamMap = Object.fromEntries(teams.map(t => [t.id, t]));
  const posMap = Object.fromEntries(elementTypes.map(e => [e.id, e.singular_name_short]));

  return elements
    .filter(e => !e.removed)
    .map(el => ({
      id: el.id,
      code: el.code,
      firstName: el.first_name,
      lastName: el.second_name,
      webName: el.web_name,
      displayName: el.known_name || el.web_name,
      teamId: el.team,
      teamName: teamMap[el.team]?.name || '',
      teamShort: teamMap[el.team]?.short_name || '',
      teamCode: el.team_code,
      position: posMap[el.element_type] || 'UNK',
      positionId: el.element_type,
      price: el.now_cost / 10,
      totalPoints: el.total_points,
      eventPoints: el.event_points,
      form: parseFloat(el.form) || 0,
      selectedByPercent: parseFloat(el.selected_by_percent) || 0,
      pointsPerGame: parseFloat(el.points_per_game) || 0,
      status: el.status, // a=available, d=doubt, i=injured, n=not avail, s=suspended
      news: el.news || '',
      chanceNextRound: el.chance_of_playing_next_round,
      chanceThisRound: el.chance_of_playing_this_round,
      epNext: parseFloat(el.ep_next) || 0,
      // Stats
      minutes: el.minutes,
      goals: el.goals_scored,
      assists: el.assists,
      cleanSheets: el.clean_sheets,
      goalsConceded: el.goals_conceded,
      ownGoals: el.own_goals,
      penaltiesSaved: el.penalties_saved,
      penaltiesMissed: el.penalties_missed,
      yellowCards: el.yellow_cards,
      redCards: el.red_cards,
      saves: el.saves,
      bonus: el.bonus,
      bps: el.bps,
      ictIndex: parseFloat(el.ict_index) || 0,
      influence: parseFloat(el.influence) || 0,
      creativity: parseFloat(el.creativity) || 0,
      threat: parseFloat(el.threat) || 0,
      xg: parseFloat(el.expected_goals) || 0,
      xa: parseFloat(el.expected_assists) || 0,
      // Helpers
      photoUrl: playerPhotoUrl(el.code),
      availabilityClass: statusToClass(el.status),
      // FDR slots (filled later)
      fdrNext: [],
    }));
}

function statusToClass(status) {
  if (status === 'a') return 'avail';
  if (status === 'd') return 'doubt';
  return 'unavail';
}

/**
 * Build team strength / FDR map from fixtures
 * Returns: { teamId: [{ gw, opponent, isHome, fdr }] }
 */
export function buildTeamFixtures(fixtures, teams) {
  const teamMap = Object.fromEntries(teams.map(t => [t.id, t]));
  const result = {};

  teams.forEach(t => { result[t.id] = []; });

  fixtures.forEach(fix => {
    if (fix.finished) return; // skip finished fixtures
    const gw = fix.event;
    if (!gw) return;

    const homeTeam = teamMap[fix.team_h];
    const awayTeam = teamMap[fix.team_a];
    if (!homeTeam || !awayTeam) return;

    // Home team's fixture
    result[fix.team_h].push({
      gw,
      opponentId: fix.team_a,
      opponentName: awayTeam.short_name,
      isHome: true,
      fdr: fix.team_h_difficulty || 3,
    });

    // Away team's fixture
    result[fix.team_a].push({
      gw,
      opponentId: fix.team_h,
      opponentName: homeTeam.short_name,
      isHome: false,
      fdr: fix.team_a_difficulty || 3,
    });
  });

  // Sort by gameweek
  Object.keys(result).forEach(id => {
    result[id].sort((a, b) => a.gw - b.gw);
  });

  return result;
}

/**
 * Build team color/badge map
 */
export function buildTeamColors() {
  return {
    1:  '#EF0107',  // Arsenal
    2:  '#670E36',  // Aston Villa
    3:  '#DA291C',  // Bournemouth
    4:  '#E30613',  // Brentford
    5:  '#0057B8',  // Brighton
    6:  '#034694',  // Chelsea
    7:  '#659F35',  // Coventry
    8:  '#1B458F',  // Crystal Palace
    9:  '#003399',  // Everton
    10: '#CC0000',  // Fulham
    11: '#F5A12B',  // Hull
    12: '#3A64A3',  // Ipswich
    13: '#FFCD00',  // Leeds
    14: '#C8102E',  // Liverpool
    15: '#6CABDD',  // Man City
    16: '#DA020A',  // Man Utd
    17: '#241F20',  // Newcastle
    18: '#DD0000',  // Nott'm Forest
    19: '#132257',  // Spurs
    20: '#EB172B',  // Sunderland
  };
}
