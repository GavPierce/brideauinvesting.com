import { Database } from "bun:sqlite";

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
function updateOnlineStatus(activeUserIds: number[]): void {
  if (activeUserIds.length > 0) {
    // Set users with IDs in `activeUserIds` as online
    db.run(
      `
      UPDATE users 
      SET online = true
      WHERE id IN (${activeUserIds.map(() => "?").join(",")})
      AND online = false
      `,
      activeUserIds
    );

    // Set users as offline who are not in `activeUserIds` but are currently online
    db.run(
      `
      UPDATE users 
      SET online = false 
      WHERE id NOT IN (${activeUserIds.map(() => "?").join(",")})
      AND online = true
      `,
      activeUserIds
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

// Simulate fetching online users from the API (this should be called periodically)
let activeUserIds: number[] = [];

async function fetchAndLogUsers(channelName: string) {
  const response = await fetch(
    `https://ceo.ca/api/channels/online_users?channel=${channelName}`
  );

  if (!response.ok) {
    console.error(`Failed to fetch online users: ${response.statusText}`);
    return;
  }
  const data = (await response.json()) as any;
  const timestamp = new Date().toISOString();

  // Log visits for all active users

  if (!data?.users) {
    return;
  }
  data?.users.forEach((user: any) => {
    const user_id = getOrCreateUserId(user.public_id, user.name || "Unknown");
    const channel_id = getOrCreateChannelId(channelName);
    logVisit(user_id, channel_id, timestamp);
    activeUserIds.push(user_id);
  });
}

// Serve an HTML page displaying user visit history and online status
const server = Bun.serve({
  port: 3008,
  fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === "/api/visits/chageDates") {
      // add 100 random visits, 50 for yesterday and 50 for tomorrow, randomly for all channels and users
      const randomChannels = [
        "bbb",
        "bg",
        "gr",
        "gug",
        "hmr",
        "gldr",
        "sbmi",
        "abi",
        "auu",
        "fkm",
        "gshr",
        "ipt",
        "pega",
        "sdcu",
        "sgz",
      ];

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
      console.log("Clearing Future Visits");
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

      if (!channel) {
        return new Response("Missing parameters", { status: 400 });
      }
      const query = `
        SELECT DATE(timestamp) as visit_date, COUNT(*) AS visit_count
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

    if (url.pathname === "/api/visitsByUser") {
      const user = url.searchParams.get("user");

      if (!user) {
        return new Response("Missing parameters", { status: 400 });
      }

      const query = `
      SELECT visits.*, channels.name as channel_name
      FROM visits
      JOIN channels ON visits.channel_id = channels.id
      WHERE visits.user_id = (SELECT id FROM users WHERE name = ?)
      ORDER BY visits.timestamp;
    `;
      return new Response(JSON.stringify(db.query(query).all(user)), {
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

      if (!channel) {
        return new Response("Missing parameters", { status: 400 });
      }

      // get all visits, and also the username and if they're online
      const query = `
        SELECT v.*, u.name, u.online
        FROM visits v
        JOIN users u ON v.user_id = u.id
        WHERE v.channel_id = (SELECT id FROM channels WHERE name = ?)
        ORDER BY v.timestamp DESC;
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

    return new Response("Not Found", { status: 404 });
  },
});

// Fetch data for 14 channels every 30 seconds
const channels = [
  "bbb",
  "bg",
  "gr",
  "gug",
  "hmr",
  "gldr",
  "sbmi",
  "abi",
  "auu",
  "fkm",
  "gshr",
  "ipt",
  "pega",
  "sdcu",
  "sgz",
];

setInterval(async () => {
  channels.forEach(async (channel) => await fetchAndLogUsers(channel));
  updateOnlineStatus(activeUserIds);
  activeUserIds = [];
}, 20000);

console.log(`Listening on http://localhost:3007 ...`);
