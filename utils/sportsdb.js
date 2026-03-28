const axios = require("axios");
const { sortFixturesByKickoff, selectSpotlightFixture } = require("./homeFeed");

const THESPORTSDB_BASE_URL = "https://www.thesportsdb.com/api/v1/json/123";
const EPL_LEAGUE_NAME = "English Premier League";
const EPL_LEAGUE_ID = "4328";
const CACHE_TTL_SECONDS = 60 * 60;
const EPL_CACHE_KEY = "sportsdb:epl:foundation";
const TEAM_EVENT_CACHE_KEY_PREFIX = "sportsdb:epl:team-events:";
const TEAM_LOOKUP_CACHE_KEY_PREFIX = "sportsdb:epl:team-lookup:";

let sportsDbRefreshPromise = null;
const teamEventRefreshPromises = {};
const teamLookupRefreshPromises = {};

const createEmptySportsDb = (overrides = {}) => ({
  source: "TheSportsDB",
  status: "unavailable",
  cached_at: null,
  expires_at: null,
  table_snapshot: [],
  spotlight_teams: [],
  ...overrides,
});

const normalizeLookupValue = (value) => {
  if (typeof value !== "string") {
    return "";
  }

  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
};

const splitAliasValues = (value) => {
  if (typeof value !== "string" || value.trim().length === 0) {
    return [];
  }

  return value
    .split(/[,/]| and /gi)
    .map((item) => normalizeLookupValue(item))
    .filter(Boolean);
};

const buildTeamAliasList = (team = {}) => {
  const aliasSet = new Set();

  [
    team.strTeam,
    team.strTeamAlternate,
    team.strTeamShort,
    ...(splitAliasValues(team.strKeywords) || []),
  ]
    .flatMap((value) => (typeof value === "string" ? splitAliasValues(value) : [value]))
    .filter(Boolean)
    .forEach((value) => aliasSet.add(value));

  const normalizedTeamName = normalizeLookupValue(team.strTeam);
  if (normalizedTeamName) {
    aliasSet.add(normalizedTeamName);
  }

  return [...aliasSet];
};

const excerptDescription = (value, maxLength = 220) => {
  if (typeof value !== "string" || value.trim().length === 0) {
    return "";
  }

  const normalizedText = value.replace(/\s+/g, " ").trim();
  if (normalizedText.length <= maxLength) {
    return normalizedText;
  }

  const shortened = normalizedText.slice(0, maxLength);
  const lastSpace = shortened.lastIndexOf(" ");
  return `${(lastSpace > 120 ? shortened.slice(0, lastSpace) : shortened).trim()}...`;
};

const serializeEventSummary = (event) => {
  if (!event || typeof event !== "object") {
    return null;
  }

  return {
    event_id: event.idEvent ? Number(event.idEvent) : null,
    fixture_id_api_football: event.idAPIfootball ? Number(event.idAPIfootball) : null,
    event_name: event.strEvent || null,
    league_name: event.strLeague || null,
    league_badge: event.strLeagueBadge || null,
    timestamp: event.strTimestamp || null,
    date: event.dateEvent || null,
    time: event.strTime || null,
    status: event.strStatus || null,
    venue: event.strVenue || null,
    home_team: event.strHomeTeam || null,
    away_team: event.strAwayTeam || null,
    home_team_badge: event.strHomeTeamBadge || null,
    away_team_badge: event.strAwayTeamBadge || null,
    home_score:
      event.intHomeScore === null || event.intHomeScore === undefined
        ? null
        : Number(event.intHomeScore),
    away_score:
      event.intAwayScore === null || event.intAwayScore === undefined
        ? null
        : Number(event.intAwayScore),
  };
};

const trimTeamRecord = (team = {}) => ({
  idTeam: team.idTeam || null,
  idAPIfootball: team.idAPIfootball || null,
  strTeam: team.strTeam || null,
  strTeamAlternate: team.strTeamAlternate || null,
  strTeamShort: team.strTeamShort || null,
  strKeywords: team.strKeywords || null,
  strBadge: team.strBadge || null,
  strBanner: team.strBanner || null,
  strFanart1: team.strFanart1 || null,
  strStadium: team.strStadium || null,
  strLocation: team.strLocation || null,
  strDescriptionEN: team.strDescriptionEN || null,
  strColour1: team.strColour1 || null,
  strColour2: team.strColour2 || null,
  strColour3: team.strColour3 || null,
});

const buildTeamIndexes = (teams = []) => {
  const teamsBySportsDbId = {};
  const teamApiIdByAlias = {};
  const sportsDbIdByApiFootballId = {};

  teams.forEach((team) => {
    if (!team?.idTeam) {
      return;
    }

    teamsBySportsDbId[String(team.idTeam)] = trimTeamRecord(team);

    if (team.idAPIfootball) {
      sportsDbIdByApiFootballId[String(team.idAPIfootball)] = String(team.idTeam);
    }

    buildTeamAliasList(team).forEach((alias) => {
      if (!teamApiIdByAlias[alias]) {
        teamApiIdByAlias[alias] = String(team.idTeam);
      }
    });
  });

  return {
    teamsBySportsDbId,
    sportsDbIdByApiFootballId,
    teamApiIdByAlias,
  };
};

const buildTableSnapshot = (rows = [], teamsBySportsDbId = {}) => {
  const tableByApiFootballId = {};
  const tableByNormalizedTeamName = {};
  const tableSnapshot = rows.slice(0, 5).map((row) => {
    const matchingTeam = teamsBySportsDbId[String(row.idTeam)] || null;
    const entry = {
      team_id_api_football: matchingTeam?.idAPIfootball ? Number(matchingTeam.idAPIfootball) : null,
      team_name: row.strTeam || matchingTeam?.strTeam || null,
      team_badge: row.strBadge || matchingTeam?.strBadge || null,
      rank: row.intRank ? Number(row.intRank) : null,
      points: row.intPoints ? Number(row.intPoints) : null,
      played: row.intPlayed ? Number(row.intPlayed) : null,
      goal_difference: row.intGoalDifference ? Number(row.intGoalDifference) : null,
      form: row.strForm || null,
      note: row.strDescription || null,
    };
    const normalizedTeamName = normalizeLookupValue(entry.team_name);

    if (entry.team_id_api_football !== null) {
      tableByApiFootballId[String(entry.team_id_api_football)] = entry;
    }
    if (normalizedTeamName) {
      tableByNormalizedTeamName[normalizedTeamName] = entry;
    }

    return entry;
  });

  return {
    tableSnapshot,
    tableByApiFootballId,
    tableByNormalizedTeamName,
  };
};

const resolveMatchedTeam = (fixtureTeam = {}, foundation = {}) => {
  if (!fixtureTeam || typeof fixtureTeam !== "object") {
    return null;
  }

  const apiFootballId = fixtureTeam.id ? String(fixtureTeam.id) : "";
  const sportsDbIdFromApi = apiFootballId
    ? foundation?.sportsDbIdByApiFootballId?.[apiFootballId]
    : null;
  if (sportsDbIdFromApi && foundation?.teamsBySportsDbId?.[sportsDbIdFromApi]) {
    return foundation.teamsBySportsDbId[sportsDbIdFromApi];
  }

  const normalizedTeamName = normalizeLookupValue(fixtureTeam.name);
  if (!normalizedTeamName) {
    return null;
  }

  const sportsDbIdFromAlias = foundation?.teamApiIdByAlias?.[normalizedTeamName];
  if (sportsDbIdFromAlias && foundation?.teamsBySportsDbId?.[sportsDbIdFromAlias]) {
    return foundation.teamsBySportsDbId[sportsDbIdFromAlias];
  }

  return null;
};

const buildTeamEventsCacheKey = (sportsDbTeamId) =>
  `${TEAM_EVENT_CACHE_KEY_PREFIX}${sportsDbTeamId}`;
const buildTeamLookupCacheKey = (normalizedTeamName) =>
  `${TEAM_LOOKUP_CACHE_KEY_PREFIX}${normalizedTeamName}`;

const fetchTeamEventsBundle = async (sportsDbTeamId, httpClient = axios) => {
  const [lastEventResult, nextEventResult] = await Promise.allSettled([
    httpClient.get(`${THESPORTSDB_BASE_URL}/eventslast.php?id=${sportsDbTeamId}`),
    httpClient.get(`${THESPORTSDB_BASE_URL}/eventsnext.php?id=${sportsDbTeamId}`),
  ]);

  return {
    last_event:
      lastEventResult.status === "fulfilled"
        ? serializeEventSummary(lastEventResult.value?.data?.results?.[0] || null)
        : null,
    next_event:
      nextEventResult.status === "fulfilled"
        ? serializeEventSummary(nextEventResult.value?.data?.events?.[0] || null)
        : null,
    has_error:
      lastEventResult.status === "rejected" || nextEventResult.status === "rejected",
  };
};

const getTeamEventsBundle = async ({ sportsDbTeamId, cache, httpClient = axios }) => {
  const cacheKey = buildTeamEventsCacheKey(sportsDbTeamId);
  if (cache?.has(cacheKey)) {
    return cache.get(cacheKey);
  }

  if (teamEventRefreshPromises[cacheKey]) {
    return teamEventRefreshPromises[cacheKey];
  }

  teamEventRefreshPromises[cacheKey] = (async () => {
    const bundle = await fetchTeamEventsBundle(sportsDbTeamId, httpClient);
    cache?.set(cacheKey, bundle, CACHE_TTL_SECONDS);
    return bundle;
  })();

  try {
    return await teamEventRefreshPromises[cacheKey];
  } finally {
    delete teamEventRefreshPromises[cacheKey];
  }
};

const buildFoundationPayload = async (httpClient = axios, now = Date.now) => {
  const cachedAt = new Date(now()).toISOString();
  const expiresAt = new Date(now() + CACHE_TTL_SECONDS * 1000).toISOString();

  const [teamsResult, tableResult] = await Promise.allSettled([
    httpClient.get(
      `${THESPORTSDB_BASE_URL}/search_all_teams.php?l=${encodeURIComponent(EPL_LEAGUE_NAME)}`
    ),
    httpClient.get(`${THESPORTSDB_BASE_URL}/lookuptable.php?l=${EPL_LEAGUE_ID}`),
  ]);

  const teams =
    teamsResult.status === "fulfilled" && Array.isArray(teamsResult.value?.data?.teams)
      ? teamsResult.value.data.teams
      : [];
  const tableRows =
    tableResult.status === "fulfilled" && Array.isArray(tableResult.value?.data?.table)
      ? tableResult.value.data.table
      : [];

  const indexes = buildTeamIndexes(teams);
  const { tableSnapshot, tableByApiFootballId, tableByNormalizedTeamName } = buildTableSnapshot(
    tableRows,
    indexes.teamsBySportsDbId
  );

  const hasTeams = teams.length > 0;
  const hasTable = tableSnapshot.length > 0;

  let status = "healthy";
  if (!hasTeams && !hasTable) {
    status = "unavailable";
  } else if (!hasTeams || !hasTable) {
    status = "partial";
  }

  return {
    source: "TheSportsDB",
    league_name: EPL_LEAGUE_NAME,
    league_id: EPL_LEAGUE_ID,
    status,
    cached_at: cachedAt,
    expires_at: expiresAt,
    table_snapshot: tableSnapshot,
    spotlight_teams: [],
    teamsBySportsDbId: indexes.teamsBySportsDbId,
    sportsDbIdByApiFootballId: indexes.sportsDbIdByApiFootballId,
    teamApiIdByAlias: indexes.teamApiIdByAlias,
    tableByApiFootballId,
    tableByNormalizedTeamName,
  };
};

const getSportsDbFoundation = async ({ cache, httpClient = axios, now = Date.now }) => {
  if (cache?.has(EPL_CACHE_KEY)) {
    return cache.get(EPL_CACHE_KEY);
  }

  if (sportsDbRefreshPromise) {
    return sportsDbRefreshPromise;
  }

  sportsDbRefreshPromise = (async () => {
    const foundation = await buildFoundationPayload(httpClient, now);
    cache?.set(EPL_CACHE_KEY, foundation, CACHE_TTL_SECONDS);
    return foundation;
  })();

  try {
    return await sportsDbRefreshPromise;
  } finally {
    sportsDbRefreshPromise = null;
  }
};

const buildSpotlightTeamCard = ({
  fixtureId,
  side,
  fixtureTeam,
  matchedTeam,
  tableEntry,
  eventBundle,
}) => {
  if (!matchedTeam) {
    return null;
  }

  return {
    fixture_id: fixtureId || null,
    side,
    team_id_api_football: matchedTeam.idAPIfootball ? Number(matchedTeam.idAPIfootball) : null,
    team_name: matchedTeam.strTeam || fixtureTeam?.name || null,
    team_badge: matchedTeam.strBadge || null,
    team_banner: matchedTeam.strBanner || matchedTeam.strFanart1 || null,
    team_colors: [matchedTeam.strColour1, matchedTeam.strColour2, matchedTeam.strColour3].filter(
      Boolean
    ),
    stadium: matchedTeam.strStadium || null,
    location: matchedTeam.strLocation || null,
    keywords: splitAliasValues(matchedTeam.strKeywords),
    description_excerpt: excerptDescription(matchedTeam.strDescriptionEN),
    table: tableEntry || null,
    last_event: eventBundle?.last_event || null,
    next_event: eventBundle?.next_event || null,
  };
};

const getSpotlightFixture = (fixtureMap = {}, customEventsByFixture = {}) => {
  const fixtures = sortFixturesByKickoff(Object.values(fixtureMap || {})).slice(0, 18);
  return selectSpotlightFixture(fixtures, customEventsByFixture);
};

const searchSpotlightTeam = async ({ fixtureTeam, cache, httpClient = axios }) => {
  const normalizedTeamName = normalizeLookupValue(fixtureTeam?.name);
  if (!normalizedTeamName) {
    return null;
  }

  const cacheKey = buildTeamLookupCacheKey(normalizedTeamName);
  if (cache?.has(cacheKey)) {
    return cache.get(cacheKey);
  }

  if (teamLookupRefreshPromises[cacheKey]) {
    return teamLookupRefreshPromises[cacheKey];
  }

  teamLookupRefreshPromises[cacheKey] = (async () => {
    try {
      const result = await httpClient.get(
        `${THESPORTSDB_BASE_URL}/searchteams.php?t=${encodeURIComponent(fixtureTeam.name)}`
      );
      const teams = Array.isArray(result?.data?.teams) ? result.data.teams : [];
      const indexes = buildTeamIndexes(teams);
      const matchedTeam = resolveMatchedTeam(fixtureTeam, indexes);
      const trimmedTeam = matchedTeam ? trimTeamRecord(matchedTeam) : null;
      cache?.set(cacheKey, trimmedTeam, CACHE_TTL_SECONDS);
      return trimmedTeam;
    } catch (error) {
      cache?.set(cacheKey, null, CACHE_TTL_SECONDS);
      return null;
    }
  })();

  try {
    return await teamLookupRefreshPromises[cacheKey];
  } finally {
    delete teamLookupRefreshPromises[cacheKey];
  }
};

const getSportsDbPayload = async ({
  fixtureMap = {},
  customEventsByFixture = {},
  cache,
  httpClient = axios,
  now = Date.now,
}) => {
  try {
    const foundation = await getSportsDbFoundation({ cache, httpClient, now });
    const spotlightFixture = getSpotlightFixture(fixtureMap, customEventsByFixture);

    if (!spotlightFixture) {
      return createEmptySportsDb({
        source: foundation.source,
        status: foundation.status,
        cached_at: foundation.cached_at,
        expires_at: foundation.expires_at,
        table_snapshot: foundation.table_snapshot || [],
      });
    }

    const spotlightCards = [];
    let hasSpotlightGap = false;
    let hasEventError = false;

    for (const side of ["home", "away"]) {
      const fixtureTeam = spotlightFixture?.teams?.[side];
      let matchedTeam = resolveMatchedTeam(fixtureTeam, foundation);
      if (!matchedTeam) {
        matchedTeam = await searchSpotlightTeam({
          fixtureTeam,
          cache,
          httpClient,
        });
      }

      if (!matchedTeam) {
        hasSpotlightGap = true;
        continue;
      }

      const eventBundle = await getTeamEventsBundle({
        sportsDbTeamId: matchedTeam.idTeam,
        cache,
        httpClient,
      });
      const tableEntry =
        foundation?.tableByApiFootballId?.[String(matchedTeam.idAPIfootball)] ||
        foundation?.tableByNormalizedTeamName?.[normalizeLookupValue(matchedTeam.strTeam)] ||
        null;

      if (eventBundle?.has_error) {
        hasEventError = true;
      }
      if (!tableEntry) {
        hasSpotlightGap = true;
      }

      const card = buildSpotlightTeamCard({
        fixtureId: spotlightFixture?.fixture?.id,
        side,
        fixtureTeam,
        matchedTeam,
        tableEntry,
        eventBundle,
      });

      if (card) {
        spotlightCards.push(card);
      }
    }

    let status = foundation.status;
    if (status === "healthy" && (hasSpotlightGap || hasEventError || spotlightCards.length < 2)) {
      status = "partial";
    }
    if (!foundation.table_snapshot?.length && spotlightCards.length === 0) {
      status = "unavailable";
    }

    return createEmptySportsDb({
      source: foundation.source,
      status,
      cached_at: foundation.cached_at,
      expires_at: foundation.expires_at,
      table_snapshot: foundation.table_snapshot || [],
      spotlight_teams: spotlightCards,
    });
  } catch (error) {
    return createEmptySportsDb({
      cached_at: new Date(now()).toISOString(),
      expires_at: new Date(now() + CACHE_TTL_SECONDS * 1000).toISOString(),
    });
  }
};

const resetSportsDbState = () => {
  sportsDbRefreshPromise = null;
  Object.keys(teamEventRefreshPromises).forEach((key) => {
    delete teamEventRefreshPromises[key];
  });
  Object.keys(teamLookupRefreshPromises).forEach((key) => {
    delete teamLookupRefreshPromises[key];
  });
};

module.exports = {
  CACHE_TTL_SECONDS,
  EPL_CACHE_KEY,
  createEmptySportsDb,
  normalizeLookupValue,
  resolveMatchedTeam,
  getSportsDbPayload,
  resetSportsDbState,
};
