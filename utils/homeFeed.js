const DEFAULT_GUIDES = [
  {
    id: "guide-1x2",
    title: "Start with 1X2",
    description:
      "Pick Home, Draw, or Away first. It is the easiest market for a casual football fan to learn.",
    cta_label: "Learn the basics",
  },
  {
    id: "guide-acca",
    title: "Build a starter accumulator",
    description:
      "Mix 2-3 picks to increase your combined odd, then decide whether the risk feels worth it.",
    cta_label: "Try a starter slip",
  },
  {
    id: "guide-custom",
    title: "Browse custom odds",
    description:
      "See what other players are posting before kickoff and compare community ideas with standard odds.",
    cta_label: "Explore custom odds",
  },
];
const HOME_FEED_FIXTURE_LIMIT = 48;

const getFixtureTimestamp = (fixture) => {
  const parsedDate = new Date(fixture?.fixture?.date || 0).getTime();
  return Number.isFinite(parsedDate) ? parsedDate : 0;
};

const sortFixturesByKickoff = (fixtures = []) => {
  return [...fixtures].sort((left, right) => getFixtureTimestamp(left) - getFixtureTimestamp(right));
};

const selectSpotlightFixture = (fixtures = [], customEventsByFixture = {}) => {
  return (
    fixtures.find((fixture) => {
      const fixtureId = fixture?.fixture?.id;
      const currentEvents = customEventsByFixture[String(fixtureId)];
      return Array.isArray(currentEvents) && currentEvents.length > 0;
    }) || fixtures[0] || null
  );
};

const extractMatchWinnerOptions = (fixture) => {
  const values = Array.isArray(fixture?.odds?.bets?.[0]?.values)
    ? fixture.odds.bets[0].values
    : [];

  return values
    .map((option, index) => {
      const odd = Number.parseFloat(option?.odd);
      if (!Number.isFinite(odd)) {
        return null;
      }

      return {
        label: option?.value || (index === 0 ? "Home" : index === 1 ? "Draw" : "Away"),
        odd: Number(odd.toFixed(2)),
        selection_code: index,
      };
    })
    .filter(Boolean);
};

const getFavoritePick = (fixture) => {
  const options = extractMatchWinnerOptions(fixture);
  if (!options.length) {
    return null;
  }

  return options.reduce((currentBest, option) =>
    option.odd < currentBest.odd ? option : currentBest
  );
};

const getUnderdogPick = (fixture) => {
  const options = extractMatchWinnerOptions(fixture);
  if (!options.length) {
    return null;
  }

  return options.reduce((currentBest, option) =>
    option.odd > currentBest.odd ? option : currentBest
  );
};

const mapFixtureCard = (fixture, customOddCount = 0) => {
  const homeTeam = fixture?.teams?.home?.name || "Home";
  const awayTeam = fixture?.teams?.away?.name || "Away";
  const favoritePick = getFavoritePick(fixture);
  const underdogPick = getUnderdogPick(fixture);

  return {
    fixture_id: fixture?.fixture?.id || null,
    title: `${homeTeam} vs ${awayTeam}`,
    league_name: fixture?.league?.name || "Featured league",
    league_logo: fixture?.league?.logo || null,
    kickoff: fixture?.fixture?.date || null,
    home_team: homeTeam,
    away_team: awayTeam,
    custom_odd_count: customOddCount,
    favorite_pick: favoritePick,
    underdog_pick: underdogPick,
    storyline:
      customOddCount > 0
        ? `${customOddCount} community odds posts are already live for this fixture.`
        : "A clean starting point for your first pick or accumulator.",
  };
};

const getTopFollowOptions = (fixtures = []) => {
  const teamFrequency = new Map();
  const leagueFrequency = new Map();

  fixtures.forEach((fixture) => {
    const leagueName = fixture?.league?.name;
    if (leagueName) {
      leagueFrequency.set(leagueName, (leagueFrequency.get(leagueName) || 0) + 1);
    }

    [fixture?.teams?.home?.name, fixture?.teams?.away?.name]
      .filter(Boolean)
      .forEach((teamName) => {
        teamFrequency.set(teamName, (teamFrequency.get(teamName) || 0) + 1);
      });
  });

  const toSortedList = (sourceMap) =>
    [...sourceMap.entries()]
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .slice(0, 6)
      .map(([name]) => name);

  return {
    teams: toSortedList(teamFrequency),
    leagues: toSortedList(leagueFrequency),
  };
};

const buildStarterSlip = (fixtures = []) => {
  const selections = fixtures
    .slice(0, 3)
    .map((fixture) => {
      const favoritePick = getFavoritePick(fixture);
      if (!favoritePick || !fixture?.fixture?.id) {
        return null;
      }

      return {
        fixture_id: fixture.fixture.id,
        home_team: fixture?.teams?.home?.name || "Home",
        away_team: fixture?.teams?.away?.name || "Away",
        selection: favoritePick.label,
        selection_code: favoritePick.selection_code,
        odd_rate: favoritePick.odd,
      };
    })
    .filter(Boolean);

  const combinedOdd = selections.reduce((total, selection) => total * selection.odd_rate, 1);

  return {
    title: "Starter accumulator",
    summary:
      selections.length > 1
        ? "Use the shortest priced outcome from a few early fixtures to see how accumulators work."
        : "Use a single low-friction pick to learn how the basket works.",
    selections,
    combined_odd: Number(combinedOdd.toFixed(2)),
  };
};

const buildContentCards = (fixtures = [], spotlightFixture) => {
  const spotlightTeams = spotlightFixture
    ? `${spotlightFixture?.teams?.home?.name || "Home"} vs ${
        spotlightFixture?.teams?.away?.name || "Away"
      }`
    : "today's standout fixture";

  const firstLeague = fixtures[0]?.league?.name || "top football";

  return [
    {
      id: "content-spotlight",
      eyebrow: "Today",
      title: `Why ${spotlightTeams} is worth opening first`,
      description:
        "Lead casual fans with one clear match, one clear story, and a simple reason to make a first pick.",
    },
    {
      id: "content-learn",
      eyebrow: "New here?",
      title: "What Home / Draw / Away means",
      description:
        "Teach the core market in plain language before asking people to understand odds or accumulators.",
    },
    {
      id: "content-community",
      eyebrow: "Community",
      title: `See how fans are posting custom odds around ${firstLeague}`,
      description:
        "Use custom odds as a social proof feature, not just a creator tool, so newcomers feel the product is active.",
    },
  ];
};

const buildOnboardingSteps = () => {
  return [
    {
      id: "signup",
      title: "Create your free account",
      description: "Unlock saved slips, custom odds, and your personal dashboard.",
      cta_label: "Sign up",
      cta_path: "/signup",
    },
    {
      id: "follow",
      title: "Follow a club or league",
      description: "Tell the homepage which teams or competitions you care about.",
      cta_label: "Pick preferences",
      cta_path: "#follow",
    },
    {
      id: "starter-slip",
      title: "Try a starter slip",
      description: "Load a simple example accumulator before creating your own.",
      cta_label: "Load starter slip",
      cta_path: "#starter-slip",
    },
  ];
};

const buildTrendingCustomOdds = (fixtures = [], customEventsByFixture = {}) => {
  return fixtures
    .map((fixture) => {
      const fixtureId = fixture?.fixture?.id;
      const customEvents = Array.isArray(customEventsByFixture[String(fixtureId)])
        ? customEventsByFixture[String(fixtureId)]
        : [];

      return {
        fixture_id: fixtureId,
        title: `${fixture?.teams?.home?.name || "Home"} vs ${
          fixture?.teams?.away?.name || "Away"
        }`,
        league_name: fixture?.league?.name || "Featured league",
        kickoff: fixture?.fixture?.date || null,
        custom_odd_count: customEvents.length,
      };
    })
    .filter((item) => item.fixture_id && item.custom_odd_count > 0)
    .sort((left, right) => right.custom_odd_count - left.custom_odd_count)
    .slice(0, 4);
};

const buildHomeFeed = (fixtureMap = {}, customEventsByFixture = {}, sportsdb = null) => {
  const fixtures = sortFixturesByKickoff(Object.values(fixtureMap || {})).slice(
    0,
    HOME_FEED_FIXTURE_LIMIT
  );
  const spotlightFixture = selectSpotlightFixture(fixtures, customEventsByFixture);

  return {
    generated_at: new Date().toISOString(),
    fixtures,
    spotlight: spotlightFixture
      ? mapFixtureCard(
          spotlightFixture,
          (customEventsByFixture[String(spotlightFixture.fixture.id)] || []).length
        )
      : null,
    featured_fixtures: fixtures.slice(0, 6).map((fixture) =>
      mapFixtureCard(
        fixture,
        (customEventsByFixture[String(fixture?.fixture?.id)] || []).length
      )
    ),
    trending_custom_odds: buildTrendingCustomOdds(fixtures, customEventsByFixture),
    content_cards: buildContentCards(fixtures, spotlightFixture),
    beginner_guides: DEFAULT_GUIDES,
    onboarding_steps: buildOnboardingSteps(),
    follow_options: getTopFollowOptions(fixtures),
    starter_slip: buildStarterSlip(fixtures),
    sportsdb,
  };
};

module.exports = {
  extractMatchWinnerOptions,
  getFavoritePick,
  getUnderdogPick,
  sortFixturesByKickoff,
  selectSpotlightFixture,
  buildStarterSlip,
  buildHomeFeed,
};
