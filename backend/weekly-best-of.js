/**
 * Weekly Best Of Script
 *
 * Queries the database for top-voted content from the past 7 days
 * and outputs a formatted summary suitable for social media posting.
 *
 * Usage:
 *   node weekly-best-of.js
 *
 * Required env vars:
 *   TURSO_DATABASE_URL - Turso database URL
 *   TURSO_AUTH_TOKEN   - Turso auth token
 *
 * Optional env vars:
 *   WEEKLY_DAYS        - Number of days to look back (default: 7)
 *   WEEKLY_TOP_N       - Number of items per category (default: 5)
 */

const { createClient } = require('@libsql/client');

const DAYS = parseInt(process.env.WEEKLY_DAYS || '7', 10);
const TOP_N = parseInt(process.env.WEEKLY_TOP_N || '5', 10);

async function main() {
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (!url) {
    console.error('Error: TURSO_DATABASE_URL env var is required');
    process.exit(1);
  }

  const client = createClient({ url, authToken });

  const since = new Date(Date.now() - DAYS * 24 * 60 * 60 * 1000).toISOString();
  console.log(`\n📋 Weekly Best Of — Top content from the past ${DAYS} days (since ${since})\n`);

  // Top Q&A pairs
  const pairs = await client.execute({
    sql: `SELECT qp.id, q.text as question, a.text as answer,
                 q.author_name as q_author, a.author_name as a_author,
                 qp.vote_count, qp.anonymous, g.created_at
          FROM qa_pairs qp
          JOIN questions q ON qp.question_id = q.id
          JOIN answers a ON qp.answer_id = a.id
          JOIN games g ON qp.game_id = g.id
          WHERE g.hidden_from_best_of = 0 AND qp.vote_count > 0
                AND (qp.hidden IS NULL OR qp.hidden = 0)
                AND (q.hidden IS NULL OR q.hidden = 0)
                AND (a.hidden IS NULL OR a.hidden = 0)
                AND qp.is_approved = 1
                AND (qp.is_nsfw IS NULL OR qp.is_nsfw = 0)
                AND g.created_at >= ?
          ORDER BY qp.vote_count DESC
          LIMIT ?`,
    args: [since, TOP_N]
  });

  // Top questions
  const questions = await client.execute({
    sql: `SELECT q.id, q.text, q.author_name, q.vote_count, q.anonymous, g.created_at
          FROM questions q
          JOIN games g ON q.game_id = g.id
          WHERE g.hidden_from_best_of = 0 AND q.vote_count > 0
                AND (q.hidden IS NULL OR q.hidden = 0)
                AND g.created_at >= ?
          ORDER BY q.vote_count DESC
          LIMIT ?`,
    args: [since, TOP_N]
  });

  // Top answers
  const answers = await client.execute({
    sql: `SELECT a.id, a.text, a.author_name, a.vote_count, a.anonymous, g.created_at
          FROM answers a
          JOIN games g ON a.game_id = g.id
          WHERE g.hidden_from_best_of = 0 AND a.vote_count > 0
                AND (a.hidden IS NULL OR a.hidden = 0)
                AND g.created_at >= ?
          ORDER BY a.vote_count DESC
          LIMIT ?`,
    args: [since, TOP_N]
  });

  // Game stats
  const stats = await client.execute({
    sql: `SELECT COUNT(*) as total_games, COUNT(DISTINCT g.id) as games_with_votes
          FROM games g
          WHERE g.hidden_from_best_of = 0 AND g.created_at >= ?`,
    args: [since]
  });

  const totalGames = stats.rows[0]?.total_games || 0;

  // --- Output ---
  let output = '';

  output += `🎮 WHAT IF GAME — Weekly Best Of\n`;
  output += `📅 Past ${DAYS} days • ${totalGames} games played\n`;
  output += `${'─'.repeat(50)}\n\n`;

  // Q&A Pairs section
  output += `🏆 TOP Q&A PAIRS\n\n`;
  if (pairs.rows.length === 0) {
    output += `  No Q&A pairs with votes this week yet.\n\n`;
  } else {
    pairs.rows.forEach((row, i) => {
      const anon = row.anonymous === 1 || row.anonymous === true;
      const qAuthor = anon ? '???' : (row.q_author || 'Unknown');
      const aAuthor = anon ? '???' : (row.a_author || 'Unknown');
      output += `${i + 1}. (${row.vote_count} votes)\n`;
      output += `   ❓ ${row.question}\n`;
      output += `   💬 ${row.answer}\n`;
      if (!anon) output += `   ✍️ Q by ${qAuthor} • A by ${aAuthor}\n`;
      output += `\n`;
    });
  }

  // Top Questions section
  output += `❓ TOP QUESTIONS\n\n`;
  if (questions.rows.length === 0) {
    output += `  No questions with votes this week yet.\n\n`;
  } else {
    questions.rows.forEach((row, i) => {
      const anon = row.anonymous === 1 || row.anonymous === true;
      const author = anon ? '???' : (row.author_name || 'Unknown');
      output += `${i + 1}. (${row.vote_count} votes) ${row.text}\n`;
      if (!anon) output += `   ✍️ by ${author}\n`;
      output += `\n`;
    });
  }

  // Top Answers section
  output += `💬 TOP ANSWERS\n\n`;
  if (answers.rows.length === 0) {
    output += `  No answers with votes this week yet.\n\n`;
  } else {
    answers.rows.forEach((row, i) => {
      const anon = row.anonymous === 1 || row.anonymous === true;
      const author = anon ? '???' : (row.author_name || 'Unknown');
      output += `${i + 1}. (${row.vote_count} votes) ${row.text}\n`;
      if (!anon) output += `   ✍️ by ${author}\n`;
      output += `\n`;
    });
  }

  output += `${'─'.repeat(50)}\n`;
  output += `Play & vote at your next game night! 🎉\n`;
  output += `#WhatIfGame #PartyGame #GameNight\n`;

  // Print to console
  console.log(output);

  // Also write to file for easy sharing
  const fs = require('fs');
  const path = require('path');
  const filename = `weekly-best-of-${new Date().toISOString().slice(0, 10)}.txt`;
  const filepath = path.join(__dirname, filename);
  fs.writeFileSync(filepath, output);
  console.log(`\n✅ Saved to ${filepath}`);

  process.exit(0);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
