'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { calculateRoundPoints, tallyRound, mergeRoundScores, resolveStandings } = require('./tournament.js');

// ─── tallyRound ───

test('zero-vote round: no winner, no points', () => {
  const pairs = [
    { pairDbId: 1, questionAuthor: 'Alice', answerAuthor: 'Bob' },
    { pairDbId: 2, questionAuthor: 'Carol', answerAuthor: 'Dave' },
  ];
  const result = tallyRound(pairs, { 1: 0, 2: 0 });
  assert.deepEqual(result.scores, {});
  assert.deepEqual(result.winningPairIds, []);
  assert.deepEqual(result.firstPlaceAuthors, []);
  assert.equal(result.roundWinnerDetails.length, 0);
});

test('different authors, single winner', () => {
  const pairs = [
    { pairDbId: 1, questionAuthor: 'Alice', answerAuthor: 'Bob' },
    { pairDbId: 2, questionAuthor: 'Carol', answerAuthor: 'Dave' },
  ];
  const result = tallyRound(pairs, { 1: 3, 2: 1 });
  // Pair 1 wins: Alice 3+2=5, Bob 3+2=5; Pair 2: Carol 1, Dave 1
  assert.equal(result.scores['Alice'], 5);
  assert.equal(result.scores['Bob'], 5);
  assert.equal(result.scores['Carol'], 1);
  assert.equal(result.scores['Dave'], 1);
  assert.deepEqual(result.winningPairIds, [1]);
  assert.ok(result.firstPlaceAuthors.includes('Alice'));
  assert.ok(result.firstPlaceAuthors.includes('Bob'));
});

test('fluke win: votes*2 + 2 win + 3 fluke = 6+votes', () => {
  const pairs = [
    { pairDbId: 1, questionAuthor: 'Alice', answerAuthor: 'Alice' },
    { pairDbId: 2, questionAuthor: 'Bob', answerAuthor: 'Carol' },
  ];
  const result = tallyRound(pairs, { 1: 4, 2: 2 });
  // Pair 1 is fluke winner: Alice gets 4*2 + 2 + 3 = 13 (not flat 5)
  // Pair 2: Bob 2, Carol 2
  assert.equal(result.scores['Alice'], 13);
  assert.equal(result.scores['Bob'], 2);
  assert.equal(result.scores['Carol'], 2);
  assert.deepEqual(result.winningPairIds, [1]);
  assert.deepEqual(result.firstPlaceAuthors, ['Alice']);
  assert.equal(result.roundWinnerDetails[0].isFluke, true);
  assert.equal(result.roundWinnerDetails[0].pointsBreakdown.base, 13);
});

test('non-winning fluke: 2 pts per vote', () => {
  const pairs = [
    { pairDbId: 1, questionAuthor: 'Alice', answerAuthor: 'Bob' },
    { pairDbId: 2, questionAuthor: 'Carol', answerAuthor: 'Carol' },
  ];
  const result = tallyRound(pairs, { 1: 3, 2: 2 });
  // Pair 1 wins: Alice 3+2=5, Bob 3+2=5
  // Pair 2 non-winning fluke: Carol 2*2=4
  assert.equal(result.scores['Alice'], 5);
  assert.equal(result.scores['Bob'], 5);
  assert.equal(result.scores['Carol'], 4);
  assert.deepEqual(result.winningPairIds, [1]);
});

test('tied winning pairs: both get bonus', () => {
  const pairs = [
    { pairDbId: 1, questionAuthor: 'Alice', answerAuthor: 'Bob' },
    { pairDbId: 2, questionAuthor: 'Carol', answerAuthor: 'Dave' },
  ];
  const result = tallyRound(pairs, { 1: 3, 2: 3 });
  // Both win: Alice 3+2=5, Bob 3+2=5, Carol 3+2=5, Dave 3+2=5
  assert.equal(result.scores['Alice'], 5);
  assert.equal(result.scores['Bob'], 5);
  assert.equal(result.scores['Carol'], 5);
  assert.equal(result.scores['Dave'], 5);
  assert.deepEqual(result.winningPairIds, [1, 2]);
  assert.equal(result.firstPlaceAuthors.length, 4);
});

test('tied winners: one fluke, one not', () => {
  const pairs = [
    { pairDbId: 1, questionAuthor: 'Alice', answerAuthor: 'Alice' },
    { pairDbId: 2, questionAuthor: 'Bob', answerAuthor: 'Carol' },
  ];
  const result = tallyRound(pairs, { 1: 3, 2: 3 });
  // Both win: Alice gets 3*2+2+3=11 (fluke), Bob 3+2=5, Carol 3+2=5
  assert.equal(result.scores['Alice'], 11);
  assert.equal(result.scores['Bob'], 5);
  assert.equal(result.scores['Carol'], 5);
  assert.equal(result.roundWinnerDetails.length, 2);
});

test('votesReceived tracked correctly', () => {
  const pairs = [
    { pairDbId: 1, questionAuthor: 'Alice', answerAuthor: 'Bob' },
    { pairDbId: 2, questionAuthor: 'Alice', answerAuthor: 'Carol' },
  ];
  const result = tallyRound(pairs, { 1: 3, 2: 2 });
  // Alice authored Q in both: 3+2=5 votes received
  // Bob: 3, Carol: 2
  assert.equal(result.votesReceived['Alice'], 5);
  assert.equal(result.votesReceived['Bob'], 3);
  assert.equal(result.votesReceived['Carol'], 2);
});

test('empty pairs array', () => {
  const result = tallyRound([], {});
  assert.deepEqual(result.scores, {});
  assert.deepEqual(result.winningPairIds, []);
});

// ─── mergeRoundScores ───

test('mergeRoundScores accumulates across rounds', () => {
  const scores = {};
  const r1 = tallyRound(
    [{ pairDbId: 1, questionAuthor: 'Alice', answerAuthor: 'Bob' }],
    { 1: 3 }
  );
  mergeRoundScores(scores, r1, 1);

  const r2 = tallyRound(
    [{ pairDbId: 2, questionAuthor: 'Alice', answerAuthor: 'Bob' }],
    { 2: 2 }
  );
  mergeRoundScores(scores, r2, 2);

  // Round 1: Alice 3+2=5, Bob 3+2=5
  // Round 2: Alice 2+2=4, Bob 2+2=4
  assert.equal(scores['Alice'].total, 9);
  assert.equal(scores['Bob'].total, 9);
  assert.equal(scores['Alice'].roundScores[0], 5);
  assert.equal(scores['Alice'].roundScores[1], 4);
  assert.equal(scores['Alice'].firstPlaces, 2);
});

test('mergeRoundScores handles late joiner', () => {
  const scores = {
    Alice: { total: 5, roundScores: [5], firstPlaces: 1, votesReceived: 3, joinedAtRound: 1, leftGame: false },
  };
  const r2 = tallyRound(
    [{ pairDbId: 2, questionAuthor: 'Bob', answerAuthor: 'Alice' }],
    { 2: 2 }
  );
  mergeRoundScores(scores, r2, 2);
  // Bob is new: 2+2=4, joinedAtRound=2
  // Alice: +2 (as answer author) +2 (winning bonus) = +4
  assert.equal(scores['Bob'].total, 4);
  assert.equal(scores['Bob'].joinedAtRound, 2);
  assert.equal(scores['Bob'].roundScores[0], undefined);
  assert.equal(scores['Bob'].roundScores[1], 4);
  assert.equal(scores['Alice'].total, 9);
});

// ─── resolveStandings ───

test('clear winner by total', () => {
  const scores = {
    Alice: { total: 15, firstPlaces: 2, votesReceived: 10, roundScores: [], joinedAtRound: 1, leftGame: false },
    Bob: { total: 10, firstPlaces: 1, votesReceived: 8, roundScores: [], joinedAtRound: 1, leftGame: false },
    Carol: { total: 5, firstPlaces: 0, votesReceived: 3, roundScores: [], joinedAtRound: 1, leftGame: false },
  };
  const { champions, isTie, standings } = resolveStandings(scores);
  assert.deepEqual(champions, ['Alice']);
  assert.equal(isTie, false);
  assert.equal(standings[0].rank, 1);
  assert.equal(standings[1].rank, 2);
  assert.equal(standings[2].rank, 3);
});

test('tie broken by firstPlaces', () => {
  const scores = {
    Alice: { total: 10, firstPlaces: 2, votesReceived: 5, roundScores: [], joinedAtRound: 1, leftGame: false },
    Bob: { total: 10, firstPlaces: 1, votesReceived: 8, roundScores: [], joinedAtRound: 1, leftGame: false },
  };
  const { champions, isTie } = resolveStandings(scores);
  assert.deepEqual(champions, ['Alice']);
  assert.equal(isTie, false);
});

test('tie broken by votesReceived', () => {
  const scores = {
    Alice: { total: 10, firstPlaces: 1, votesReceived: 8, roundScores: [], joinedAtRound: 1, leftGame: false },
    Bob: { total: 10, firstPlaces: 1, votesReceived: 5, roundScores: [], joinedAtRound: 1, leftGame: false },
  };
  const { champions, isTie } = resolveStandings(scores);
  assert.deepEqual(champions, ['Alice']);
  assert.equal(isTie, false);
});

test('full tie: co-champions', () => {
  const scores = {
    Alice: { total: 10, firstPlaces: 1, votesReceived: 5, roundScores: [], joinedAtRound: 1, leftGame: false },
    Bob: { total: 10, firstPlaces: 1, votesReceived: 5, roundScores: [], joinedAtRound: 1, leftGame: false },
  };
  const { champions, isTie, standings } = resolveStandings(scores);
  assert.deepEqual(champions, ['Alice', 'Bob']);
  assert.equal(isTie, true);
  assert.equal(standings[0].rank, 1);
  assert.equal(standings[1].rank, 1);
});

test('left-game player retains rank', () => {
  const scores = {
    Alice: { total: 15, firstPlaces: 2, votesReceived: 10, roundScores: [], joinedAtRound: 1, leftGame: false },
    Bob: { total: 12, firstPlaces: 1, votesReceived: 8, roundScores: [], joinedAtRound: 1, leftGame: true },
    Carol: { total: 5, firstPlaces: 0, votesReceived: 3, roundScores: [], joinedAtRound: 1, leftGame: false },
  };
  const { standings } = resolveStandings(scores);
  assert.equal(standings[1].name, 'Bob');
  assert.equal(standings[1].leftGame, true);
  assert.equal(standings[1].rank, 2);
});

test('three-way tie at rank 1', () => {
  const scores = {
    Alice: { total: 10, firstPlaces: 1, votesReceived: 5, roundScores: [], joinedAtRound: 1, leftGame: false },
    Bob: { total: 10, firstPlaces: 1, votesReceived: 5, roundScores: [], joinedAtRound: 1, leftGame: false },
    Carol: { total: 10, firstPlaces: 1, votesReceived: 5, roundScores: [], joinedAtRound: 1, leftGame: false },
  };
  const { champions, isTie } = resolveStandings(scores);
  assert.equal(champions.length, 3);
  assert.equal(isTie, true);
});

// ─── calculateRoundPoints with speed scoring ───

test('speed scoring: fastest Q and A get +1 each', () => {
  const pairs = [
    { pairDbId: 1, questionAuthor: 'Alice', answerAuthor: 'Bob' },
    { pairDbId: 2, questionAuthor: 'Carol', answerAuthor: 'Dave' },
  ];
  const votesByPair = { 1: 3, 2: 1 };
  const settings = {
    speedScoringEnabled: true,
    speedData: {
      questionTimes: [
        { name: 'Alice', ms: 5000 },
        { name: 'Carol', ms: 15000 },
      ],
      answerTimes: [
        { name: 'Bob', ms: 8000 },
        { name: 'Dave', ms: 25000 },
      ],
      activePlayerCount: 4,
      phaseStartedAt: 0,
    },
  };
  const result = calculateRoundPoints(pairs, votesByPair, settings);
  // Base: Alice 3+2=5, Bob 3+2=5, Carol 1, Dave 1
  // Speed: Alice +1 (fastest Q), Bob +1 (fastest A), Dave -1 (slowest A, 25s >20s, 4 players)
  assert.equal(result.scores['Alice'], 6); // 5 + 1
  assert.equal(result.scores['Bob'], 6);   // 5 + 1
  assert.equal(result.scores['Carol'], 1); // 1 + 0
  assert.equal(result.scores['Dave'], 0);  // 1 - 1
  assert.equal(result.speedDetails.fastestQ, 'Alice');
  assert.equal(result.speedDetails.fastestA, 'Bob');
  assert.equal(result.speedDetails.slowestQ, null); // Carol 15s < 20s, no penalty
  assert.equal(result.speedDetails.slowestA, 'Dave');
});

test('speed scoring: slowest penalty skipped with <4 players', () => {
  const pairs = [
    { pairDbId: 1, questionAuthor: 'Alice', answerAuthor: 'Bob' },
  ];
  const votesByPair = { 1: 2 };
  const settings = {
    speedScoringEnabled: true,
    speedData: {
      questionTimes: [
        { name: 'Alice', ms: 5000 },
        { name: 'Bob', ms: 30000 },
      ],
      answerTimes: [
        { name: 'Bob', ms: 35000 },
      ],
      activePlayerCount: 3,
      phaseStartedAt: 0,
    },
  };
  const result = calculateRoundPoints(pairs, votesByPair, settings);
  // Only 3 players — slowest penalty should NOT apply
  assert.equal(result.speedDetails.slowestQ, null);
  assert.equal(result.speedDetails.slowestA, null);
  // But fastest bonus still applies
  assert.equal(result.speedDetails.fastestQ, 'Alice');
  assert.equal(result.speedDetails.fastestA, 'Bob');
});

test('speed scoring: slowest penalty skipped when <20s', () => {
  const pairs = [
    { pairDbId: 1, questionAuthor: 'Alice', answerAuthor: 'Bob' },
    { pairDbId: 2, questionAuthor: 'Carol', answerAuthor: 'Dave' },
  ];
  const votesByPair = { 1: 2, 2: 1 };
  const settings = {
    speedScoringEnabled: true,
    speedData: {
      questionTimes: [
        { name: 'Alice', ms: 3000 },
        { name: 'Carol', ms: 15000 }, // <20s, no penalty even with 4 players
      ],
      answerTimes: [
        { name: 'Bob', ms: 5000 },
        { name: 'Dave', ms: 18000 }, // <20s, no penalty
      ],
      activePlayerCount: 4,
      phaseStartedAt: 0,
    },
  };
  const result = calculateRoundPoints(pairs, votesByPair, settings);
  assert.equal(result.speedDetails.slowestQ, null);
  assert.equal(result.speedDetails.slowestA, null);
});

test('speed scoring: disabled when speedScoringEnabled is false', () => {
  const pairs = [
    { pairDbId: 1, questionAuthor: 'Alice', answerAuthor: 'Bob' },
  ];
  const votesByPair = { 1: 3 };
  const settings = {
    speedScoringEnabled: false,
    speedData: {
      questionTimes: [{ name: 'Alice', ms: 1000 }],
      answerTimes: [{ name: 'Bob', ms: 1000 }],
      activePlayerCount: 4,
      phaseStartedAt: 0,
    },
  };
  const result = calculateRoundPoints(pairs, votesByPair, settings);
  assert.equal(result.speedDetails.fastestQ, null);
  assert.equal(result.speedDetails.fastestA, null);
  assert.equal(result.speedDetails.slowestQ, null);
  assert.equal(result.speedDetails.slowestA, null);
  // Base only: Alice 3+2=5, Bob 3+2=5
  assert.equal(result.scores['Alice'], 5);
  assert.equal(result.scores['Bob'], 5);
});

test('speed scoring: no speedData provided', () => {
  const pairs = [
    { pairDbId: 1, questionAuthor: 'Alice', answerAuthor: 'Bob' },
  ];
  const votesByPair = { 1: 2 };
  const settings = { speedScoringEnabled: true };
  const result = calculateRoundPoints(pairs, votesByPair, settings);
  // No speedData — speed scoring silently skipped
  assert.equal(result.speedDetails.fastestQ, null);
  assert.equal(result.scores['Alice'], 4); // 2+2 base only
  assert.equal(result.scores['Bob'], 4);
});

test('speed scoring: pointsBreakdown includes combined speed bonus', () => {
  const pairs = [
    { pairDbId: 1, questionAuthor: 'Alice', answerAuthor: 'Bob' },
  ];
  const votesByPair = { 1: 3 };
  const settings = {
    speedScoringEnabled: true,
    speedData: {
      questionTimes: [{ name: 'Alice', ms: 2000 }, { name: 'Bob', ms: 10000 }],
      answerTimes: [{ name: 'Bob', ms: 3000 }, { name: 'Alice', ms: 12000 }],
      activePlayerCount: 2,
      phaseStartedAt: 0,
    },
  };
  const result = calculateRoundPoints(pairs, votesByPair, settings);
  const detail = result.roundWinnerDetails[0];
  assert.ok(detail.pointsBreakdown);
  assert.equal(detail.pointsBreakdown.base, 5); // 3 votes + 2 win
  assert.equal(detail.pointsBreakdown.speed, 2); // Alice fastest Q (+1) + Bob fastest A (+1)
});

test('tallyRound backward compat: no speedDetails computed', () => {
  const pairs = [
    { pairDbId: 1, questionAuthor: 'Alice', answerAuthor: 'Bob' },
  ];
  const result = tallyRound(pairs, { 1: 3 });
  // Alice 3+2=5, Bob 3+2=5 (no speed scoring)
  assert.equal(result.scores['Alice'], 5);
  assert.equal(result.scores['Bob'], 5);
  assert.equal(result.speedDetails.fastestQ, null);
});

test('mergeRoundScores tracks roundSpeedBonuses', () => {
  const scores = {};
  const r1 = calculateRoundPoints(
    [{ pairDbId: 1, questionAuthor: 'Alice', answerAuthor: 'Bob' }],
    { 1: 3 },
    {
      speedScoringEnabled: true,
      speedData: {
        questionTimes: [{ name: 'Alice', ms: 2000 }, { name: 'Bob', ms: 5000 }],
        answerTimes: [{ name: 'Bob', ms: 3000 }, { name: 'Alice', ms: 8000 }],
        activePlayerCount: 2,
        phaseStartedAt: 0,
      },
    }
  );
  mergeRoundScores(scores, r1, 1);
  // Alice: 5 base + 1 speed (fastest Q) = 6
  // Bob: 5 base + 1 speed (fastest A) = 6
  assert.equal(scores['Alice'].total, 6);
  assert.equal(scores['Alice'].roundSpeedBonuses[0], 1);
  assert.equal(scores['Bob'].total, 6);
  assert.equal(scores['Bob'].roundSpeedBonuses[0], 1);
});

// ─── Additional Edge Cases ───

test('speed scoring: exactly 20s threshold (no penalty)', () => {
  const pairs = [
    { pairDbId: 1, questionAuthor: 'Alice', answerAuthor: 'Bob' },
    { pairDbId: 2, questionAuthor: 'Carol', answerAuthor: 'Dave' },
  ];
  const votesByPair = { 1: 2, 2: 1 };
  const settings = {
    speedScoringEnabled: true,
    speedData: {
      questionTimes: [
        { name: 'Alice', ms: 3000 },
        { name: 'Carol', ms: 20000 }, // Exactly 20s - no penalty
      ],
      answerTimes: [
        { name: 'Bob', ms: 5000 },
        { name: 'Dave', ms: 20000 }, // Exactly 20s - no penalty
      ],
      activePlayerCount: 4,
      phaseStartedAt: 0,
    },
  };
  const result = calculateRoundPoints(pairs, votesByPair, settings);
  assert.equal(result.speedDetails.slowestQ, null);
  assert.equal(result.speedDetails.slowestA, null);
});

test('speed scoring: exactly 4 players with slowest >20s (penalty applies)', () => {
  const pairs = [
    { pairDbId: 1, questionAuthor: 'Alice', answerAuthor: 'Bob' },
    { pairDbId: 2, questionAuthor: 'Carol', answerAuthor: 'Dave' },
  ];
  const votesByPair = { 1: 2, 2: 1 };
  const settings = {
    speedScoringEnabled: true,
    speedData: {
      questionTimes: [
        { name: 'Alice', ms: 3000 },
        { name: 'Carol', ms: 21000 }, // >20s with exactly 4 players - penalty
      ],
      answerTimes: [
        { name: 'Bob', ms: 5000 },
        { name: 'Dave', ms: 22000 }, // >20s with exactly 4 players - penalty
      ],
      activePlayerCount: 4,
      phaseStartedAt: 0,
    },
  };
  const result = calculateRoundPoints(pairs, votesByPair, settings);
  assert.equal(result.speedDetails.slowestQ, 'Carol');
  assert.equal(result.speedDetails.slowestA, 'Dave');
  assert.equal(result.scores['Carol'], 0); // 1 base - 1 penalty
  assert.equal(result.scores['Dave'], 0); // 1 base - 1 penalty
});

test('multi-round tournament with cumulative scoring', () => {
  const scores = {};
  
  // Round 1
  const r1 = calculateRoundPoints(
    [{ pairDbId: 1, questionAuthor: 'Alice', answerAuthor: 'Bob' }],
    { 1: 3 },
    { speedScoringEnabled: false }
  );
  mergeRoundScores(scores, r1, 1);
  
  // Round 2
  const r2 = calculateRoundPoints(
    [{ pairDbId: 2, questionAuthor: 'Alice', answerAuthor: 'Carol' }],
    { 2: 2 },
    { speedScoringEnabled: false }
  );
  mergeRoundScores(scores, r2, 2);
  
  // Round 3
  const r3 = calculateRoundPoints(
    [{ pairDbId: 3, questionAuthor: 'Bob', answerAuthor: 'Dave' }],
    { 3: 4 },
    { speedScoringEnabled: false }
  );
  mergeRoundScores(scores, r3, 3);
  
  // Alice: R1(5) + R2(4) = 9
  // Bob: R1(5) + R3(6) = 11
  // Carol: R2(4) = 4 (2 votes + 2 win bonus; only pair in round 2 wins)
  // Dave: R3(6) = 6 (4 votes + 2 win bonus)
  assert.equal(scores['Alice'].total, 9);
  assert.equal(scores['Bob'].total, 11);
  assert.equal(scores['Carol'].total, 4);
  assert.equal(scores['Dave'].total, 6);
  assert.equal(scores['Alice'].firstPlaces, 2);
  assert.equal(scores['Bob'].firstPlaces, 2);
});

test('player leaves mid-tournament and rejoins', () => {
  const scores = {};
  
  // Round 1: All players
  const r1 = calculateRoundPoints(
    [
      { pairDbId: 1, questionAuthor: 'Alice', answerAuthor: 'Bob' },
      { pairDbId: 2, questionAuthor: 'Carol', answerAuthor: 'Dave' },
    ],
    { 1: 3, 2: 2 },
    { speedScoringEnabled: false }
  );
  mergeRoundScores(scores, r1, 1);
  
  // Mark Carol as left
  scores['Carol'].leftGame = true;
  
  // Round 2: Carol rejoins
  const r2 = calculateRoundPoints(
    [{ pairDbId: 3, questionAuthor: 'Carol', answerAuthor: 'Alice' }],
    { 3: 2 },
    { speedScoringEnabled: false }
  );
  mergeRoundScores(scores, r2, 2);
  
  // Carol should have leftGame: true but still get points from round 2
  assert.equal(scores['Carol'].leftGame, true);
  assert.equal(scores['Carol'].total, 6); // R1(2) + R2(4)
  assert.equal(scores['Carol'].joinedAtRound, 1);
});

test('zero-vote round in tournament context', () => {
  const scores = {};
  
  // Round 1: Normal round
  const r1 = calculateRoundPoints(
    [{ pairDbId: 1, questionAuthor: 'Alice', answerAuthor: 'Bob' }],
    { 1: 3 },
    { speedScoringEnabled: false }
  );
  mergeRoundScores(scores, r1, 1);
  
  // Round 2: Zero votes
  const r2 = calculateRoundPoints(
    [{ pairDbId: 2, questionAuthor: 'Alice', answerAuthor: 'Bob' }],
    { 2: 0 },
    { speedScoringEnabled: false }
  );
  mergeRoundScores(scores, r2, 2);
  
  // Alice: R1(5) + R2(0) = 5
  // Bob: R1(5) + R2(0) = 5
  assert.equal(scores['Alice'].total, 5);
  assert.equal(scores['Bob'].total, 5);
  // Zero-vote rounds may not add to roundScores array
  assert.equal(scores['Alice'].roundScores.length, 1);
  assert.equal(scores['Bob'].roundScores.length, 1);
});

test('multiple fluke wins in single round', () => {
  const pairs = [
    { pairDbId: 1, questionAuthor: 'Alice', answerAuthor: 'Alice' },
    { pairDbId: 2, questionAuthor: 'Bob', answerAuthor: 'Bob' },
  ];
  const result = calculateRoundPoints(pairs, { 1: 3, 2: 3 }, { speedScoringEnabled: false });
  // Both are fluke winners with tied votes
  // Alice: 3*2 + 2 + 3 = 11
  // Bob: 3*2 + 2 + 3 = 11
  assert.equal(result.scores['Alice'], 11);
  assert.equal(result.scores['Bob'], 11);
  assert.deepEqual(result.winningPairIds, [1, 2]);
  assert.equal(result.roundWinnerDetails[0].isFluke, true);
  assert.equal(result.roundWinnerDetails[1].isFluke, true);
});

test('player joins mid-tournament (late joiner)', () => {
  const scores = {};

  // Round 1: Original players
  const r1 = calculateRoundPoints(
    [{ pairDbId: 1, questionAuthor: 'Alice', answerAuthor: 'Bob' }],
    { 1: 3 },
    { speedScoringEnabled: false }
  );
  mergeRoundScores(scores, r1, 1);

  // Round 2: New player joins
  const r2 = calculateRoundPoints(
    [
      { pairDbId: 2, questionAuthor: 'Alice', answerAuthor: 'Carol' },
      { pairDbId: 3, questionAuthor: 'Bob', answerAuthor: 'Dave' },
    ],
    { 2: 2, 3: 1 },
    { speedScoringEnabled: false }
  );
  mergeRoundScores(scores, r2, 2);

  // Carol and Dave joined at round 2
  assert.equal(scores['Carol'].joinedAtRound, 2);
  assert.equal(scores['Dave'].joinedAtRound, 2);
  assert.equal(scores['Carol'].roundScores[0], undefined);
  assert.equal(scores['Dave'].roundScores[0], undefined);
  assert.equal(scores['Alice'].joinedAtRound, 1);
  assert.equal(scores['Bob'].joinedAtRound, 1);
});

// ─── Regression tests for audit bugs ───

// H3: round winner detail speed breakdown should reflect both authors
test('round winner pointsBreakdown.speed includes both question and answer author bonuses', () => {
  const pairs = [
    { pairDbId: 1, questionAuthor: 'Alice', answerAuthor: 'Bob' },
  ];
  const votesByPair = { 1: 3 };
  const settings = {
    speedScoringEnabled: true,
    speedData: {
      questionTimes: [{ name: 'Alice', ms: 2000 }, { name: 'Bob', ms: 10000 }],
      answerTimes: [{ name: 'Bob', ms: 3000 }, { name: 'Alice', ms: 12000 }],
      activePlayerCount: 2,
      phaseStartedAt: 0,
    },
  };
  const result = calculateRoundPoints(pairs, votesByPair, settings);
  const detail = result.roundWinnerDetails[0];
  assert.ok(detail.pointsBreakdown);
  assert.equal(detail.pointsBreakdown.base, 5);
  // Alice is fastest Q (+1), Bob is fastest A (+1): combined speed for the pair is 2
  assert.equal(detail.pointsBreakdown.speed, 2);
});

// M1: single submission should not be both fastest and slowest
test('single submission should not receive both fastest and slowest speed awards', () => {
  const pairs = [
    { pairDbId: 1, questionAuthor: 'Alice', answerAuthor: 'Bob' },
  ];
  const votesByPair = { 1: 2 };
  const settings = {
    speedScoringEnabled: true,
    speedData: {
      questionTimes: [{ name: 'Alice', ms: 25000 }], // only one question submission, >20s
      answerTimes: [{ name: 'Bob', ms: 25000 }],     // only one answer submission, >20s
      activePlayerCount: 4,
      phaseStartedAt: 0,
    },
  };
  const result = calculateRoundPoints(pairs, votesByPair, settings);
  // With only one submission, slowest penalty should not apply to the same person
  assert.equal(result.speedDetails.fastestQ, 'Alice');
  assert.equal(result.speedDetails.slowestQ, null);
  assert.equal(result.speedDetails.fastestA, 'Bob');
  assert.equal(result.speedDetails.slowestA, null);
  assert.equal(result.scores['Alice'], 5); // 2 base + 2 win + 1 fastest, no penalty
  assert.equal(result.scores['Bob'], 5);   // 2 base + 2 win + 1 fastest, no penalty
});

// M2: leftGame players should be ranked below present players with equal totals
test('leftGame players are deprioritised in standings', () => {
  const scores = {
    Alice: { total: 10, firstPlaces: 1, votesReceived: 5, roundScores: [], joinedAtRound: 1, leftGame: false },
    Bob: { total: 10, firstPlaces: 1, votesReceived: 5, roundScores: [], joinedAtRound: 1, leftGame: true },
  };
  const { champions, standings } = resolveStandings(scores);
  assert.deepEqual(champions, ['Alice']);
  assert.equal(standings[0].name, 'Alice');
  assert.equal(standings[0].rank, 1);
  assert.equal(standings[1].name, 'Bob');
  assert.equal(standings[1].rank, 2);
});

// L1: joinedAtRound should not be set to current round for a player that already exists
test('mergeRoundScores does not overwrite joinedAtRound for existing players from votesReceived', () => {
  const scores = {
    Alice: { total: 5, roundScores: [5], firstPlaces: 1, votesReceived: 3, joinedAtRound: 1, leftGame: false },
  };
  const r2 = calculateRoundPoints(
    [{ pairDbId: 2, questionAuthor: 'Alice', answerAuthor: 'Bob' }],
    { 2: 2 },
    { speedScoringEnabled: false }
  );
  mergeRoundScores(scores, r2, 2);
  // Alice already existed from round 1, joinedAtRound should stay 1
  assert.equal(scores['Alice'].joinedAtRound, 1);
  assert.equal(scores['Bob'].joinedAtRound, 2);
});
