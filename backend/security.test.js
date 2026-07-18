'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const ioClient = require('socket.io-client');

process.env.PORT = '0';
process.env.CORS_ORIGIN = 'https://what-if-game-v2.onrender.com,http://localhost:3000,http://localhost:3001';
process.env.ADMIN_KEY = 'track1-test-admin-key';
delete process.env.TURSO_DATABASE_URL;
delete process.env.TURSO_AUTH_TOKEN;

const appServer = require('./server.js');

before(async () => {
  await appServer.startServer();
});

after(async () => {
  for (const game of Object.values(appServer.games)) {
    for (const player of game.players) {
      if (player.reconnectTimeout) clearTimeout(player.reconnectTimeout);
    }
  }
  appServer.io.close();
  await new Promise(resolve => appServer.server.close(resolve));
});

function request(path, { method = 'GET', origin, headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const requestHeaders = { ...headers };
    if (origin) requestHeaders.Origin = origin;
    if (body !== undefined) {
      requestHeaders['Content-Type'] = 'application/json';
      requestHeaders['Content-Length'] = Buffer.byteLength(body);
    }

    const req = http.request({
      host: '127.0.0.1',
      port: appServer.server.address().port,
      path,
      method,
      headers: requestHeaders
    }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({
        statusCode: res.statusCode,
        headers: res.headers,
        body: Buffer.concat(chunks).toString()
      }));
    });
    req.on('error', reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

function socketHandshake(origin) {
  return request('/socket.io/?EIO=4&transport=polling', { origin });
}

test('admin authorization has the three required cases', async t => {
  const originalKey = process.env.ADMIN_KEY;

  await t.test('missing ADMIN_KEY returns 503/admin_unconfigured', async () => {
    delete process.env.ADMIN_KEY;
    const response = await request('/api/hide-game', { method: 'POST', body: '{}' });
    const payload = JSON.parse(response.body);

    assert.equal(response.statusCode, 503);
    assert.equal(payload.error, 'admin_unconfigured');
    assert.equal(payload.code, 'admin_unconfigured');
  });

  await t.test('configured ADMIN_KEY rejects a mismatched key', async () => {
    process.env.ADMIN_KEY = originalKey;
    const response = await request('/api/hide-game', {
      method: 'POST',
      headers: { 'x-admin-key': 'wrong-track1-test-key' },
      body: '{}'
    });
    const payload = JSON.parse(response.body);

    assert.equal(response.statusCode, 403);
    assert.equal(payload.error, 'Admin key required');
  });

  await t.test('configured ADMIN_KEY allows the request to reach the route', async () => {
    process.env.ADMIN_KEY = originalKey;
    const response = await request('/api/hide-game', {
      method: 'POST',
      headers: { 'x-admin-key': originalKey },
      body: '{}'
    });
    const payload = JSON.parse(response.body);

    assert.equal(response.statusCode, 400);
    assert.equal(payload.error, 'roomCode required');
  });

  process.env.ADMIN_KEY = originalKey;
});

test('core game remains available when admin controls are unconfigured', async () => {
  const originalKey = process.env.ADMIN_KEY;
  delete process.env.ADMIN_KEY;

  const client = ioClient(`http://127.0.0.1:${appServer.server.address().port}`, {
    transports: ['websocket'],
    forceNew: true
  });

  try {
    await new Promise((resolve, reject) => {
      client.once('connect', resolve);
      client.once('connect_error', reject);
    });

    const response = await new Promise(resolve => {
      client.emit('create-room', 'Track1Host', resolve);
    });

    assert.equal(response.success, true);
    assert.match(response.roomCode, /^\d{4}$/);
  } finally {
    client.disconnect();
    process.env.ADMIN_KEY = originalKey;
  }
});

test('Express CORS allows the production origin and rejects an unlisted origin', async () => {
  process.env.CORS_ORIGIN = 'https://what-if-game-v2.onrender.com,http://localhost:3000,http://localhost:3001';

  const allowed = await request('/api/health', { origin: 'https://what-if-game-v2.onrender.com' });
  assert.equal(allowed.statusCode, 200);
  assert.equal(allowed.headers['access-control-allow-origin'], 'https://what-if-game-v2.onrender.com');

  const rejected = await request('/api/health', { origin: 'https://example.com' });
  assert.notEqual(rejected.statusCode, 200);
  assert.notEqual(rejected.headers['access-control-allow-origin'], 'https://example.com');
});

test('Socket.IO polling handshake allows production origin and rejects an unlisted origin', async () => {
  process.env.CORS_ORIGIN = 'https://what-if-game-v2.onrender.com,http://localhost:3000,http://localhost:3001';

  const allowed = await socketHandshake('https://what-if-game-v2.onrender.com');
  assert.equal(allowed.statusCode, 200);
  assert.equal(allowed.headers['access-control-allow-origin'], 'https://what-if-game-v2.onrender.com');
  assert.match(allowed.body, /^0\{/);

  const rejected = await socketHandshake('https://example.com');
  assert.notEqual(rejected.statusCode, 200);
  assert.notEqual(rejected.headers['access-control-allow-origin'], 'https://example.com');
});

test('Socket.IO WebSocket connection allows production origin and rejects an unlisted origin', async t => {
  process.env.CORS_ORIGIN = 'https://what-if-game-v2.onrender.com,http://localhost:3000,http://localhost:3001';
  const url = `http://127.0.0.1:${appServer.server.address().port}`;

  await t.test('allowed origin connects', async () => {
    const client = ioClient(url, {
      transports: ['websocket'],
      forceNew: true,
      extraHeaders: { Origin: 'https://what-if-game-v2.onrender.com' }
    });
    try {
      await new Promise((resolve, reject) => {
        client.once('connect', resolve);
        client.once('connect_error', reject);
      });
      assert.equal(client.connected, true);
    } finally {
      client.disconnect();
    }
  });

  await t.test('unlisted origin is rejected', async () => {
    const client = ioClient(url, {
      transports: ['websocket'],
      forceNew: true,
      extraHeaders: { Origin: 'https://example.com' }
    });
    try {
      const error = await new Promise(resolve => {
        client.once('connect', () => resolve(null));
        client.once('connect_error', resolve);
      });
      assert.ok(error, 'unlisted origin should not establish a Socket.IO connection');
      assert.equal(client.connected, false);
    } finally {
      client.disconnect();
    }
  });
});
