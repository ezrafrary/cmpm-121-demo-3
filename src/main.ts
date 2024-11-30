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
const PLAYER_POS = leaflet.latLng(36.98949379578401,-122.06287128548504,);
const NULL_ISLAND_STARTING_POS = leaflet.latLng(0,0,);




// Tunable gameplay parameters
const GAMEPLAY_ZOOM_LEVEL = 19;
const TILE_DEGREES = 0.0001;
const NEIGHBORHOOD_SIZE = 9;
const CACHE_SPAWN_PROBABILITY = 0.1;

// Create the map (element with id "map" is defined in index.html)
const map = leaflet.map(document.getElementById("map")!, {
  center: PLAYER_POS,
  zoom: GAMEPLAY_ZOOM_LEVEL,
  minZoom: GAMEPLAY_ZOOM_LEVEL,
  maxZoom: GAMEPLAY_ZOOM_LEVEL,
  zoomControl: false,
  scrollWheelZoom: false,
});

// Populate the map with a background tile layer
leaflet
  .tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    { //brace helped me find this
      maxZoom: GAMEPLAY_ZOOM_LEVEL,
      attribution:
        '&copy; <a href="Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community">OpenStreetMap</a>',
    },
  )
  .addTo(map);

// Add a marker to represent the player
const playerMarker = leaflet.marker(PLAYER_POS);
playerMarker.bindTooltip("Player");
playerMarker.addTo(map);



// Display the player's points
let playerPoints = 0;
const pointText = document.querySelector<HTMLDivElement>("#pointText")!; // element `pointText` is defined in index.html
pointText.innerHTML = "Point total: 0";

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

let CurrentSN = 0;

function generateCoin(inputCords: Cord){
  const newSN: SerialNumber = {SN: CurrentSN};
  const returnCoin: GeoCoin = {coinLocation: inputCords, SN: newSN};
  CurrentSN++;
  return returnCoin;
}

function printCoin(inputCoin: GeoCoin){
  const returnString = `x: ${inputCoin.coinLocation.x} y: ${inputCoin.coinLocation.y} SN: ${inputCoin.SN.SN}  `
  return returnString;
}
function printCoinShort(inputCoin: GeoCoin){
  const returnString = `${inputCoin.coinLocation.x}:${inputCoin.coinLocation.y}#${inputCoin.SN.SN} `
  return returnString;
}

function printCoinArrayShort(inputCoinArray: GeoCoin[]){
  let returnStatement = ``;
  for(let i = 0; i < inputCoinArray.length; i++){
    returnStatement += printCoinShort(inputCoinArray[i]);
  }
  return returnStatement;
}



const playerPosText = document.querySelector<HTMLDivElement>("#playerPosText")!;
playerPosText.innerHTML = `Player Position: ${convertLeafletToCord(PLAYER_POS).x}, ${convertLeafletToCord(PLAYER_POS).y}`;

function convertLeafletToCord(input: leaflet.LatLng){
  const returnCord: Cord = {x: Math.floor(input.lat * 10000),y: Math.floor(input.lng * 10000)};
  
  
  //const returnCord: Cord = {x: input.lat * 10000,y: input.lng * 10000};
  return returnCord;
}



let playerInventory: GeoCoin[] = [];  

function transferCoin(sourceArray: GeoCoin[], targetArray: GeoCoin[]){
  const pushCoin = sourceArray.pop(); //can return undefigned
  if(pushCoin != undefined){
    targetArray.push(pushCoin);
  }
}





// Add caches to the map by cell numbers
function spawnCache(inputCord: Cord) {
  // Convert cell numbers into lat/lng bounds
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

  // Add a rectangle to the map to represent the cache
  const rect = leaflet.rectangle(bounds);
  rect.addTo(map);

  // Handle interactions with the cache
  // Each cache has a random point value, mutable by the player
    let pointValue = Math.floor(
      luck([inputCord.x, inputCord.y, "initialValue"].toString()) * 100,
    );

    let coinArray: GeoCoin[] = [];
    
    for(let i = 0; i < pointValue;i++){
      const newCoin = generateCoin(inputCord);
      coinArray.push(newCoin);
    }
  rect.bindPopup(() => {
    



    // The popup offers a description and button
    const popupDiv = document.createElement("div");
    popupDiv.style.background = "white";
    popupDiv.innerHTML = `
                <div>Cache at ${inputCord.x},${inputCord.y} with <span id="value">${pointValue}}</span>.</div>
                <button id="collect" style="background-color: white;">collect</button>
                <button id="deposit" style="background-color: white;">deposit</button>
                <div id="coins">${printCoinArrayShort(coinArray)}</div>
                `;

    // Clicking the button decrements the cache's value and increments the player's points
    popupDiv.querySelector<HTMLButtonElement>("#collect")!.addEventListener(
      "click",
      (event) => {

        // Prevent the popup from closing when clicking this button
        event.stopPropagation();


        if (pointValue > 0) {
          pointValue--;
          popupDiv.querySelector<HTMLSpanElement>("#value")!.innerHTML =
            pointValue.toString();
          playerPoints++;




          transferCoin(coinArray,playerInventory);
          pointText.innerHTML = `Point total: ${playerPoints}  |  Coins: ${printCoinArrayShort(playerInventory)}`;
          
          popupDiv.querySelector<HTMLSpanElement>("#value")!.innerHTML = pointValue.toString();
          popupDiv.querySelector<HTMLDivElement>("#coins")!.innerHTML = printCoinArrayShort(coinArray);
        }
      },
    );

    popupDiv.querySelector<HTMLButtonElement>("#deposit")!.addEventListener(
      "click",
      (event) => {

        // Prevent the popup from closing when clicking this button
        event.stopPropagation();
        if (playerPoints > 0) {
          pointValue++;
          popupDiv.querySelector<HTMLSpanElement>("#value")!.innerHTML =
            pointValue.toString();
          playerPoints--;

          transferCoin(playerInventory, coinArray);
          pointText.innerHTML = `Point total: ${playerPoints}  |  Coins: ${printCoinArrayShort(playerInventory)}`;
          

          popupDiv.querySelector<HTMLSpanElement>("#value")!.innerHTML = pointValue.toString();
          popupDiv.querySelector<HTMLDivElement>("#coins")!.innerHTML = printCoinArrayShort(coinArray);
        }
      },
    );

    return popupDiv;
  });
}


// Look around the player's neighborhood for caches to spawn
for (let i = -NEIGHBORHOOD_SIZE + convertLeafletToCord(PLAYER_POS).x; i < NEIGHBORHOOD_SIZE + convertLeafletToCord(PLAYER_POS).x; i++) {
  for (let j = -NEIGHBORHOOD_SIZE + convertLeafletToCord(PLAYER_POS).y; j < NEIGHBORHOOD_SIZE + convertLeafletToCord(PLAYER_POS).y; j++) {
    // If location i,j is lucky enough, spawn a cache!
    if (luck([i, j].toString()) < CACHE_SPAWN_PROBABILITY) {
      const outputCord: Cord = { x: i, y: j };
      spawnCache(outputCord);
    }
  }
}



//movement
// Set initial movement offset in degrees
const MOVEMENT_STEP = TILE_DEGREES; // This controls how far the player moves per button press

function movePlayer(direction: "north" | "south" | "west" | "east") {
  // Adjust the player's position based on the direction
  let newLat = PLAYER_POS.lat; // Copy current latitude
  let newLng = PLAYER_POS.lng; // Copy current longitude

  if (direction === "north") newLat += MOVEMENT_STEP; // Move up
  if (direction === "south") newLat -= MOVEMENT_STEP; // Move down
  if (direction === "west") newLng -= MOVEMENT_STEP; // Move left
  if (direction === "east") newLng += MOVEMENT_STEP; // Move right

  // Update player's position
  PLAYER_POS.lat = newLat;
  PLAYER_POS.lng = newLng;

  // Move the player's marker on the map
  playerMarker.setLatLng([newLat, newLng]);

  // Update the displayed player's position
  playerPosText.innerHTML = `Player Position: ${convertLeafletToCord(PLAYER_POS).x}, ${convertLeafletToCord(PLAYER_POS).y}`;

  // Optionally: Check for caches or other actions based on the new position
  checkForCacheInteraction();
}

// Hook up movement buttons to movePlayer()
document.getElementById("north")!.addEventListener("click", () => movePlayer("north"));
document.getElementById("south")!.addEventListener("click", () => movePlayer("south"));
document.getElementById("west")!.addEventListener("click", () => movePlayer("west"));
document.getElementById("east")!.addEventListener("click", () => movePlayer("east"));

// Example function to check for interactions with caches after movement
function checkForCacheInteraction() {
  // Convert player's position to a grid coordinate
  const playerCord = convertLeafletToCord(PLAYER_POS);
  for (let i = -NEIGHBORHOOD_SIZE + convertLeafletToCord(PLAYER_POS).x; i < NEIGHBORHOOD_SIZE + convertLeafletToCord(PLAYER_POS).x; i++) {
    for (let j = -NEIGHBORHOOD_SIZE + convertLeafletToCord(PLAYER_POS).y; j < NEIGHBORHOOD_SIZE + convertLeafletToCord(PLAYER_POS).y; j++) {
      // If location i,j is lucky enough, spawn a cache!
      if (luck([i, j].toString()) < CACHE_SPAWN_PROBABILITY) {
        const outputCord: Cord = { x: i, y: j };
        spawnCache(outputCord);
      }
    }
  }
  
}
