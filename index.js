//require('dotenv').config();
const sqlite3 = require("sqlite3").verbose();
const axios = require("axios");
const cheerio = require("cheerio");

const WEBHOOK_URL = process.env.WEBHOOK_URL;
const DB_FILE = "sales.db";

const POLLING_INTERVAL = process.env.POLLING_INTERVAL * 1000 * 60 * 60;

const queue = [];
let isProcessing = false;

const db = new sqlite3.Database(DB_FILE, (err) => {
  if (err) {
    console.error("Error opening database: ", err.message);
  } else {
    console.log("Connected to the database");
  }
});

function initializeDatabase() {
  const createGamesTableQuery = `
        CREATE TABLE IF NOT EXISTS games (
            gameID TEXT PRIMARY KEY,
            gameName TEXT NOT NULL,
            gameImageUrl TEXT NOT NULL
        );
    `;

  const createSalesTableQuery = `
        CREATE TABLE IF NOT EXISTS sales (
            saleID INTEGER PRIMARY KEY AUTOINCREMENT,
            gameID TEXT NOT NULL,
            discountAmount TEXT,
            oldPrice TEXT,
            salePrice TEXT,
            saleTimestamp TEXT,
            FOREIGN KEY (gameID) REFERENCES games(gameID)
        );
    `;

  db.run(createGamesTableQuery, (err) => {
    if (err) {
      console.error("Error creating games table: ", err.message);
    }
  });

  db.run(createSalesTableQuery, (err) => {
    if (err) {
      console.error("Error creating sales table: ", err.message);
    }
  });
}

function ifGameExists(gameID, callback) {
  const query = "SELECT * FROM games WHERE gameID = ?";
  db.get(query, [gameID], (err, row) => {
    if (err) {
      console.error("Error checking if games exists: ", err.message);
    } else {
      callback(row);
    }
  });
}

function insertGame(gameID, gameName, gameImageUrl) {
  const query =
    "INSERT OR REPLACE INTO games (gameID, gameName, gameImageUrl) VALUES (?, ?, ?)";
  db.run(query, [gameID, gameName, gameImageUrl], (err) => {
    if (err) {
      console.error("Error inserting game: ", err.message);
    } else {
      console.log(`Game "${gameName}" inserted or updated in the database.`);
    }
  });
}

function isSaleExists(gameID, saleTimestamp, callback) {
  const query = "SELECT * FROM sales WHERE gameID = ? AND saleTimestamp = ?";
  db.get(query, [gameID, saleTimestamp], (err, row) => {
    if (err) {
      console.error("Error checking if sale exists: ", err.message);
    } else {
      callback(row);
    }
  });
}

function insertSale(
  gameID,
  discountAmount,
  oldPrice,
  salePrice,
  saleTimestamp
) {
  const query =
    "INSERT INTO sales (gameID, discountAmount, oldPrice, salePrice, saleTimestamp) VALUES (?, ?, ?, ?, ?)";
  db.run(
    query,
    [gameID, discountAmount, oldPrice, salePrice, saleTimestamp],
    (err) => {
      if (err) {
        console.error("Error inserting sale: ", err.message);
      } else {
        console.log(`Sale inserted for gameID: ${gameID}`);
      }
    }
  );
}

async function getExpiryDate(gameID) {
  try {
    const cookies = "birthtime=1100000000";
    let response = await axios.get(
      `https://store.steampowered.com/app/${gameID}`,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3",
          "Accept-Language": "en-GB,en;q=0.9",
          Cookie: cookies,
        },
        withCredentials: true,
      }
    );
    let $ = cheerio.load(response.data);

    try {
      let promotionText = $("#game_area_purchase")
        .find(".game_purchase_discount_countdown")
        .first()
        .text();
      let expiryText = promotionText.split("Offer ends ")[1];

      let [day, month] = expiryText.split(" ");
      let currentYear = new Date().getFullYear();

      let expiryDate = new Date(`${day} ${month} ${currentYear}`);
      if (expiryDate < new Date()) {
        expiryDate.setFullYear(currentYear + 1);
      }

      const options = { year: "numeric", month: "short", day: "numeric" };
      return expiryDate.toLocaleDateString("en-GB", options);
    } catch {
      return "Unknown";
    }
  } catch (err) {
    console.error(`Error getting expiry date of "${gameID}": `, err.message);
  }
}

function addToQueue(message) {
  queue.push(message);
  processQueue();
}

async function processQueue() {
  if (isProcessing) return;

  isProcessing = true;

  while (queue.length > 0) {
    const message = queue.shift();

    try {
      await axios
        .post(WEBHOOK_URL, message)
        .then(() => {
          console.log(`Message sent to Discord: ${message.content}`);
        })
        .catch((err) =>
          console.error("Error sending message to Discord: ", err.message)
        );
    } catch (error) {
      if (error.response && error.response.status === 429) {
        console.log("Rate limit hit! Waiting...");
        const retryAfter =
          parseInt(error.response.headers["retry-after"], 10) || 1000;
        console.log(`Waiting for ${retryAfter}ms before retrying...`);
        await new Promise((resolve) => setTimeout(resolve, retryAfter));
        continue;
      } else {
        console.error("Error sending message:", error.message);
        break;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  isProcessing = false;
}

async function checkSteamSales(done = [], start = 0, max = 100) {
  try {
    let response = await axios.get(
      `https://store.steampowered.com/search/results/?query&start=${start}&count=${max}&category1=998%2C21%2C994&supportedlang=english&specials=1&hidef2p=1&infinite=1`
    );
    let $ = cheerio.load(response.data.results_html);

    let games = [];

    $(".search_result_row").each(async (index, element) => {
      let game = {};
      let isApp = $(element).data("ds-itemkey").split("_")[0] == "App";

      if (isApp) {
        game.gameID = $(element).data("ds-appid");
        game.gameName = $(element).find(".title").text().trim();
        game.gameImageUrl = `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${game.gameID}/capsule_616x353.jpg`;
        game.discountAmount = $(element)
          .find(".discount_block.search_discount_block")
          .data("discount");
        game.oldPrice = $(element)
          .find(".discount_original_price")
          .text()
          .trim();
        game.salePrice = $(element).find(".discount_final_price").text().trim();
        game.saleTimestamp = await getExpiryDate(game.gameID);
        games.push(game);

        ifGameExists(game.gameID, (existingGame) => {
          if (
            !existingGame ||
            existingGame.gameImageUrl !== game.gameImageUrl
          ) {
            insertGame(game.gameID, game.gameName, game.gameImageUrl);
          }
        });

        isSaleExists(game.gameID, game.saleTimestamp, (existingSale) => {
          if (!existingSale) {
            insertSale(
              game.gameID,
              game.discountAmount,
              game.oldPrice,
              game.salePrice,
              game.saleTimestamp
            );

            let gameLink = $(element).attr("href");
            let message;

            if (game.discountAmount >= 75) {
              message = {
                content: `🎮 **${game.gameName}** is now available for just **${game.salePrice}**—that's an unbelievable **${game.discountAmount}% off**! [Grab it here](${gameLink})`,
              };
            } else if (game.discountAmount >= 50) {
              message = {
                content: `🎮 **${game.gameName}** is on sale for **${game.salePrice}**! That's a huge **${game.discountAmount}% off** the original price! [Don't miss out here](${gameLink})`,
              };
            } else if (game.discountAmount >= 30) {
              message = {
                content: `🎮 **${game.gameName}** is now only **${game.salePrice}**—that's **${game.discountAmount}% off** the regular price! [Check it out here](${gameLink})`,
              };
            } else if (game.discountAmount >= 20) {
              message = {
                content: `🎮 **${game.gameName}** is discounted to **${game.salePrice}**—that's **${game.discountAmount}% off**! [Take a look here](${gameLink})`,
              };
            } else {
              message = {
                content: `🎮 **${game.gameName}** is now only **${game.salePrice}**—just **${game.discountAmount}% off**. [Check it out here](${gameLink})`,
              };
            }

            addToQueue(message);
          }
        });
      }
    });
  } catch (err) {
    console.error("Error checking steam sales: ", err.message);
  }
}

async function startPolling() {
  initializeDatabase();
  console.log("Starting periodic poll for new steam sales...");
  await checkSteamSales();

  setInterval(async () => {
    await checkSteamSales();
  }, POLLING_INTERVAL);
}

startPolling();