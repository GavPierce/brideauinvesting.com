import { Database } from "bun:sqlite";
import fs from "fs";

// Initialize in-memory SQLite database (you can replace ":memory:" with a file path for persistent storage)
const db = new Database("database.db");

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

// Function to insert or get a channel ID
function getOrCreateChannelId(channelName: string): number {
  db.run(`INSERT OR IGNORE INTO channels (name) VALUES (?)`, [channelName]);

  const channel = db
    .query<any, any>(`SELECT id FROM channels WHERE name = ?`)
    .get(channelName);
  return channel?.id ?? -1;
}

// Function to insert or get a user ID
function getOrCreateUserId(public_id: string, name: string): number {
  db.run(
    `INSERT OR IGNORE INTO users (public_id, name, online) VALUES (?, ?, false)`,
    [public_id, name]
  );

  const user = db
    .query<any, any>(`SELECT id FROM users WHERE public_id = ?`)
    .get(public_id);
  return user?.id ?? -1;
}

// Function to log a visit and mark user as online
function logVisit(
  user_id: number,
  channel_id: number,
  timestamp: string
): void {
  // Get the last visit for this user in this channel
  const lastVisit: visit = db
    .query(
      `
    SELECT timestamp 
    FROM visits 
    WHERE user_id = ? AND channel_id = ? 
    ORDER BY timestamp DESC 
    LIMIT 1
  `
    )
    .get(user_id, channel_id) as visit;

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
    db.run(
      `INSERT INTO visits (user_id, channel_id, timestamp) VALUES (?, ?, ?)`,
      [user_id, channel_id, timestamp]
    );
  } else {
  }

  // Mark the user as online
  db.run(`UPDATE users SET online = true WHERE id = ?`, [user_id]);
}

// Function to mark users as offline if they were previously online but are not in the current list of users
function updateOnlineStatus(activeUserIds: Set<number> | number[]): void {
  const userIdArray = Array.isArray(activeUserIds) ? activeUserIds : Array.from(activeUserIds);
  if (userIdArray.length > 0) {
    // Set users with IDs in `activeUserIds` as online
    db.run(
      `
      UPDATE users 
      SET online = true
      WHERE id IN (${userIdArray.map(() => "?").join(",")})
      AND online = false
      `,
      userIdArray
    );

    // Set users as offline who are not in `activeUserIds` but are currently online
    db.run(
      `
      UPDATE users 
      SET online = false 
      WHERE id NOT IN (${userIdArray.map(() => "?").join(",")})
      AND online = true
      `,
      userIdArray
    );
  } else {
    // If no active users, set all online users as offline
    db.run(`
      UPDATE users 
      SET online = false 
      WHERE online = true
    `);
  }
}

// Helper function to validate channel names
function isValidChannelName(channel: any): boolean {
  return channel != null && typeof channel === 'string' && channel.trim() !== '';
}

// Simulate fetching online users from the API (this should be called periodically)
// Use a Set for O(1) lookups and automatic deduplication
let activeUserIds: Set<number> = new Set();
const MAX_ACTIVE_USERS = 10000; // Prevent unbounded memory growth

async function fetchAndLogUsers(channelName: string) {
  const startTime = Date.now();

  // Validate channel name before processing
  if (!isValidChannelName(channelName)) {
    console.error(`[${new Date().toISOString()}] ❌ Invalid channel name: "${channelName}" - skipping`);
    return;
  }

  try {
    console.log(`[${new Date().toISOString()}] 🔍 Fetching users for channel: ${channelName}`);

    // Add timeout to prevent hanging
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

    const response = await fetch(
      `https://api.ceo.ca/api/channels/online_users?channel=${channelName}`,
      { signal: controller.signal }
    );

    clearTimeout(timeoutId);

    const elapsed = Date.now() - startTime;
    console.log(`[${new Date().toISOString()}] ⏱️  Fetch completed for ${channelName} in ${elapsed}ms, status: ${response.status}`);

    if (!response.ok) {
      console.error(`[${new Date().toISOString()}] ❌ Failed to fetch online users for ${channelName}: ${response.status} ${response.statusText}`);
      return;
    }

    const data = (await response.json()) as any;
    const timestamp = new Date().toISOString();

    // Log visits for all active users

    if (!data?.users) {
      console.log(`[${new Date().toISOString()}] No users data for channel: ${channelName}`);
      return;
    }

    console.log(`[${new Date().toISOString()}] Found ${data.users.length} users for channel: ${channelName}`);
    data?.users.forEach((user: any) => {
      const user_id = getOrCreateUserId(user.public_id, user.name || "Unknown");
      const channel_id = getOrCreateChannelId(channelName);
      logVisit(user_id, channel_id, timestamp);
      // Add to Set with size limit to prevent memory leaks
      if (activeUserIds.size < MAX_ACTIVE_USERS) {
        activeUserIds.add(user_id);
      }
    });
  } catch (error: any) {
    const elapsed = Date.now() - startTime;
    if (error.name === 'AbortError') {
      console.error(`[${new Date().toISOString()}] ⏰ Timeout fetching users for ${channelName} after ${elapsed}ms`);
    } else {
      console.error(`[${new Date().toISOString()}] ❌ Error fetching users for ${channelName} after ${elapsed}ms:`, error.message, '\nStack:', error.stack);
    }
  }
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
    const totalElapsed = Date.now() - requestStart;
    console.log(`[${new Date().toISOString()}] [${requestId}] ⬅️  404 Not Found (${totalElapsed}ms)`);
    return new Response("Not Found", { status: 404 });
  },
});

// Prevent overlapping executions
let isFetchingUsers = false;

setInterval(async () => {
  if (isFetchingUsers) {
    console.warn(`[${new Date().toISOString()}] ⚠️  Skipping periodic fetch - previous fetch still in progress`);
    return;
  }

  isFetchingUsers = true;
  try {
    console.log(`[${new Date().toISOString()}] 🔄 Starting periodic user fetch...`);
    const startTime = Date.now();

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

    console.log(`[${new Date().toISOString()}] 📋 Found ${channels.length} valid channels to process`);

    // Process channels in parallel with a maximum of 5 concurrent requests
    const batchSize = 5;
    for (let i = 0; i < channels.length; i += batchSize) {
      const batch = channels.slice(i, i + batchSize);
      console.log(`[${new Date().toISOString()}] Processing batch ${Math.floor(i / batchSize) + 1} (${batch.length} channels)`);
      await Promise.all(batch.map(channel => fetchAndLogUsers(channel)));
    }

    updateOnlineStatus(activeUserIds);
    activeUserIds.clear();  // Use Set.clear() for proper cleanup

    const elapsed = Date.now() - startTime;
    console.log(`[${new Date().toISOString()}] ✅ Completed periodic user fetch in ${elapsed}ms`);
  } catch (error: any) {
    console.error(`[${new Date().toISOString()}] ❌ Error in periodic user fetch:`, error.message, error.stack);
  } finally {
    isFetchingUsers = false;
  }
}, 120000);  // 2 minutes (was 20 seconds) - reduces CPU by 6x

console.log(`[${new Date().toISOString()}] 🚀 Server starting...`);
console.log(`Listening on http://localhost:3008 ...`);
