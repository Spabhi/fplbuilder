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

  // Player team corrections for transfers / API dataset inconsistencies
  const PLAYER_TEAM_OVERRIDES = {
    14: 8,   // Eze -> Crystal Palace (CRY)
    16: 6,   // Madueke -> Chelsea (CHE)
    24: 19,  // Nelson -> Spurs (TOT)
    28: 19,  // E. Martinez -> Spurs (TOT)
    31: 2,   // Konsa -> Aston Villa (AVL)
    40: 2,   // Rogers -> Aston Villa (AVL)
    43: 2,   // Tielemans -> Aston Villa (AVL)
    128: 11, // Buonanotte -> Hull City / Leicester (HUL)
    136: 5,  // Welbeck -> Brighton & Hove Albion (BHA)
    146: 6,  // B. Badiashile -> Chelsea (CHE)
    150: 8,  // M. Sarr -> Crystal Palace (CRY)
    160: 16, // Garnacho -> Man Utd (MUN)
    165: 6,  // João Pedro -> Chelsea (CHE)
    166: 6,  // N. Jackson -> Chelsea (CHE)
    167: 12, // Delap -> Ipswich Town (IPS)
    209: 19, // B. Johnson -> Spurs (TOT)
    222: 17, // Strand Larsen -> Newcastle (NEW)
    237: 9,  // Ndiaye -> Everton (EVE)
    241: 9,  // McNeil -> Everton (EVE)
    244: 20, // A. Armstrong -> Sunderland (SUN)
    245: 20, // Dibling -> Sunderland (SUN)
    295: 17, // McBurnie -> Newcastle (NEW)
    315: 11, // Fatawu -> Hull City (HUL)
    346: 9,  // Calvert-Lewin -> Everton (EVE)
    379: 17, // Isak -> Newcastle (NEW)
    388: 8,  // Guéhi -> Crystal Palace (CRY)
    392: 17, // Aït-Nouri -> Newcastle (NEW)
    397: 3,  // Semenyo -> Bournemouth (BOU)
    427: 4,  // Mbeumo -> Brentford (BRE)
    428: 17, // Cunha -> Newcastle (NEW)
    452: 17, // Bruno Guimarães -> Newcastle (NEW)
    454: 18, // Elanga -> Nott'm Forest (NFO)
    455: 17, // Tonali -> Newcastle (NEW)
    464: 4,  // Wissa -> Brentford (BRE)
    484: 12, // Hutchinson -> Ipswich Town (IPS)
    502: 14, // Robertson -> Liverpool (LIV)
    512: 10, // Kudus -> Fulham (FUL)
    519: 2,  // Gallagher -> Aston Villa (AVL)
    546: 5,  // Adingra -> Brighton & Hove Albion (BHA)
    566: 10, // Silva -> Fulham (FUL)
    630: 18, // Harwood-Bellis -> Nott'm Forest (NFO)
    657: 16, // Nunes -> Man Utd (MUN)
  };

  return elements
    .filter(e => !e.removed)
    .map(el => {
      const effectiveTeamId = PLAYER_TEAM_OVERRIDES[el.id] || el.team;
      return {
        id: el.id,
        code: el.code,
        firstName: el.first_name,
        lastName: el.second_name,
        webName: el.web_name,
        displayName: el.known_name || el.web_name,
        teamId: effectiveTeamId,
        teamName: teamMap[effectiveTeamId]?.name || '',
        teamShort: teamMap[effectiveTeamId]?.short_name || '',
        teamCode: el.team_code,
        position: posMap[el.element_type] || 'UNK',
        positionId: el.element_type,
        price: parseFloat((el.now_cost / 10).toFixed(1)),
        startPrice: parseFloat(((el.now_cost - el.cost_change_start) / 10).toFixed(1)),
        costChangeStart: parseFloat((el.cost_change_start / 10).toFixed(1)),
        costChangeEvent: parseFloat((el.cost_change_event / 10).toFixed(1)),
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
      // Set-piece orders (1 = primary taker)
      penaltiesOrder: el.penalties_order || null,
      directFreesOrder: el.direct_freekicks_order || null,
      cornersOrder: el.corners_and_indirect_fk_order || null,
      // Helpers
      photoUrl: playerPhotoUrl(el.code),
      availabilityClass: statusToClass(el.status),
      // FDR slots (filled later)
      fdrNext: [],
    };
  });
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
