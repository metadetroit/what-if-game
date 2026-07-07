'use strict';

/**
 * Tournament scoring engine — pure functions, no side effects, no I/O.
 *
 * Scoring rules:
 *   Per vote on a pair: 1 pt to Q author + 1 pt to A author (if different).
 *   Winning pair (most votes, ties allowed): +2 to Q author, +2 to A author.
 *   Fluke win (same author wrote both Q and A of winning pair): +3 fluke bonus
 *     on top of vote + win bonus (total = votes*2 + 2 + 3).
 *   Non-winning fluke pair: 2 pts per vote (1+1 since same author).
 *   Zero-vote round: no winner, no bonus.
 *
 *   Speed scoring (optional, via settings.speedScoringEnabled):
 *     Fastest Q author: +1 pt (single fastest submission)
 *     Fastest A author: +1 pt (single fastest answer submission)
 *     Slowest Q author: -1 pt (only if 4+ active players AND slowest >20s)
 *     Slowest A author: -1 pt (only if 4+ active players AND slowest >20s)
 *
 * Tie-breaker order: total → firstPlaces → votesReceived → co-champions.
 */

/**
 * @typedef {Object} PairInput
 * @property {number|string} pairDbId
 * @property {string} questionAuthor  - player name
 * @property {string} answerAuthor    - player name
 */

/**
 * @typedef {Object} ScoringSettings
 * @property {boolean} [speedScoringEnabled] - whether blitz/speed scoring is active
 * @property {{
 *   questionTimes: { name: string, ms: number }[],
 *   answerTimes:   { name: string, ms: number }[],
 *   activePlayerCount: number,
 *   phaseStartedAt: number
 * }} [speedData] - submission timing data for speed calculations
 */

const SLOWEST_MIN_PLAYERS = 4;
const SLOWEST_THRESHOLD_MS = 20000; // 20 seconds

/**
 * Calculate points for a single round, including optional speed scoring.
 *
 * @param {PairInput[]} pairs       - all qa_pairs in this round
 * @param {Record<string, number>} votesByPair - { pairDbId: voteCount }
 * @param {ScoringSettings} [settings={}] - scoring configuration for this round
 * @returns {{
 *   scores: Record<string, number>,
 *   winningPairIds: (number|string)[],
 *   firstPlaceAuthors: string[],
 *   votesReceived: Record<string, number>,
 *   roundWinnerDetails: { pairDbId: (number|string), questionAuthor: string, answerAuthor: string, isFluke: boolean, votes: number, pointsBreakdown?: { base: number, speed: number } }[],
 *   speedDetails: { fastestQ: string|null, fastestA: string|null, slowestQ: string|null, slowestA: string|null, speedBonuses: Record<string, number> }
 * }}
 */
function calculateRoundPoints(pairs, votesByPair, settings = {}) {
  const scores = {};
  const votesReceived = {};
  const speedBonuses = {};

  function addPoints(name, pts) {
    scores[name] = (scores[name] || 0) + pts;
  }
  function addVotes(name, v) {
    votesReceived[name] = (votesReceived[name] || 0) + v;
  }
  function addSpeed(name, pts) {
    speedBonuses[name] = (speedBonuses[name] || 0) + pts;
    scores[name] = (scores[name] || 0) + pts;
  }

  const speedDetails = {
    fastestQ: null, fastestA: null, slowestQ: null, slowestA: null,
    speedBonuses,
  };

  if (!pairs || pairs.length === 0) {
    return { scores, winningPairIds: [], firstPlaceAuthors: [], votesReceived, roundWinnerDetails: [], speedDetails };
  }

  const maxVotes = Math.max(0, ...pairs.map(p => votesByPair[p.pairDbId] || 0));
  const winningPairIds = pairs
    .filter(p => (votesByPair[p.pairDbId] || 0) === maxVotes && maxVotes > 0)
    .map(p => p.pairDbId);

  const firstPlaceAuthors = new Set();
  const roundWinnerDetails = [];

  // Track base points per winner for pointsBreakdown
  const basePointsByAuthor = {};
  function addBasePoints(name, pts) {
    basePointsByAuthor[name] = (basePointsByAuthor[name] || 0) + pts;
    addPoints(name, pts);
  }

  for (const pair of pairs) {
    const votes = votesByPair[pair.pairDbId] || 0;
    if (votes === 0) continue;

    const isFluke = pair.questionAuthor === pair.answerAuthor;
    const isWinning = winningPairIds.includes(pair.pairDbId);

    if (isFluke && isWinning) {
      // Fluke win: votes (counts as 2 per vote since same author) + 2 win bonus + 3 fluke bonus
      const votePts = votes * 2;
      const winBonus = 2;
      const flukeBonus = 3;
      addBasePoints(pair.questionAuthor, votePts + winBonus + flukeBonus);
      addVotes(pair.questionAuthor, votes);
      firstPlaceAuthors.add(pair.questionAuthor);
      roundWinnerDetails.push({
        pairDbId: pair.pairDbId,
        questionAuthor: pair.questionAuthor,
        answerAuthor: pair.answerAuthor,
        isFluke: true,
        votes,
        pointsBreakdown: { base: votePts + winBonus + flukeBonus, speed: 0 },
      });
    } else if (isFluke) {
      addBasePoints(pair.questionAuthor, votes * 2);
      addVotes(pair.questionAuthor, votes);
    } else {
      addBasePoints(pair.questionAuthor, votes);
      addBasePoints(pair.answerAuthor, votes);
      addVotes(pair.questionAuthor, votes);
      addVotes(pair.answerAuthor, votes);
      if (isWinning) {
        addBasePoints(pair.questionAuthor, 2);
        addBasePoints(pair.answerAuthor, 2);
        firstPlaceAuthors.add(pair.questionAuthor);
        firstPlaceAuthors.add(pair.answerAuthor);
        roundWinnerDetails.push({
          pairDbId: pair.pairDbId,
          questionAuthor: pair.questionAuthor,
          answerAuthor: pair.answerAuthor,
          isFluke: false,
          votes,
          pointsBreakdown: { base: votes + 2, speed: 0 },
        });
      }
    }
  }

  // ─── Speed scoring ───
  if (settings.speedScoringEnabled && settings.speedData) {
    const { questionTimes, answerTimes, activePlayerCount } = settings.speedData;

    // Fastest question author (+1)
    if (questionTimes && questionTimes.length > 0) {
      const sorted = [...questionTimes].sort((a, b) => a.ms - b.ms);
      const fastest = sorted[0];
      speedDetails.fastestQ = fastest.name;
      addSpeed(fastest.name, 1);

      // Slowest question author (-1, only if 4+ players and >20s)
      if (activePlayerCount >= SLOWEST_MIN_PLAYERS && sorted.length > 0) {
        const slowest = sorted[sorted.length - 1];
        if (slowest.ms > SLOWEST_THRESHOLD_MS) {
          speedDetails.slowestQ = slowest.name;
          addSpeed(slowest.name, -1);
        }
      }
    }

    // Fastest answer author (+1)
    if (answerTimes && answerTimes.length > 0) {
      const sorted = [...answerTimes].sort((a, b) => a.ms - b.ms);
      const fastest = sorted[0];
      speedDetails.fastestA = fastest.name;
      addSpeed(fastest.name, 1);

      // Slowest answer author (-1, only if 4+ players and >20s)
      if (activePlayerCount >= SLOWEST_MIN_PLAYERS && sorted.length > 0) {
        const slowest = sorted[sorted.length - 1];
        if (slowest.ms > SLOWEST_THRESHOLD_MS) {
          speedDetails.slowestA = slowest.name;
          addSpeed(slowest.name, -1);
        }
      }
    }

    // Update pointsBreakdown for round winner details with speed bonuses
    for (const detail of roundWinnerDetails) {
      const qSpeed = speedBonuses[detail.questionAuthor] || 0;
      const aSpeed = speedBonuses[detail.answerAuthor] || 0;
      // Each author's speed bonus is tracked separately; we attach the Q author's speed to the detail
      detail.pointsBreakdown.speed = qSpeed;
    }
  }

  return {
    scores,
    winningPairIds,
    firstPlaceAuthors: [...firstPlaceAuthors],
    votesReceived,
    roundWinnerDetails,
    speedDetails,
  };
}

/**
 * Backward-compatible wrapper. Equivalent to calculateRoundPoints without speed settings.
 */
function tallyRound(pairs, votesByPair) {
  return calculateRoundPoints(pairs, votesByPair, {});
}

/**
 * Merge a round's results into the persistent tournament scores object.
 * Mutates `tournamentScores` in place (caller owns the object).
 *
 * @param {Record<string, {total:number, roundScores:number[], firstPlaces:number, votesReceived:number, joinedAtRound:number, leftGame:boolean, roundSpeedBonuses?:number[]}>} tournamentScores
 * @param {ReturnType<typeof calculateRoundPoints>} roundResult
 * @param {number} roundNumber - 1-indexed
 */
function mergeRoundScores(tournamentScores, roundResult, roundNumber) {
  const idx = roundNumber - 1;
  const speedBonuses = roundResult.speedDetails?.speedBonuses || {};

  for (const [name, points] of Object.entries(roundResult.scores)) {
    if (!tournamentScores[name]) {
      tournamentScores[name] = {
        total: 0,
        roundScores: [],
        firstPlaces: 0,
        votesReceived: 0,
        joinedAtRound: roundNumber,
        leftGame: false,
        roundSpeedBonuses: [],
      };
    }
    tournamentScores[name].total += points;
    tournamentScores[name].roundScores[idx] = points;
    if (!tournamentScores[name].roundSpeedBonuses) tournamentScores[name].roundSpeedBonuses = [];
    tournamentScores[name].roundSpeedBonuses[idx] = speedBonuses[name] || 0;
    if (roundResult.firstPlaceAuthors.includes(name)) {
      tournamentScores[name].firstPlaces++;
    }
  }

  for (const [name, v] of Object.entries(roundResult.votesReceived)) {
    if (!tournamentScores[name]) {
      tournamentScores[name] = {
        total: 0,
        roundScores: [],
        firstPlaces: 0,
        votesReceived: 0,
        joinedAtRound: roundNumber,
        leftGame: false,
        roundSpeedBonuses: [],
      };
    }
    tournamentScores[name].votesReceived += v;
  }
}

/**
 * Resolve final standings with tie-breaker cascade.
 *
 * @param {Record<string, {total:number, firstPlaces:number, votesReceived:number, leftGame:boolean, roundScores:number[], joinedAtRound:number}>} tournamentScores
 * @returns {{
 *   champions: string[],
 *   isTie: boolean,
 *   standings: { name:string, rank:number, total:number, firstPlaces:number, votesReceived:number, leftGame:boolean, roundScores:number[], joinedAtRound:number }[]
 * }}
 */
function resolveStandings(tournamentScores) {
  const entries = Object.entries(tournamentScores).map(([name, data]) => ({
    name,
    rank: 0,
    total: data.total || 0,
    firstPlaces: data.firstPlaces || 0,
    votesReceived: data.votesReceived || 0,
    leftGame: data.leftGame || false,
    roundScores: data.roundScores || [],
    roundSpeedBonuses: data.roundSpeedBonuses || [],
    joinedAtRound: data.joinedAtRound || 1,
  }));

  entries.sort((a, b) => {
    if (b.total !== a.total) return b.total - a.total;
    if (b.firstPlaces !== a.firstPlaces) return b.firstPlaces - a.firstPlaces;
    return b.votesReceived - a.votesReceived;
  });

  const standings = [];
  for (let i = 0; i < entries.length; i++) {
    if (i > 0) {
      const prev = entries[i - 1];
      const cur = entries[i];
      if (cur.total === prev.total && cur.firstPlaces === prev.firstPlaces && cur.votesReceived === prev.votesReceived) {
        entries[i].rank = entries[i - 1].rank;
      } else {
        entries[i].rank = i + 1;
      }
    } else {
      entries[i].rank = 1;
    }
    standings.push(entries[i]);
  }

  const champions = standings.filter(s => s.rank === 1).map(s => s.name);
  const isTie = champions.length > 1;

  return { champions, isTie, standings };
}

module.exports = { calculateRoundPoints, tallyRound, mergeRoundScores, resolveStandings };
