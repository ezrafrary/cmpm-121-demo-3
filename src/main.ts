// @deno-types="npm:@types/leaflet@^1.9.14"
import leaflet from "leaflet";

// deno-lint-ignore-file no-unused-vars prefer-const

// Style sheets
import "leaflet/dist/leaflet.css";
import "./style.css";

// Fix missing marker images
import "./leafletWorkaround.ts";

// Deterministic random number generator
import luck from "./luck.ts";

// Location of our classroom (as identified on Google Maps)
let PLAYER_POS = leaflet.latLng(36.98949379578401, -122.06287128548504);
const NULL_ISLAND_STARTING_POS = leaflet.latLng(0, 0);

// Tunable gameplay parameters
const GAMEPLAY_ZOOM_LEVEL = 19;
const TILE_DEGREES = 0.0001; // Each tile is 0.0001° in size
const NEIGHBORHOOD_SIZE = 9; // Neighborhood size (radius of visibility)
const CACHE_SPAWN_PROBABILITY = 0.1; // Probability of spawning a cache in a tile

// Create the map
const map = leaflet.map(document.getElementById("map")!, {
  center: PLAYER_POS,
  zoom: GAMEPLAY_ZOOM_LEVEL,
  minZoom: GAMEPLAY_ZOOM_LEVEL,
  maxZoom: GAMEPLAY_ZOOM_LEVEL,
  zoomControl: false,
  scrollWheelZoom: false,
});

// Populate the map with a background tile layer
const backgroundStuff = leaflet
  .tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    {
      maxZoom: GAMEPLAY_ZOOM_LEVEL,
      attribution:
        '&copy; <a href="Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community">OpenStreetMap</a>',
    }
  )
  .addTo(map);

// Add a marker to represent the player
const playerMarker = leaflet.marker(PLAYER_POS);
playerMarker.bindTooltip("Player");
playerMarker.addTo(map);

// Display the player's points and inventory
let playerPoints = 0;
const pointText = document.querySelector<HTMLDivElement>("#pointText")!;
pointText.innerHTML = "Point total: 0";

// Interfaces
interface Cord {
  x: number;
  y: number;
}

interface SerialNumber {
  SN: number;
}

interface GeoCoin {
  coinLocation: Cord;
  SN: SerialNumber;
}

// Global variables for caches and coins
let CurrentSN = 0;
let playerInventory: GeoCoin[] = [];
const spawnedTiles = new Set<string>(); // Tracks which tiles are explored
const activeRectangles: Map<string, leaflet.Rectangle> = new Map(); // Tracks currently visible tiles

// Persistent tile data with pointValue and coinArray
const tileData: Map<string, { pointValue: number; coinArray: GeoCoin[] }> = new Map();

// Generate coins procedurally
function generateCoin(inputCords: Cord): GeoCoin {
  const newSN: SerialNumber = { SN: CurrentSN };
  const returnCoin: GeoCoin = { coinLocation: inputCords, SN: newSN };
  CurrentSN++;
  return returnCoin;
}

function printCoinShort(inputCoin: GeoCoin) {
  const returnString = `${inputCoin.coinLocation.x}:${inputCoin.coinLocation.y}#${inputCoin.SN.SN} `;
  return returnString;
}

function printCoinArrayShort(inputCoinArray: GeoCoin[]) {
  let returnStatement = ``;
  for (let i = 0; i < inputCoinArray.length; i++) {
    returnStatement += printCoinShort(inputCoinArray[i]);
  }
  return returnStatement;
}

// Convert LatLng to game grid coordinates
function convertLeafletToCord(input: leaflet.LatLng): Cord {
  return { x: Math.floor(input.lat * 10000), y: Math.floor(input.lng * 10000) };
}

// Transfer coins between arrays
function transferCoin(sourceArray: GeoCoin[], targetArray: GeoCoin[]): GeoCoin | undefined {
  const coin = sourceArray.pop();
  if (coin !== undefined) {
    targetArray.push(coin);
  }
  return coin;
}

// Procedural cache spawning
function spawnCache(inputCord: Cord) {
  const tileKey = `${inputCord.x},${inputCord.y}`;
  if (spawnedTiles.has(tileKey)) {
    // If already explored but not active, restore the tile
    if (!activeRectangles.has(tileKey)) {
      restoreTile(tileKey, inputCord);
    }
    return;
  }

  // Procedural generation logic
  if (luck([inputCord.x, inputCord.y].toString()) < CACHE_SPAWN_PROBABILITY) {
    spawnedTiles.add(tileKey); // Mark tile as explored

    const origin = NULL_ISLAND_STARTING_POS;
    const bounds = leaflet.latLngBounds([
      [
        origin.lat + inputCord.x * TILE_DEGREES,
        origin.lng + inputCord.y * TILE_DEGREES,
      ],
      [
        origin.lat + (inputCord.x + 1) * TILE_DEGREES,
        origin.lng + (inputCord.y + 1) * TILE_DEGREES,
      ],
    ]);

    const rect = leaflet.rectangle(bounds).addTo(map);
    activeRectangles.set(tileKey, rect);

    let pointValue = Math.floor(
      luck([inputCord.x, inputCord.y, "initialValue"].toString()) * 100
    );
    const coinArray: GeoCoin[] = [];
    for (let i = 0; i < pointValue; i++) {
      const newCoin = generateCoin(inputCord);
      coinArray.push(newCoin);
    }

    // Store the state in tileData
    tileData.set(tileKey, { pointValue, coinArray });

    // Bind popup to the rectangle
    rect.bindPopup(() => createPopup(inputCord, coinArray, pointValue, tileKey));
  }
}

// Restore already explored tiles when the player returns to them
function restoreTile(tileKey: string, inputCord: Cord) {
  const origin = NULL_ISLAND_STARTING_POS;
  const bounds = leaflet.latLngBounds([
    [
      origin.lat + inputCord.x * TILE_DEGREES,
      origin.lng + inputCord.y * TILE_DEGREES,
    ],
    [
      origin.lat + (inputCord.x + 1) * TILE_DEGREES,
      origin.lng + (inputCord.y + 1) * TILE_DEGREES,
    ],
  ]);

  const rect = leaflet.rectangle(bounds).addTo(map);
  activeRectangles.set(tileKey, rect);

  // Reload state from tileData
  const tileState = tileData.get(tileKey)!;
  const { pointValue, coinArray } = tileState;

  // Bind popup with restored state
  rect.bindPopup(() => createPopup(inputCord, coinArray, pointValue, tileKey));
}

// Create popup content for a cache
function createPopup(
  inputCord: Cord,
  coinArray: GeoCoin[],
  initialPointValue: number,
  tileKey: string
) {
  let pointValue = initialPointValue;
  const popupDiv = document.createElement("div");
  popupDiv.style.background = "white";
  popupDiv.innerHTML = `
    <div>Cache at ${inputCord.x},${inputCord.y} with <span id="value">${pointValue}</span>.</div>
    <button id="collect" style="background-color: white;">collect</button>
    <button id="deposit" style="background-color: white;">deposit</button>
    <div id="coins">${coinArray
      .map((coin) => `${coin.coinLocation.x}:${coin.coinLocation.y}#${coin.SN.SN}`)
      .join(" ")}</div>
  `;

  // Collect button logic
  popupDiv.querySelector<HTMLButtonElement>("#collect")!.addEventListener(
    "click",
    (event) => {
      event.stopPropagation(); // Prevent popup from closing

      if (pointValue > 0) {
        const transferredCoin = transferCoin(coinArray, playerInventory); // Transfer a coin
        if (transferredCoin) {
          pointValue--; // Decrease the cache's point value
          playerPoints++;
          pointText.innerHTML = `Point total: ${playerPoints} | Coins: ${printCoinArrayShort(playerInventory)}`;
          popupDiv.querySelector<HTMLSpanElement>("#value")!.innerHTML = pointValue.toString();
          popupDiv.querySelector<HTMLDivElement>("#coins")!.innerHTML = coinArray
            .map((coin) => `${coin.coinLocation.x}:${coin.coinLocation.y}#${coin.SN.SN}`)
            .join(" ");

          // Save updated state to tileData
          tileData.set(tileKey, { pointValue, coinArray });
        }
      }
      saveGameState();
    }
  );

  // Deposit button logic
  popupDiv.querySelector<HTMLButtonElement>("#deposit")!.addEventListener(
    "click",
    (event) => {
      event.stopPropagation(); // Prevent popup from closing

      if (playerPoints > 0) {
        const transferredCoin = transferCoin(playerInventory, coinArray); // Transfer a coin back to the cache
        if (transferredCoin) {
          pointValue++; // Increase the cache's point value
          playerPoints--;
          pointText.innerHTML = `Point total: ${playerPoints} | Coins: ${printCoinArrayShort(playerInventory)}`;
          popupDiv.querySelector<HTMLSpanElement>("#value")!.innerHTML = pointValue.toString();
          popupDiv.querySelector<HTMLDivElement>("#coins")!.innerHTML = coinArray
            .map((coin) => `${coin.coinLocation.x}:${coin.coinLocation.y}#${coin.SN.SN}`)
            .join(" ");

          // Save updated state to tileData
          tileData.set(tileKey, { pointValue, coinArray });
        }
      }
      saveGameState();
    }
  );

  return popupDiv;
}

// Remove out-of-range tiles
function removeOutOfRangeCaches(playerCord: Cord) {
  for (const [key, rect] of activeRectangles.entries()) {
    const [x, y] = key.split(",").map(Number);
    if (
      Math.abs(x - playerCord.x) > NEIGHBORHOOD_SIZE ||
      Math.abs(y - playerCord.y) > NEIGHBORHOOD_SIZE
    ) {
      rect.remove(); // Remove from map
      activeRectangles.delete(key); // Remove from active tracking
    }
  }
}

// Spawn or restore tiles within neighborhood
function checkForCacheInteraction() {
  const playerCord = convertLeafletToCord(PLAYER_POS);
  for (let i = -NEIGHBORHOOD_SIZE + playerCord.x; i <= NEIGHBORHOOD_SIZE + playerCord.x; i++) {
    for (let j = -NEIGHBORHOOD_SIZE + playerCord.y; j <= NEIGHBORHOOD_SIZE + playerCord.y; j++) {
      spawnCache({ x: i, y: j });
    }
  }
  removeOutOfRangeCaches(playerCord); // Clean up non-visible tiles
} 

// Handle player movement and update polyline
const MOVEMENT_STEP = TILE_DEGREES;

function movePlayer(direction: "north" | "south" | "west" | "east") {
  let newLat = PLAYER_POS.lat;
  let newLng = PLAYER_POS.lng;

  if (direction === "north") newLat += MOVEMENT_STEP;
  if (direction === "south") newLat -= MOVEMENT_STEP;
  if (direction === "west") newLng -= MOVEMENT_STEP;
  if (direction === "east") newLng += MOVEMENT_STEP;

  PLAYER_POS.lat = newLat;
  PLAYER_POS.lng = newLng;

  playerMarker.setLatLng([newLat, newLng]); // Move the player marker
  checkForCacheInteraction(); // Trigger fog of war updates

  // Add the new position to the path
  playerPath.push(leaflet.latLng(newLat, newLng));

  // Update the polyline with the new path
  playerPathPolyline.setLatLngs(playerPath);

  saveGameState();
}


// Hook up movement buttons
document.getElementById("north")!.addEventListener("click", () => movePlayer("north"));
document.getElementById("south")!.addEventListener("click", () => movePlayer("south"));
document.getElementById("west")!.addEventListener("click", () => movePlayer("west"));
document.getElementById("east")!.addEventListener("click", () => movePlayer("east"));

// Initial set up
loadGameState();
checkForCacheInteraction();




//saving game
function saveGameState() {
  const gameState = {
    playerPosition: PLAYER_POS,
    playerPoints: playerPoints,
    playerInventory: playerInventory,
    spawnedTiles: Array.from(spawnedTiles),
    tileData: Array.from(tileData.entries())
  };
  localStorage.setItem("gameState", JSON.stringify(gameState));
}

function loadGameState() {
  const savedState = localStorage.getItem("gameState");
  if (savedState) {
    const gameState = JSON.parse(savedState);
    PLAYER_POS = gameState.playerPosition;
    playerPoints = gameState.playerPoints;
    playerInventory = gameState.playerInventory;
    spawnedTiles.clear();
    gameState.spawnedTiles.forEach((tile: string) => spawnedTiles.add(tile));

    tileData.clear();
    gameState.tileData.forEach(([key, value]: [string, any]) => {
      tileData.set(key, value);
    });

    pointText.innerHTML = `Point total: ${playerPoints} | Coins: ${printCoinArrayShort(playerInventory)}`;

    // Restore player position on the map
    playerMarker.setLatLng(PLAYER_POS);
  }
}




const playerPath: leaflet.LatLng[] = [];

// Create a polyline to visualize the path on the map
let playerPathPolyline = leaflet.polyline(playerPath, {
  color: 'blue', // Line color
  weight: 4, // Line thickness
  opacity: 0.6 // Line opacity
}).addTo(map);

//first position
playerPath.push(leaflet.latLng(PLAYER_POS.lat, PLAYER_POS.lng));





// Reset the game to its initial state
function resetGame() {
  // Reset player position to the original start position
  PLAYER_POS = leaflet.latLng(36.98949379578401, -122.06287128548504); // Starting position
  playerMarker.setLatLng(PLAYER_POS); // Update player marker on the map

  // Reset gameplay data
  playerPoints = 0;
  playerInventory = [];
  spawnedTiles.clear();
  activeRectangles.clear();
  tileData.clear();

  // Clear the map of any cache rectangles that might be present
  map.eachLayer((layer) => {
    // Remove all layers except for the tile layer and player marker
    if (layer !== playerMarker && layer !== backgroundStuff && layer !== playerPathPolyline) {
      map.removeLayer(layer);
    }
  });

  playerPath.length = 0;
  
  
  playerPath.push(leaflet.latLng(PLAYER_POS.lat, PLAYER_POS.lng));

  playerPathPolyline = leaflet.polyline(playerPath, {
    color: 'blue', // Line color
    weight: 4, // Line thickness
    opacity: 0.6 // Line opacity
  }).addTo(map);

  // Clear points display and inventory
  pointText.innerHTML = `Point total: ${playerPoints} | Coins: ${printCoinArrayShort(playerInventory)}`;

  // Recreate the map state as if it were fresh
  checkForCacheInteraction(); // Redraw the caches based on the starting conditions

  // Clear localStorage (reset saved game data)
  localStorage.removeItem("gameState");
}

// Attach the reset functionality to the reset button
document.getElementById("reset")!.addEventListener("click", resetGame);
