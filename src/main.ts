// @deno-types="npm:@types/leaflet@^1.9.14"
import leaflet from "leaflet";

// Style sheets
import "leaflet/dist/leaflet.css";
import "./style.css";

// Fix missing marker images
import "./leafletWorkaround.ts";

// Deterministic random number generator
import luck from "./luck.ts";

// Location of our classroom (as identified on Google Maps)
const STARTING_POSITION = leaflet.latLng(
  36.98949379578401,
  -122.06277128548504,
);

// Tunable gameplay parameters
const GAMEPLAY_ZOOM_LEVEL = 19;
const TILE_DEGREES = 0.0001;
const NEIGHBORHOOD_SIZE = 8;
const CACHE_SPAWN_PROBABILITY = 0.1;

// Create the map (element with id "map" is defined in index.html)
const map = leaflet.map(document.getElementById("map")!, {
  center: STARTING_POSITION,
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
const playerMarker = leaflet.marker(STARTING_POSITION);
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

// Add caches to the map by cell numbers
function spawnCache(inputCord: Cord) {
  // Convert cell numbers into lat/lng bounds
  const origin = STARTING_POSITION;
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
  rect.bindPopup(() => {
    // Each cache has a random point value, mutable by the player
    let pointValue = Math.floor(
      luck([inputCord.x, inputCord.y, "initialValue"].toString()) * 100,
    );

    // The popup offers a description and button
    const popupDiv = document.createElement("div");
    popupDiv.style.background = "white";
    popupDiv.innerHTML = `
                <div>Cache at ${inputCord.x},${inputCord.y} with <span id="value">${pointValue}</span>.</div>
                <button id="collect" style="background-color: white;">collect</button>
                <button id="deposit" style="background-color: white;">deposit</button>
                `;

    // Clicking the button decrements the cache's value and increments the player's points
    popupDiv.querySelector<HTMLButtonElement>("#collect")!.addEventListener(
      "click",
      () => {
        if (pointValue > 0) {
          pointValue--;
          popupDiv.querySelector<HTMLSpanElement>("#value")!.innerHTML =
            pointValue.toString();
          playerPoints++;
          pointText.innerHTML = `Point total: ${playerPoints}`;
        }
      },
    );

    popupDiv.querySelector<HTMLButtonElement>("#deposit")!.addEventListener(
      "click",
      () => {
        if (playerPoints > 0) {
          pointValue++;
          popupDiv.querySelector<HTMLSpanElement>("#value")!.innerHTML =
            pointValue.toString();
          playerPoints--;
          pointText.innerHTML = `Point total: ${playerPoints}`;
        }
      },
    );

    return popupDiv;
  });
}

// Look around the player's neighborhood for caches to spawn
for (let i = -NEIGHBORHOOD_SIZE; i < NEIGHBORHOOD_SIZE; i++) {
  for (let j = -NEIGHBORHOOD_SIZE; j < NEIGHBORHOOD_SIZE; j++) {
    // If location i,j is lucky enough, spawn a cache!
    if (luck([i, j].toString()) < CACHE_SPAWN_PROBABILITY) {
      const outputCord: Cord = { x: i, y: j };
      spawnCache(outputCord);
    }
  }
}
