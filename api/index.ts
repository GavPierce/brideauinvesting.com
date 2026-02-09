import { Database } from "bun:sqlite";

// Initialize in-memory SQLite database (you can replace ":memory:" with a file path for persistent storage)
const db = new Database("./data/database.db");

// Initialize tables
db.run(`
  CREATE TABLE IF NOT EXISTS channels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE
  );
`);

db.run(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    public_id TEXT UNIQUE,
    name TEXT,
    online BOOLEAN DEFAULT FALSE
  );
`);

db.run(`
CREATE TABLE IF NOT EXISTS visits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  channel_id INTEGER,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP, -- Full timestamp for each visit
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (channel_id) REFERENCES channels(id)
);
`);

// ─── Auth tables ─────────────────────────────────────────────────────────────
db.run(`
  CREATE TABLE IF NOT EXISTS accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    display_name TEXT,
    role TEXT DEFAULT 'viewer',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

db.run(`
  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INTEGER NOT NULL,
    token TEXT UNIQUE NOT NULL,
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (account_id) REFERENCES accounts(id)
  );
`);

db.run(`
  CREATE TABLE IF NOT EXISTS invites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token TEXT UNIQUE NOT NULL,
    email TEXT,
    role TEXT DEFAULT 'viewer',
    used INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME NOT NULL
  );
`);

db.run(`CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token)`);
db.run(`CREATE INDEX IF NOT EXISTS idx_invites_token ON invites(token)`);
db.run(`CREATE INDEX IF NOT EXISTS idx_accounts_email ON accounts(email)`);

// Performance indexes for hot query paths
db.run(`CREATE INDEX IF NOT EXISTS idx_visits_user_channel_ts ON visits(user_id, channel_id, timestamp DESC)`);
db.run(`CREATE INDEX IF NOT EXISTS idx_visits_channel_id ON visits(channel_id)`);
db.run(`CREATE INDEX IF NOT EXISTS idx_visits_timestamp ON visits(timestamp)`);
db.run(`CREATE INDEX IF NOT EXISTS idx_users_public_id ON users(public_id)`);
db.run(`CREATE INDEX IF NOT EXISTS idx_channels_name ON channels(name)`);

// ─── Auth helpers ────────────────────────────────────────────────────────────
function generateToken(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let token = '';
  for (let i = 0; i < 48; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}

async function hashPassword(password: string): Promise<string> {
  return await Bun.password.hash(password, { algorithm: "bcrypt", cost: 10 });
}

async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return await Bun.password.verify(password, hash);
}

function getAccountFromSession(token: string | null): any {
  if (!token) return null;
  const row = db.query(`
    SELECT a.id, a.email, a.display_name, a.role, a.created_at
    FROM sessions s
    JOIN accounts a ON s.account_id = a.id
    WHERE s.token = ? AND s.expires_at > datetime('now')
  `).get(token) as any;
  return row || null;
}

function corsHeaders() {
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

type visit = {
  user_id: number;
  channel_id: number;
  timestamp: string;
};

type user = {
  id: number;
  public_id: string;
  name: string;
  online: boolean;
};

// Prepared statements — compiled once, reused every call
const stmtInsertChannel = db.query(`INSERT OR IGNORE INTO channels (name) VALUES (?)`);
const stmtSelectChannel = db.query<any, any>(`SELECT id FROM channels WHERE name = ?`);
const stmtInsertUser = db.query(`INSERT OR IGNORE INTO users (public_id, name, online) VALUES (?, ?, false)`);
const stmtSelectUser = db.query<any, any>(`SELECT id FROM users WHERE public_id = ?`);
const stmtLastVisit = db.query<any, any>(`SELECT timestamp FROM visits WHERE user_id = ? AND channel_id = ? ORDER BY timestamp DESC LIMIT 1`);
const stmtInsertVisit = db.query(`INSERT INTO visits (user_id, channel_id, timestamp) VALUES (?, ?, ?)`);
const stmtMarkOnline = db.query(`UPDATE users SET online = true WHERE id = ?`);

// In-memory caches to avoid repeated DB lookups (cleared each scrape cycle)
const channelIdCache = new Map<string, number>();
const userIdCache = new Map<string, number>();

// Function to insert or get a channel ID
function getOrCreateChannelId(channelName: string): number {
  const cached = channelIdCache.get(channelName);
  if (cached !== undefined) return cached;

  stmtInsertChannel.run(channelName);
  const channel = stmtSelectChannel.get(channelName);
  const id = channel?.id ?? -1;
  if (id !== -1) channelIdCache.set(channelName, id);
  return id;
}

// Function to insert or get a user ID
function getOrCreateUserId(public_id: string, name: string): number {
  const cached = userIdCache.get(public_id);
  if (cached !== undefined) return cached;

  stmtInsertUser.run(public_id, name);
  const user = stmtSelectUser.get(public_id);
  const id = user?.id ?? -1;
  if (id !== -1) userIdCache.set(public_id, id);
  return id;
}

// Function to log a visit and mark user as online
function logVisit(
  user_id: number,
  channel_id: number,
  timestamp: string
): void {
  // Get the last visit for this user in this channel
  const lastVisit: visit = stmtLastVisit.get(user_id, channel_id) as visit;

  // Convert timestamps to Date objects for comparison
  const lastVisitDate = lastVisit ? new Date(lastVisit.timestamp) : null;
  const currentVisitDate = new Date(timestamp);

  // Time threshold in milliseconds (e.g., 10 minutes = 10 * 60 * 1000 ms)
  const timeThreshold = 10 * 60 * 1000;

  let shouldLogVisit = true;

  if (lastVisitDate) {
    if (currentVisitDate.getTime() - lastVisitDate.getTime() < timeThreshold) {
      shouldLogVisit = false;
    }
  }
  // Only log a new visit if the last visit was more than the threshold ago
  if (shouldLogVisit) {
    stmtInsertVisit.run(user_id, channel_id, timestamp);
  } else {
  }

  // Mark the user as online
  stmtMarkOnline.run(user_id);
}

// Function to mark users as offline if they were previously online but are not in the current list of users
// Uses a temp table to avoid building queries with thousands of placeholders
db.run(`CREATE TEMP TABLE IF NOT EXISTS _active_ids (user_id INTEGER PRIMARY KEY)`);
const stmtInsertActiveId = db.query(`INSERT INTO _active_ids (user_id) VALUES (?)`);

function updateOnlineStatus(activeUserIds: Set<number> | number[]): void {
  const userIdArray = Array.isArray(activeUserIds) ? activeUserIds : Array.from(activeUserIds);

  // Populate the temp table with the active user IDs
  db.run(`DELETE FROM _active_ids`);

  if (userIdArray.length > 0) {
    for (const id of userIdArray) {
      stmtInsertActiveId.run(id);
    }

    // Set users with IDs in `activeUserIds` as online
    db.run(`
      UPDATE users 
      SET online = true
      WHERE id IN (SELECT user_id FROM _active_ids)
      AND online = false
    `);

    // Set users as offline who are not in `activeUserIds` but are currently online
    db.run(`
      UPDATE users 
      SET online = false 
      WHERE id NOT IN (SELECT user_id FROM _active_ids)
      AND online = true
    `);
  } else {
    // If no active users, set all online users as offline
    db.run(`
      UPDATE users 
      SET online = false 
      WHERE online = true
    `);
  }

  // Clean up temp table
  db.run(`DELETE FROM _active_ids`);
}

// Helper function to validate channel names
function isValidChannelName(channel: any): boolean {
  return channel != null && typeof channel === 'string' && channel.trim() !== '';
}

// Simulate fetching online users from the API (this should be called periodically)
// Use a Set for O(1) lookups and automatic deduplication
let activeUserIds: Set<number> = new Set();
const MAX_ACTIVE_USERS = 10000; // Prevent unbounded memory growth

async function fetchAndLogUsers(channelName: string): Promise<{ rateLimited: boolean }> {
  // Validate channel name before processing
  if (!isValidChannelName(channelName)) {
    return { rateLimited: false }; // Silently skip invalid channels
  }

  try {
    // Add timeout to prevent hanging
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

    const response = await fetch(
      `https://new-api.ceo.ca/api/channels/online_users?channel=${encodeURIComponent(channelName)}`,
      { signal: controller.signal }
    );

    clearTimeout(timeoutId);

    if (response.status === 429) {
      console.warn(`[${new Date().toISOString()}] ⚠️  Rate limited on: ${channelName}`);
      return { rateLimited: true };
    }

    if (!response.ok) {
      console.error(`[${new Date().toISOString()}] ❌ Failed: ${channelName} (${response.status})`);
      return { rateLimited: false };
    }

    const data = (await response.json()) as any;

    // Skip channels with no online users — saves all DB work
    if (!data?.users || data.num_online === 0) {
      return { rateLimited: false };
    }

    const timestamp = new Date().toISOString();
    // Hoist channel ID lookup outside the per-user loop (same for every user)
    const channel_id = getOrCreateChannelId(channelName);

    for (const user of data.users) {
      const user_id = getOrCreateUserId(user.public_id, user.name || "Unknown");
      logVisit(user_id, channel_id, timestamp);
      // Add to Set with size limit to prevent memory leaks
      if (activeUserIds.size < MAX_ACTIVE_USERS) {
        activeUserIds.add(user_id);
      }
    }
  } catch (error: any) {
    if (error.name === 'AbortError') {
      console.error(`[${new Date().toISOString()}] ⏰ Timeout: ${channelName}`);
    } else {
      console.error(`[${new Date().toISOString()}] ❌ Error: ${channelName} - ${error.message}`);
    }
  }
  return { rateLimited: false };
}

// Serve an HTML page displaying user visit history and online status
const server = Bun.serve({
  port: 3008,
  async fetch(req) {
    const requestStart = Date.now();
    const url = new URL(req.url);
    const requestId = Math.random().toString(36).substring(7);

    console.log(`[${new Date().toISOString()}] [${requestId}] ➡️  ${req.method} ${url.pathname}${url.search}`);

    // Health check endpoint - should always respond quickly
    if (url.pathname === "/api/health") {
      const totalElapsed = Date.now() - requestStart;

      // Get memory usage statistics
      const memUsage = process.memoryUsage();
      const formatBytes = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(2)} MB`;

      const status = {
        status: "ok",
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        uptimeFormatted: `${Math.floor(process.uptime() / 86400)}d ${Math.floor((process.uptime() % 86400) / 3600)}h ${Math.floor((process.uptime() % 3600) / 60)}m`,
        isFetchingUsers,
        activeUsersTracked: activeUserIds.size,
        memory: {
          heapUsed: formatBytes(memUsage.heapUsed),
          heapTotal: formatBytes(memUsage.heapTotal),
          rss: formatBytes(memUsage.rss),
          external: formatBytes(memUsage.external),
          heapUsedRaw: memUsage.heapUsed,
          heapTotalRaw: memUsage.heapTotal,
        },
        responseTime: totalElapsed
      };
      console.log(`[${new Date().toISOString()}] [${requestId}] ⬅️  Health check (${totalElapsed}ms) - Heap: ${status.memory.heapUsed}/${status.memory.heapTotal}`);
      return new Response(JSON.stringify(status, null, 2), {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    if (url.pathname === "/api/visits/chageDates") {
      // add 100 random visits, 50 for yesterday and 50 for tomorrow, randomly for all channels and users

      for (let i = 0; i < 2000; i++) {
        const randomChannel = "gshr";
        const randomUser = Math.floor(Math.random() * 10) + 1;
        const randomDate = new Date();
        let randomNumberBetweenZeroAnd7 = Math.floor(Math.random() * 7);

        // spread it evenly acroos the last 7 days
        randomDate.setDate(randomDate.getDate() - randomNumberBetweenZeroAnd7);

        const randomTimestamp = randomDate.toISOString();
        logVisit(
          randomUser,
          getOrCreateChannelId(randomChannel),
          randomTimestamp
        );
      }

      return new Response(JSON.stringify({}), {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*", // Allow all origins
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS", // Specify allowed methods
          "Access-Control-Allow-Headers": "Content-Type", // Specify allowed headers
        },
      });
    }

    if (url.pathname === "/api/visits/totalWeekly") {
      const query = `
      SELECT COUNT(*) as count
      FROM visits
      WHERE timestamp >= datetime('now', 'weekday 0', '-7 days')
      AND timestamp < datetime('now', 'weekday 0');
    `;

      const data = db.query(query).get();

      return new Response(JSON.stringify(data), {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*", // Allow all origins
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS", // Specify allowed methods
          "Access-Control-Allow-Headers": "Content-Type", // Specify allowed headers
        },
      });
    }
    if (url.pathname === "/api/visits/clearFutureVisits") {
      const query = `
      DELETE FROM visits
      WHERE timestamp >= datetime('now', 'localtime', '+1 day');
      `;
      // console log how many visits were deleted
      let data = db.query(query).all();
      return new Response(JSON.stringify({ data }), {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*", // Allow all origins
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS", // Specify allowed methods
          "Access-Control-Allow-Headers": "Content-Type", // Specify allowed headers
        },
      });
    }
    if (url.pathname === "/api/visits/daily") {
      const channel = url.searchParams.get("channel");
      const startDate = url.searchParams.get("start");
      const endDate = url.searchParams.get("end");

      if (!channel) {
        return new Response("Missing parameters", { status: 400 });
      }

      if (!startDate || !endDate) {
        const query = `
        SELECT *
        FROM visits
        WHERE channel_id = (SELECT id FROM channels WHERE name = ?)
        ORDER BY timestamp;
      `;

        const data = db.query(query).all(channel);

        return new Response(JSON.stringify(data), {
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*", // Allow all origins
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS", // Specify allowed methods
            "Access-Control-Allow-Headers": "Content-Type", // Specify allowed headers
          },
        });
      }
      // SQL query to aggregate visits by day using timestamp
      const query = `
        SELECT DATE(timestamp) as visit_date, COUNT(*) AS visit_count
        FROM visits
        WHERE channel_id = (SELECT id FROM channels WHERE name = ?)
        AND timestamp BETWEEN ? AND ?
        GROUP BY visit_date
        ORDER BY visit_date;
      `;

      const data = db.query(query).all(channel, startDate, endDate);

      return new Response(JSON.stringify(data), {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*", // Allow all origins
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS", // Specify allowed methods
          "Access-Control-Allow-Headers": "Content-Type", // Specify allowed headers
        },
      });
    }
    if (url.pathname === "/api/visits/daily/lastSevenDays") {
      const channel = url.searchParams.get("channel");
      let timeZone = url.searchParams.get("timeZone");
      if (!timeZone) {
        timeZone = "CST";
      }
      if (!channel) {
        return new Response("Missing parameters", { status: 400 });
      }
      const query = `
      SELECT 
        strftime('%Y-%m-%d', timestamp, '-6 hours') AS visit_date,  -- Convert UTC to CST
        COUNT(*) AS visit_count
      FROM visits
      WHERE channel_id = (SELECT id FROM channels WHERE name = ?)
        AND timestamp > DATE('now', '-7 days')
      GROUP BY visit_date
      ORDER BY visit_date;
    `;

      return new Response(JSON.stringify(db.query(query).all(channel)), {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*", // Allow all origins
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS", // Specify allowed methods
          "Access-Control-Allow-Headers": "Content-Type", // Specify allowed headers
        },
      });
    }
    if (url.pathname === "/api/visits/trendingChannel") {
      // Determine the channel with the largest week-over-week delta, with pct change for context
      const query = `
        WITH this_week AS (
          SELECT channel_id, COUNT(*) AS cnt
          FROM visits
          WHERE timestamp >= datetime('now', '-7 days')
          GROUP BY channel_id
        ), last_week AS (
          SELECT channel_id, COUNT(*) AS cnt
          FROM visits
          WHERE timestamp >= datetime('now', '-14 days')
            AND timestamp < datetime('now', '-7 days')
          GROUP BY channel_id
        )
        SELECT 
          c.name AS channel,
          COALESCE(t.cnt, 0) AS current,
          COALESCE(l.cnt, 0) AS previous,
          (COALESCE(t.cnt, 0) - COALESCE(l.cnt, 0)) AS delta,
          CASE 
            WHEN COALESCE(l.cnt, 0) = 0 THEN NULL 
            ELSE ROUND(((COALESCE(t.cnt, 0) - COALESCE(l.cnt, 0)) * 100.0) / COALESCE(l.cnt, 0), 2)
          END AS pct_change
        FROM channels c
        LEFT JOIN this_week t ON c.id = t.channel_id
        LEFT JOIN last_week l ON c.id = l.channel_id
        ORDER BY delta DESC, pct_change DESC NULLS LAST
        LIMIT 1;
      `;

      // SQLite in Bun may not support "NULLS LAST"; provide fallback if needed
      let result: any;
      try {
        result = db.query(query).get();
      } catch (e) {
        const fallbackQuery = `
          WITH this_week AS (
            SELECT channel_id, COUNT(*) AS cnt
            FROM visits
            WHERE timestamp >= datetime('now', '-7 days')
            GROUP BY channel_id
          ), last_week AS (
            SELECT channel_id, COUNT(*) AS cnt
            FROM visits
            WHERE timestamp >= datetime('now', '-14 days')
              AND timestamp < datetime('now', '-7 days')
            GROUP BY channel_id
          )
          SELECT 
            c.name AS channel,
            COALESCE(t.cnt, 0) AS current,
            COALESCE(l.cnt, 0) AS previous,
            (COALESCE(t.cnt, 0) - COALESCE(l.cnt, 0)) AS delta,
            CASE 
              WHEN COALESCE(l.cnt, 0) = 0 THEN NULL 
              ELSE ROUND(((COALESCE(t.cnt, 0) - COALESCE(l.cnt, 0)) * 100.0) / COALESCE(l.cnt, 0), 2)
            END AS pct_change,
            (pct_change IS NULL) AS pct_is_null
          FROM channels c
          LEFT JOIN this_week t ON c.id = t.channel_id
          LEFT JOIN last_week l ON c.id = l.channel_id
          ORDER BY pct_is_null ASC, delta DESC
          LIMIT 1;
        `;
        result = db.query(fallbackQuery).get();
      }

      return new Response(JSON.stringify(result ?? {}), {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }
    if (url.pathname === "/api/visits/hourly") {
      const channel = url.searchParams.get("channel");
      const lastHours = url.searchParams.get("lastHours");

      if (!channel || !lastHours) {
        return new Response("Missing parameters", { status: 400 });
      }
      const query = `
        SELECT DATE(timestamp) as visit_date, COUNT(*) AS visit_count
        FROM visits
        WHERE channel_id = (SELECT id FROM channels WHERE name = ?)
        AND timestamp > DATETIME('now', '-${lastHours} hours')
        GROUP BY visit_date
        ORDER BY visit_date;
      `;

      return new Response(JSON.stringify(db.query(query).all(channel)), {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*", // Allow all origins
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS", // Specify allowed methods
          "Access-Control-Allow-Headers": "Content-Type", // Specify allowed headers
        },
      });
    }

    if (url.pathname === "/api/channels/online_users") {
      const channel = url.searchParams.get("channel");

      if (!channel) {
        return new Response("Missing parameters", { status: 400 });
      }

      const query = `
        SELECT *
        FROM users
        WHERE id IN (
          SELECT user_id
          FROM visits
          WHERE channel_id = (SELECT id FROM channels WHERE name = ?)
          GROUP BY user_id
          HAVING COUNT(*) > 1
        );
      `;

      return new Response(JSON.stringify(db.query(query).all(channel)), {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*", // Allow all origins
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS", // Specify allowed methods
          "Access-Control-Allow-Headers": "Content-Type", // Specify allowed headers
        },
      });
    }

    if (url.pathname === "/api/users") {
      const query = `
        SELECT *
        FROM users
        ORDER BY name;
      `;

      return new Response(JSON.stringify(db.query(query).all()), {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*", // Allow all origins
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS", // Specify allowed methods
          "Access-Control-Allow-Headers": "Content-Type", // Specify allowed headers
        },
      });
    }

    if (url.pathname === "/api/user/getByName") {
      const name = url.searchParams.get("name");

      if (!name) {
      }
      const query = `
        SELECT *
        FROM users
        WHERE name = ?;
      `;

      return new Response(JSON.stringify(db.query(query).all(name)), {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*", // Allow all origins
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS", // Specify allowed methods
          "Access-Control-Allow-Headers": "Content-Type", // Specify allowed headers
        },
      });
    }
    if (url.pathname === "/api/usersByChannel") {
      const channel = url.searchParams.get("channel");
      const page = parseInt(url.searchParams.get("page") || "1");
      const limit = parseInt(url.searchParams.get("limit") || "100");

      if (!channel) {
        return new Response("Missing parameters", { status: 400 });
      }

      // Calculate offset based on the page and limit
      const offset = (page - 1) * limit;

      // Get paginated users with last visit information
      const query = `
        SELECT u.*, v.last_visit
        FROM users u
        JOIN (
          SELECT user_id, MAX(timestamp) AS last_visit
          FROM visits
          WHERE channel_id = (SELECT id FROM channels WHERE name = ?)
          GROUP BY user_id
        ) v ON u.id = v.user_id
        ORDER BY v.last_visit DESC
        LIMIT ? OFFSET ?;
      `;

      const results = db.query(query).all(channel, limit, offset);

      return new Response(JSON.stringify(results), {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    if (url.pathname === "/api/visitsByUser") {
      const userName = url.searchParams.get("user");
      const publicId = url.searchParams.get("public_id");
      const userIdParam = url.searchParams.get("userId");

      let query = ``;
      let params: any[] = [];

      if (publicId) {
        // Prefer exact match by public_id when provided
        query = `
          SELECT visits.*, channels.name as channel_name
          FROM visits
          JOIN channels ON visits.channel_id = channels.id
          WHERE visits.user_id = (SELECT id FROM users WHERE public_id = ?)
          ORDER BY visits.timestamp DESC;
        `;
        params = [publicId];
      } else if (userIdParam) {
        // Allow direct lookup by numeric userId
        query = `
          SELECT visits.*, channels.name as channel_name
          FROM visits
          JOIN channels ON visits.channel_id = channels.id
          WHERE visits.user_id = ?
          ORDER BY visits.timestamp DESC;
        `;
        params = [Number(userIdParam)];
      } else if (userName) {
        // Fallback: names are not unique; include all matching user ids
        query = `
          SELECT visits.*, channels.name as channel_name
          FROM visits
          JOIN channels ON visits.channel_id = channels.id
          WHERE visits.user_id IN (SELECT id FROM users WHERE name = ?)
          ORDER BY visits.timestamp DESC;
        `;
        params = [userName];
      } else {
        return new Response("Missing parameters", { status: 400 });
      }

      return new Response(JSON.stringify(db.query(query).all(...params)), {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*", // Allow all origins
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS", // Specify allowed methods
          "Access-Control-Allow-Headers": "Content-Type", // Specify allowed headers
        },
      });
    }

    // create an API that returns all the visits from a channel, with Username and if their online or not.
    if (url.pathname === "/api/visitsByChannel") {
      const channel = url.searchParams.get("channel");
      const page = parseInt(url.searchParams.get("page") || "1");
      const limit = parseInt(url.searchParams.get("limit") || "100");

      if (!channel) {
        return new Response("Missing parameters", { status: 400 });
      }

      // Calculate offset based on the page and limit
      const offset = (page - 1) * limit;

      // Get paginated visits, including username and online status
      const query = `
        SELECT v.*, u.name, u.online
        FROM visits v
        JOIN users u ON v.user_id = u.id
        WHERE v.channel_id = (SELECT id FROM channels WHERE name = ?)
        ORDER BY v.timestamp DESC
        LIMIT ? OFFSET ?;
      `;

      const results = db.query(query).all(channel, limit, offset);

      console.log('Got Results', results.length);
      return new Response(JSON.stringify(results), {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }


    if (url.pathname === "/api/addChannels") {
      if (req.method === "OPTIONS") {
        // Handle the preflight request
        return new Response(null, {
          headers: {
            "Access-Control-Allow-Origin": "*", // Allow all origins
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS", // Specify allowed methods
            "Access-Control-Allow-Headers": "Content-Type", // Specify allowed headers
          },
        });
      }
      if (req.method === "POST") {
        const body = (await req.json()) as any;
        let channels = body.channels;
        const pin = body.pin;

        if (channels == null || channels.length == 0) {
          return new Response("Channel list is empty", {
            status: 400,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*", // Allow all origins
              "Access-Control-Allow-Methods": "GET, POST, OPTIONS", // Specify allowed methods
              "Access-Control-Allow-Headers": "Content-Type", // Specify allowed headers
            },
          });
        }

        // Filter out empty, null, or whitespace-only channel names
        channels = channels.filter((ch: any) => isValidChannelName(ch));

        if (channels.length === 0) {
          return new Response("All channel names are invalid (empty or whitespace)", {
            status: 400,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
              "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
              "Access-Control-Allow-Headers": "Content-Type",
            },
          });
        }

        if (pin != 4756) {
          return new Response("Incorrect Auth Pin", {
            status: 401,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*", // Allow all origins
              "Access-Control-Allow-Methods": "GET, POST, OPTIONS", // Specify allowed methods
              "Access-Control-Allow-Headers": "Content-Type", // Specify allowed headers
            },
          });
        }

        // 1. Read the existing data from the JSON file - async for non-blocking I/O
        const channelsFile = Bun.file("channels.json");
        const data = await channelsFile.text();
        let existingStrings = JSON.parse(data);

        // Clean existing strings - remove any empty/invalid entries
        existingStrings = existingStrings.filter((ch: any) => isValidChannelName(ch));

        // 2. Filter out strings that already exist
        const uniqueNewStrings = channels.filter(
          (newString: any) => !existingStrings.includes(newString)
        );

        // 3. Add the unique strings to the existing array
        const updatedStrings = [...existingStrings, ...uniqueNewStrings];

        // 4. Write the updated array back to the JSON file - async write
        await Bun.write(
          "channels.json",
          JSON.stringify(updatedStrings, null, 2)
        );

        console.log(`[${new Date().toISOString()}] ✅ Added ${uniqueNewStrings.length} new channels, cleaned ${channels.length - uniqueNewStrings.length} duplicates`);

        return new Response(JSON.stringify({ channels: uniqueNewStrings, added: uniqueNewStrings.length }), {
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*", // Allow all origins
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS", // Specify allowed methods
            "Access-Control-Allow-Headers": "Content-Type", // Specify allowed headers
          },
        });
      }
    }
    if (url.pathname === "/api/removeChannels") {
      if (req.method === "OPTIONS") {
        // Handle the preflight request
        return new Response(null, {
          headers: {
            "Access-Control-Allow-Origin": "*", // Allow all origins
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS", // Specify allowed methods
            "Access-Control-Allow-Headers": "Content-Type", // Specify allowed headers
          },
        });
      }
      if (req.method === "POST") {
        const body = (await req.json()) as any;
        const channels = body.channels;
        const pin = body.pin;
        if (channels == null || channels.length == 0 || channels[0] == "") {
          return new Response("Channel list is empty", {
            status: 400,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*", // Allow all origins
              "Access-Control-Allow-Methods": "GET, POST, OPTIONS", // Specify allowed methods
              "Access-Control-Allow-Headers": "Content-Type", // Specify allowed headers
            },
          });
        }
        if (pin != 4756) {
          return new Response("Incorrect Auth Pin", {
            status: 401,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*", // Allow all origins
              "Access-Control-Allow-Methods": "GET, POST, OPTIONS", // Specify allowed methods
              "Access-Control-Allow-Headers": "Content-Type", // Specify allowed headers
            },
          });
        }

        // 1. Read the existing data from the JSON file - async for non-blocking I/O
        const channelsFile = Bun.file("channels.json");
        const data = await channelsFile.text();
        const existingStrings = JSON.parse(data);

        // remove the strings from the existing array
        const updatedStrings = existingStrings.filter(
          (existingString: any) => !channels.includes(existingString)
        );

        // 4. Write the updated array back to the JSON file - async write
        await Bun.write(
          "channels.json",
          JSON.stringify(updatedStrings, null, 2)
        );

        return new Response(JSON.stringify({ channels: channels }), {
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*", // Allow all origins
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS", // Specify allowed methods
            "Access-Control-Allow-Headers": "Content-Type", // Specify allowed headers
          },
        });
      }
    }

    if (url.pathname === "/api/cleanChannels") {
      // Endpoint to clean up invalid channels from channels.json
      if (req.method === "OPTIONS") {
        return new Response(null, {
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
          },
        });
      }

      if (req.method === "POST") {
        try {
          const body = (await req.json()) as any;
          const pin = body.pin;

          if (pin != 4756) {
            return new Response("Incorrect Auth Pin", {
              status: 401,
              headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type",
              },
            });
          }

          console.log(`[${new Date().toISOString()}] [${requestId}] 🧹 Cleaning channels.json...`);

          // Async file read for non-blocking I/O
          const channelsFile = Bun.file("channels.json");
          const data = await channelsFile.text();
          let channels = JSON.parse(data);
          const originalCount = channels.length;

          // Filter out invalid channel names
          channels = channels.filter((ch: any) => isValidChannelName(ch));

          const removedCount = originalCount - channels.length;

          // Write cleaned channels back - async write
          await Bun.write(
            "channels.json",
            JSON.stringify(channels, null, 2)
          );

          console.log(`[${new Date().toISOString()}] [${requestId}] ✅ Cleaned ${removedCount} invalid channels`);

          return new Response(JSON.stringify({
            original: originalCount,
            cleaned: channels.length,
            removed: removedCount,
            channels
          }), {
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
              "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
              "Access-Control-Allow-Headers": "Content-Type",
            },
          });
        } catch (error: any) {
          console.error(`[${new Date().toISOString()}] [${requestId}] ❌ Error cleaning channels:`, error.message);
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
              "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
              "Access-Control-Allow-Headers": "Content-Type",
            },
          });
        }
      }
    }

    if (url.pathname === "/api/getChannels") {
      try {
        console.log(`[${new Date().toISOString()}] [${requestId}] 📖 Reading channels.json...`);
        const fileReadStart = Date.now();

        // Use Bun.file() for async, non-blocking file check and read
        const channelsFile = Bun.file("channels.json");
        const fileExists = await channelsFile.exists();

        if (!fileExists) {
          const err = `channels.json not found in ${process.cwd()}`;
          console.error(`[${new Date().toISOString()}] [${requestId}] ❌ ${err}`);
          return new Response(JSON.stringify({ error: err }), {
            status: 404,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
              "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
              "Access-Control-Allow-Headers": "Content-Type",
            },
          });
        }

        const data = await channelsFile.text();
        const fileReadElapsed = Date.now() - fileReadStart;
        console.log(`[${new Date().toISOString()}] [${requestId}] File read in ${fileReadElapsed}ms`);

        let channels = JSON.parse(data);
        const originalCount = channels.length;

        // Filter out invalid channel names (empty, null, or whitespace-only)
        channels = channels.filter((ch: any) => isValidChannelName(ch));

        if (channels.length !== originalCount) {
          console.warn(`[${new Date().toISOString()}] [${requestId}] ⚠️  Filtered out ${originalCount - channels.length} invalid channels`);
        }

        const totalElapsed = Date.now() - requestStart;
        console.log(`[${new Date().toISOString()}] [${requestId}] ✅ Success: ${channels.length} valid channels, total ${totalElapsed}ms`);

        return new Response(JSON.stringify({ channels }), {
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*", // Allow all origins
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS", // Specify allowed methods
            "Access-Control-Allow-Headers": "Content-Type", // Specify allowed headers
          },
        });
      } catch (error: any) {
        const totalElapsed = Date.now() - requestStart;
        console.error(`[${new Date().toISOString()}] [${requestId}] ❌ Error after ${totalElapsed}ms:`, error.message, error.stack);
        return new Response(JSON.stringify({ error: "Failed to read channels", details: error.message }), {
          status: 500,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
          },
        });
      }
    }
    if (url.pathname === "/api/scrapeStatus") {
      const status = {
        isFetching: isFetchingUsers,
        lastCycleStarted: lastCycleStarted,
        lastCycleCompleted: lastCycleCompleted,
        lastCycleDurationMs: lastCycleDurationMs,
        lastCycleChannelCount: lastCycleChannelCount,
        totalChannels: lastCycleTotalChannels,
        cycleCount: scrapesCycleCount,
        rateLimitsHit: rateLimitsHitLastCycle,
        intervalMs: 300000,
      };
      return new Response(JSON.stringify(status), {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    if (url.pathname === "/api/visits/topChannels") {
      const days = parseInt(url.searchParams.get("days") || "7");
      const limit = parseInt(url.searchParams.get("limit") || "10");
      const query = `
        SELECT c.name AS channel, COUNT(*) AS visit_count
        FROM visits v
        JOIN channels c ON v.channel_id = c.id
        WHERE v.timestamp >= datetime('now', '-${days} days')
        GROUP BY v.channel_id
        ORDER BY visit_count DESC
        LIMIT ?;
      `;
      const data = db.query(query).all(limit);
      return new Response(JSON.stringify(data), {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    if (url.pathname === "/api/stats/overview") {
      const totalUsers = db.query(`SELECT COUNT(*) as count FROM users`).get() as any;
      const onlineUsers = db.query(`SELECT COUNT(*) as count FROM users WHERE online = true`).get() as any;
      const totalChannels = db.query(`SELECT COUNT(*) as count FROM channels`).get() as any;
      const totalVisits = db.query(`SELECT COUNT(*) as count FROM visits`).get() as any;
      const visitsToday = db.query(`SELECT COUNT(*) as count FROM visits WHERE timestamp >= datetime('now', '-1 day')`).get() as any;
      const visitsThisWeek = db.query(`SELECT COUNT(*) as count FROM visits WHERE timestamp >= datetime('now', '-7 days')`).get() as any;

      return new Response(JSON.stringify({
        totalUsers: totalUsers?.count || 0,
        onlineUsers: onlineUsers?.count || 0,
        totalChannels: totalChannels?.count || 0,
        totalVisits: totalVisits?.count || 0,
        visitsToday: visitsToday?.count || 0,
        visitsThisWeek: visitsThisWeek?.count || 0,
      }), {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    // ─── Auth endpoints ──────────────────────────────────────────────────────
    if (url.pathname === "/api/auth/signup") {
      if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders() });
      }
      if (req.method === "POST") {
        try {
          const body = (await req.json()) as any;
          const { invite_token, email, password, display_name } = body;

          if (!invite_token || !email || !password) {
            return new Response(JSON.stringify({ error: "Missing required fields" }), { status: 400, headers: corsHeaders() });
          }

          if (password.length < 6) {
            return new Response(JSON.stringify({ error: "Password must be at least 6 characters" }), { status: 400, headers: corsHeaders() });
          }

          // Validate invite token
          const invite = db.query(`SELECT * FROM invites WHERE token = ? AND used = 0 AND expires_at > datetime('now')`).get(invite_token) as any;
          if (!invite) {
            return new Response(JSON.stringify({ error: "Invalid or expired invite link" }), { status: 400, headers: corsHeaders() });
          }

          // If invite has a specific email, enforce it
          if (invite.email && invite.email.toLowerCase() !== email.toLowerCase()) {
            return new Response(JSON.stringify({ error: "This invite is for a different email address" }), { status: 400, headers: corsHeaders() });
          }

          // Check if account already exists
          const existing = db.query(`SELECT id FROM accounts WHERE email = ?`).get(email.toLowerCase()) as any;
          if (existing) {
            return new Response(JSON.stringify({ error: "An account with this email already exists" }), { status: 409, headers: corsHeaders() });
          }

          // Create account
          const hash = await hashPassword(password);
          db.run(`INSERT INTO accounts (email, password_hash, display_name, role) VALUES (?, ?, ?, ?)`,
            [email.toLowerCase(), hash, display_name || email.split('@')[0], invite.role || 'viewer']);

          // Mark invite as used
          db.run(`UPDATE invites SET used = 1 WHERE id = ?`, [invite.id]);

          // Create session
          const account = db.query(`SELECT id, email, display_name, role FROM accounts WHERE email = ?`).get(email.toLowerCase()) as any;
          const sessionToken = generateToken();
          const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days
          db.run(`INSERT INTO sessions (account_id, token, expires_at) VALUES (?, ?, ?)`, [account.id, sessionToken, expiresAt]);

          console.log(`[${new Date().toISOString()}] [${requestId}] ✅ New account created: ${email}`);

          return new Response(JSON.stringify({
            token: sessionToken,
            account: { id: account.id, email: account.email, display_name: account.display_name, role: account.role },
          }), { headers: corsHeaders() });
        } catch (error: any) {
          console.error(`[${new Date().toISOString()}] [${requestId}] ❌ Signup error:`, error.message);
          return new Response(JSON.stringify({ error: "Signup failed" }), { status: 500, headers: corsHeaders() });
        }
      }
    }

    if (url.pathname === "/api/auth/login") {
      if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders() });
      }
      if (req.method === "POST") {
        try {
          const body = (await req.json()) as any;
          const { email, password } = body;

          if (!email || !password) {
            return new Response(JSON.stringify({ error: "Email and password are required" }), { status: 400, headers: corsHeaders() });
          }

          const account = db.query(`SELECT * FROM accounts WHERE email = ?`).get(email.toLowerCase()) as any;
          if (!account) {
            return new Response(JSON.stringify({ error: "Invalid email or password" }), { status: 401, headers: corsHeaders() });
          }

          const valid = await verifyPassword(password, account.password_hash);
          if (!valid) {
            return new Response(JSON.stringify({ error: "Invalid email or password" }), { status: 401, headers: corsHeaders() });
          }

          // Create session
          const sessionToken = generateToken();
          const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days
          db.run(`INSERT INTO sessions (account_id, token, expires_at) VALUES (?, ?, ?)`, [account.id, sessionToken, expiresAt]);

          // Clean up expired sessions for this account
          db.run(`DELETE FROM sessions WHERE account_id = ? AND expires_at <= datetime('now')`, [account.id]);

          console.log(`[${new Date().toISOString()}] [${requestId}] ✅ Login: ${email}`);

          return new Response(JSON.stringify({
            token: sessionToken,
            account: { id: account.id, email: account.email, display_name: account.display_name, role: account.role },
          }), { headers: corsHeaders() });
        } catch (error: any) {
          console.error(`[${new Date().toISOString()}] [${requestId}] ❌ Login error:`, error.message);
          return new Response(JSON.stringify({ error: "Login failed" }), { status: 500, headers: corsHeaders() });
        }
      }
    }

    if (url.pathname === "/api/auth/logout") {
      if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders() });
      }
      if (req.method === "POST") {
        const authHeader = req.headers.get("Authorization");
        const token = authHeader?.replace("Bearer ", "");
        if (token) {
          db.run(`DELETE FROM sessions WHERE token = ?`, [token]);
        }
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders() });
      }
    }

    if (url.pathname === "/api/auth/me") {
      if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders() });
      }
      const authHeader = req.headers.get("Authorization");
      const token = authHeader?.replace("Bearer ", "");
      const account = getAccountFromSession(token || null);
      if (!account) {
        return new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401, headers: corsHeaders() });
      }
      return new Response(JSON.stringify({ account }), { headers: corsHeaders() });
    }

    if (url.pathname === "/api/auth/invite/validate") {
      const token = url.searchParams.get("token");
      if (!token) {
        return new Response(JSON.stringify({ valid: false, error: "Missing token" }), { status: 400, headers: corsHeaders() });
      }
      const invite = db.query(`SELECT token, email, role, expires_at FROM invites WHERE token = ? AND used = 0 AND expires_at > datetime('now')`).get(token) as any;
      if (!invite) {
        return new Response(JSON.stringify({ valid: false, error: "Invalid or expired invite" }), { headers: corsHeaders() });
      }
      return new Response(JSON.stringify({ valid: true, email: invite.email, role: invite.role }), { headers: corsHeaders() });
    }

    // ─── Admin endpoints (require PIN) ───────────────────────────────────────
    if (url.pathname === "/api/admin/invites") {
      if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders() });
      }
      if (req.method === "POST") {
        try {
          const body = (await req.json()) as any;
          const { pin, email, role } = body;

          if (pin != 4756) {
            return new Response(JSON.stringify({ error: "Incorrect Auth Pin" }), { status: 401, headers: corsHeaders() });
          }

          const inviteToken = generateToken();
          const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days
          db.run(`INSERT INTO invites (token, email, role, expires_at) VALUES (?, ?, ?, ?)`,
            [inviteToken, email?.toLowerCase() || null, role || 'viewer', expiresAt]);

          console.log(`[${new Date().toISOString()}] [${requestId}] ✅ Invite created for: ${email || '(any email)'}`);

          return new Response(JSON.stringify({
            invite_token: inviteToken,
            email: email || null,
            role: role || 'viewer',
            expires_at: expiresAt,
          }), { headers: corsHeaders() });
        } catch (error: any) {
          console.error(`[${new Date().toISOString()}] [${requestId}] ❌ Invite creation error:`, error.message);
          return new Response(JSON.stringify({ error: "Failed to create invite" }), { status: 500, headers: corsHeaders() });
        }
      }
      if (req.method === "GET") {
        const pinParam = url.searchParams.get("pin");
        if (pinParam != "4756") {
          return new Response(JSON.stringify({ error: "Incorrect Auth Pin" }), { status: 401, headers: corsHeaders() });
        }
        const invites = db.query(`SELECT id, token, email, role, used, created_at, expires_at FROM invites ORDER BY created_at DESC`).all();
        return new Response(JSON.stringify({ invites }), { headers: corsHeaders() });
      }
    }

    if (url.pathname === "/api/admin/accounts") {
      if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders() });
      }
      const pinParam = url.searchParams.get("pin") || (req.method === "POST" ? ((await req.json()) as any).pin : null);
      if (pinParam != 4756 && pinParam != "4756") {
        return new Response(JSON.stringify({ error: "Incorrect Auth Pin" }), { status: 401, headers: corsHeaders() });
      }
      const accounts = db.query(`SELECT id, email, display_name, role, created_at FROM accounts ORDER BY created_at DESC`).all();
      return new Response(JSON.stringify({ accounts }), { headers: corsHeaders() });
    }

    const totalElapsed = Date.now() - requestStart;
    console.log(`[${new Date().toISOString()}] [${requestId}] ⬅️  404 Not Found (${totalElapsed}ms)`);
    return new Response("Not Found", { status: 404 });
  },
});

// Scrape status tracking
let lastCycleStarted: string | null = null;
let lastCycleCompleted: string | null = null;
let lastCycleDurationMs: number = 0;
let lastCycleChannelCount: number = 0;
let lastCycleTotalChannels: number = 0;
let scrapesCycleCount: number = 0;
let rateLimitsHitLastCycle: number = 0;

// Prevent overlapping executions
let isFetchingUsers = false;

// Helper to sleep between batches (reduces CPU pressure)
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

setInterval(async () => {
  if (isFetchingUsers) {
    console.warn(`[${new Date().toISOString()}] ⚠️  Skipping periodic fetch - previous fetch still in progress`);
    return;
  }

  isFetchingUsers = true;
  try {
    console.log(`[${new Date().toISOString()}] 🔄 Starting periodic user fetch...`);
    const startTime = Date.now();
    lastCycleStarted = new Date().toISOString();
    rateLimitsHitLastCycle = 0;

    // get channel from channels.json - use async Bun.file() for non-blocking I/O
    const channelsFile = Bun.file("channels.json");
    let channels = JSON.parse(
      await channelsFile.text()
    ) as string[];

    const originalCount = channels.length;

    // Filter out invalid channel names (empty, null, or whitespace-only)
    channels = channels.filter((ch: any) => isValidChannelName(ch));

    if (channels.length !== originalCount) {
      console.warn(`[${new Date().toISOString()}] ⚠️  Filtered out ${originalCount - channels.length} invalid channels from periodic fetch`);
    }

    lastCycleTotalChannels = channels.length;
    console.log(`[${new Date().toISOString()}] 📋 Processing ${channels.length} channels...`);

    // Process channels in batches — rate-limit-safe concurrency
    const batchSize = 5;   // 5 concurrent requests (~5 req/s sustained)
    const batchDelayMs = 1000;  // 1 second delay between batches
    const rateLimitBackoffMs = 5000; // Extra pause if we get a 429

    // Wrap all DB writes in a single transaction for the entire cycle
    db.run("BEGIN");

    let channelsProcessed = 0;
    for (let i = 0; i < channels.length; i += batchSize) {
      const batch = channels.slice(i, i + batchSize);
      const batchNum = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(channels.length / batchSize);

      // Only log every 10th batch to reduce console spam
      if (batchNum % 10 === 1 || batchNum === totalBatches) {
        console.log(`[${new Date().toISOString()}] Processing batch ${batchNum}/${totalBatches}`);
      }

      const results = await Promise.all(batch.map(channel => fetchAndLogUsers(channel)));
      channelsProcessed += batch.length;

      // Adaptive backoff: if any request in this batch was rate-limited, pause longer
      const rateLimitedCount = results.filter(r => r.rateLimited).length;
      if (rateLimitedCount > 0) {
        rateLimitsHitLastCycle += rateLimitedCount;
        console.warn(`[${new Date().toISOString()}] ⏳ Rate limit detected — backing off ${rateLimitBackoffMs}ms`);
        await sleep(rateLimitBackoffMs);
      }

      // Add delay between batches to stay under rate limits
      if (i + batchSize < channels.length) {
        await sleep(batchDelayMs);
      }
    }

    db.run("COMMIT");

    updateOnlineStatus(activeUserIds);
    activeUserIds.clear();  // Use Set.clear() for proper cleanup

    // Clear in-memory caches at the end of each cycle to bound memory
    channelIdCache.clear();
    userIdCache.clear();

    const elapsed = Date.now() - startTime;
    lastCycleCompleted = new Date().toISOString();
    lastCycleDurationMs = elapsed;
    lastCycleChannelCount = channelsProcessed;
    scrapesCycleCount++;
    console.log(`[${new Date().toISOString()}] ✅ Completed periodic user fetch in ${elapsed}ms`);
  } catch (error: any) {
    // Rollback if the transaction is still open
    try { db.run("ROLLBACK"); } catch (_) {}
    console.error(`[${new Date().toISOString()}] ❌ Error in periodic user fetch:`, error.message, error.stack);
  } finally {
    isFetchingUsers = false;
  }
}, 300000);  // 5 minutes - gives more breathing room between cycles

console.log(`[${new Date().toISOString()}] 🚀 Server starting...`);
console.log(`Listening on http://localhost:3008 ...`);
