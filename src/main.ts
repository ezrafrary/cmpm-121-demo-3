// @deno-types="npm:@types/leaflet@^1.9.14"
import leaflet from "leaflet";

// Style sheets
import "leaflet/dist/leaflet.css";
import "./style.css";

// Fix missing marker images
import "./leafletWorkaround.ts";

// Deterministic random number generator
import luck from "./luck.ts";

// classroomLocation and 0,0
let PLAYER_POS = leaflet.latLng(36.98949379578401, -122.06287128548504);
const NULL_ISLAND_STARTING_POS = leaflet.latLng(0, 0);

// map stuff
const GAMEPLAY_ZOOM_LEVEL = 19;
const TILE_DEGREES = 0.0001; 
const NEIGHBORHOOD_SIZE = 9; 
const CACHE_SPAWN_PROBABILITY = 0.1; // 10%
const map = leaflet.map(document.getElementById("map")!, {
  center: PLAYER_POS,
  zoom: GAMEPLAY_ZOOM_LEVEL,
  minZoom: GAMEPLAY_ZOOM_LEVEL,
  maxZoom: GAMEPLAY_ZOOM_LEVEL,
  zoomControl: false,
  scrollWheelZoom: false,
});
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

// playerMarker
const playerMarker = leaflet.marker(PLAYER_POS);
playerMarker.bindTooltip("Player");
playerMarker.addTo(map);

// playerInventory
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
const spawnedTiles = new Set<string>(); // Tracks which tiles are explored, so when you leave a tile, it doesnt disappear forever
const activeRectangles: Map<string, leaflet.Rectangle> = new Map(); // Tracks currently visible tiles and shows them
const tileData: Map<string, { pointValue: number; coinArray: GeoCoin[] }> = new Map(); //Brace helped me with the concept of Map<string

function generateCoin(inputCords: Cord): GeoCoin {
  const newSN: SerialNumber = { SN: CurrentSN };
  const returnCoin: GeoCoin = { coinLocation: inputCords, SN: newSN };
  CurrentSN++;
  return returnCoin;
}

//prints a singular coin
function printCoinShort(inputCoin: GeoCoin) {
  const returnString = `${inputCoin.coinLocation.x}:${inputCoin.coinLocation.y}#${inputCoin.SN.SN} `;
  return returnString;
}

//prints an array of coins (ie the inventory)
function printCoinArrayShort(inputCoinArray: GeoCoin[]) {
  let returnStatement = ``;
  for (let i = 0; i < inputCoinArray.length; i++) {
    returnStatement += printCoinShort(inputCoinArray[i]);
  }
  return returnStatement;
}

// Convert LatLng to Cord
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
//brace helped me remove some code smells, specifically the duplicate code. 
//This createpopup function has helped a ton
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

  //return statement not really used, but it is nice to have
  return popupDiv;
}

// this creates the "fog of war" where the player cannot see further than what is around them
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


const MOVEMENT_STEP = TILE_DEGREES; //what direction the player is going. origionally didn't have this, but what if we want the buttons to move the player by more or less than a tile?
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
  checkForCacheInteraction(); 

  playerPath.push(leaflet.latLng(newLat, newLng));
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
const playerPath: leaflet.LatLng[] = [];
// Create a polyline to visualize the path on the map
let playerPathPolyline = leaflet.polyline(playerPath, {
  color: 'blue', // Line color
  weight: 4, // Line thickness
  opacity: 0.6 // Line opacity
}).addTo(map);

//first position
playerPath.push(leaflet.latLng(PLAYER_POS.lat, PLAYER_POS.lng));



//saving game, brace was a help in creating this specifically the "localStorage" keyword
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
    map.setView(PLAYER_POS, GAMEPLAY_ZOOM_LEVEL);
  }
}









function resetGame() {
  PLAYER_POS = leaflet.latLng(36.98949379578401, -122.06287128548504); // Starting position
  playerMarker.setLatLng(PLAYER_POS); 

  // Reset gameplay data
  playerPoints = 0;
  playerInventory = [];
  spawnedTiles.clear();
  activeRectangles.clear();
  tileData.clear();

  //this deletes all the rectangles from the screen
  map.eachLayer((layer) => {
    if (layer !== playerMarker && layer !== backgroundStuff && layer !== playerPathPolyline) {
      map.removeLayer(layer);
    }
  });

  playerPath.length = 0; //clears the path where the player has been.
  playerPath.push(leaflet.latLng(PLAYER_POS.lat, PLAYER_POS.lng));

  playerPathPolyline = leaflet.polyline(playerPath, {
    color: 'blue', 
    weight: 4, 
    opacity: 0.6 
  }).addTo(map);

  pointText.innerHTML = `Point total: ${playerPoints} | Coins: ${printCoinArrayShort(playerInventory)}`;

  checkForCacheInteraction(); 

  
  localStorage.removeItem("gameState");
  map.setView(PLAYER_POS, GAMEPLAY_ZOOM_LEVEL);
}


document.getElementById("reset")!.addEventListener('click', function() {
  const userInput = prompt("Please type 'confirm' to reset:");

  if (userInput === 'confirm') {
    resetGame();
  }
});




//I RAN INTO AN ISSUE WITH THIS FUNCITON. SEE THE COMMENT ABOVE
//getPlayerLocaiton() for more details. THIS FUNCTION IS NOT 
//ENTIRELY MINE. THIS IS WHY THE COMMENTS ARE A LITTLE WIERD
document.getElementById("sensor")!.addEventListener("click", async () => {
    try {
    

    // Await the player's location asynchronously
    const PlayerLocation = await getPlayerLocation();

    // Update PLAYER_POS to the new location
    PLAYER_POS = PlayerLocation;

    // Teleport player marker to the current position
    playerMarker.setLatLng(PlayerLocation);

    // Update the map view to focus on the new position
    map.setView(PlayerLocation, GAMEPLAY_ZOOM_LEVEL); // Use the desired zoom level
  } catch (error) {
    console.error("Error getting player's location:", error);
  }
  movePlayer("south");


});



//THIS FUNCITON IS NOT MINE
//THIS WAS CREATED BY CHAT GPT
//I WOULD HAVE USED BRACE, BUT WHILE I WAS TYRING TO, IT GAVE ME AN
//ERROR SAYING THAT MY QUOTA WAS MET. I POSTED ABOUT THIS IN DISCORD
//I wrote approxamatly 50% of this funciton. The "promise" was something 
//that chatgpt taught me how to use, along with how to use it with a try catch loop
// Refactored getPlayerLocation function to return a Promise
function getPlayerLocation(): Promise<leaflet.LatLng> {
  return new Promise((resolve, reject) => {
    // Check if geolocation is available
    if (navigator.geolocation) {
      // Get the user's current position
      navigator.geolocation.getCurrentPosition(
        (position) => {
          // Get latitude and longitude from the position object
          const latitude = position.coords.latitude;
          const longitude = position.coords.longitude;

          // Resolve the promise with the player's location as a leaflet.LatLng object
          resolve(leaflet.latLng(latitude, longitude));
        }
      );
    } 
  });
}
