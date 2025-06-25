// main.js: Core game logic for the 3D Roguelike Dungeon Crawler

//// Global Variables and Initial Setup ////

// Game settings and constants
const DUNGEON_WIDTH = 30;
const DUNGEON_HEIGHT = 30;
const MAX_ROOMS = 6;
const ROOM_MIN_SIZE = 3;
const ROOM_MAX_SIZE = 6;

const PLAYER_SPEED = 3;            // units per second
const ENEMY_SPEED = 1.5;           // units per second (enemy is slower)
const PLAYER_MAX_HEALTH = 100;
const ENEMY_MAX_HEALTH = 50;
const ENEMY_DAMAGE = 10;           // damage to player per enemy hit
const ATTACK_INTERVAL = 1000;      // enemy attack cooldown in milliseconds

// Three.js variables
let scene, camera, renderer;
let floorMesh;
let playerMesh, enemyMesh;
let playerHealth = PLAYER_MAX_HEALTH;
let enemyHealth = ENEMY_MAX_HEALTH;
let lastEnemyAttackTime = 0;       // timestamp of last enemy attack

// Input tracking
const keys = { up: false, down: false, left: false, right: false };

// DOM elements for UI
const healthBarInner = document.getElementById('healthBarInner');
const gameOverText = document.getElementById('gameOver');

// Initialize the Three.js scene, camera, lights, and renderer
function initThreeJS() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);  // black background

  camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.1, 1000);
  // Camera will be positioned later relative to player

  renderer = new THREE.WebGLRenderer();
  renderer.setSize(window.innerWidth, window.innerHeight);
  // Append renderer canvas to document body
  document.body.appendChild(renderer.domElement);

  // Lighting: ambient + directional
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
  scene.add(ambientLight);
  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.7);
  directionalLight.position.set(0, 50, 0);
  scene.add(directionalLight);
}

// Handle window resize to adjust camera and renderer
window.addEventListener('resize', () => {
  if (camera && renderer) {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }
});

// Key controls for movement and actions
window.addEventListener('keydown', (e) => {
  switch(e.key) {
    case 'w':
    case 'W':
    case 'ArrowUp':
      keys.up = true;
      break;
    case 's':
    case 'S':
    case 'ArrowDown':
      keys.down = true;
      break;
    case 'a':
    case 'A':
    case 'ArrowLeft':
      keys.left = true;
      break;
    case 'd':
    case 'D':
      keys.right = true;
      break;
    case ' ':  // Space bar to attack
      playerAttack();
      break;
    case 'r':
    case 'R':  // R to restart after game over
      if (playerHealth <= 0) {
        restartGame();
      }
      break;
  }
});
window.addEventListener('keyup', (e) => {
  switch(e.key) {
    case 'w':
    case 'W':
    case 'ArrowUp':
      keys.up = false;
      break;
    case 's':
    case 'S':
    case 'ArrowDown':
      keys.down = false;
      break;
    case 'a':
    case 'A':
    case 'ArrowLeft':
      keys.left = false;
      break;
    case 'd':
    case 'D':
      keys.right = false;
      break;
  }
});

//// Dungeon Generation ////

// Generate a random dungeon layout as a 2D grid.
// 0 = wall, 1 = floor. Returns an object with the grid and list of room centers.
function generateDungeon(width, height, maxRooms, roomMin, roomMax) {
  // Create grid initialized with walls
  const grid = [];
  for (let y = 0; y < height; y++) {
    grid[y] = [];
    for (let x = 0; x < width; x++) {
      grid[y][x] = 0;  // wall
    }
  }
  const rooms = [];

  // Utility function to carve a rectangle of floor
  function carveRoom(x, y, w, h) {
    for (let yy = y; yy < y + h; yy++) {
      for (let xx = x; xx < x + w; xx++) {
        grid[yy][xx] = 1;  // floor
      }
    }
  }

  // Place random rooms
  for (let i = 0; i < maxRooms; i++) {
    const w = Math.floor(Math.random() * (roomMax - roomMin + 1)) + roomMin;
    const h = Math.floor(Math.random() * (roomMax - roomMin + 1)) + roomMin;
    const x = Math.floor(Math.random() * (width - w - 2)) + 1;   // leave at least 1-tile border
    const y = Math.floor(Math.random() * (height - h - 2)) + 1;
    // Check overlap with existing rooms
    let overlaps = false;
    for (let yy = y; yy < y + h && !overlaps; yy++) {
      for (let xx = x; xx < x + w && !overlaps; xx++) {
        if (grid[yy][xx] === 1) {
          overlaps = true;
        }
      }
    }
    if (overlaps) continue;  // skip this room if it overlaps

    // Carve out the room
    carveRoom(x, y, w, h);
    // Record the room's center
    const centerX = Math.floor(x + w/2);
    const centerY = Math.floor(y + h/2);
    rooms.push({ cx: centerX, cy: centerY });
  }

  // Connect rooms with corridors (tunnels)
  if (rooms.length > 1) {
    for (let i = 1; i < rooms.length; i++) {
      const r1 = rooms[i-1];
      const r2 = rooms[i];
      // corridor from r1 to r2
      const x1 = r1.cx, y1 = r1.cy;
      const x2 = r2.cx, y2 = r2.cy;
      // Flip a coin for corridor direction order
      if (Math.random() < 0.5) {
        // horizontal then vertical
        const startX = Math.min(x1, x2);
        const endX = Math.max(x1, x2);
        for (let x = startX; x <= endX; x++) {
          grid[y1][x] = 1;
        }
        const startY = Math.min(y1, y2);
        const endY = Math.max(y1, y2);
        for (let y = startY; y <= endY; y++) {
          grid[y][x2] = 1;
        }
      } else {
        // vertical then horizontal
        const startY = Math.min(y1, y2);
        const endY = Math.max(y1, y2);
        for (let y = startY; y <= endY; y++) {
          grid[y][x1] = 1;
        }
        const startX = Math.min(x1, x2);
        const endX = Math.max(x1, x2);
        for (let x = startX; x <= endX; x++) {
          grid[y2][x] = 1;
        }
      }
    }
  }

  return { grid, rooms };
}

// Build the Three.js dungeon (floor plane and wall meshes) from the grid
function buildDungeon(grid) {
  const height = grid.length;
  const width = grid[0].length;
  // Floor: one big plane covering the entire dungeon area
  const floorGeo = new THREE.PlaneGeometry(width, height);
  const floorMat = new THREE.MeshLambertMaterial({ color: 0x808080 });  // gray floor
  floorMesh = new THREE.Mesh(floorGeo, floorMat);
  floorMesh.rotation.x = -Math.PI / 2;  // rotate to horizontal
  // Position the floor so it aligns with grid coordinates (center it)
  floorMesh.position.set(width/2 - 0.5, 0, height/2 - 0.5);
  scene.add(floorMesh);

  // Walls: create a cube for each wall cell
  const wallGeo = new THREE.BoxGeometry(1, 2, 1);  // width=1, height=2, depth=1
  const wallMat = new THREE.MeshLambertMaterial({ color: 0x654321 });  // brownish walls
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (grid[y][x] === 0) {
        const wallMesh = new THREE.Mesh(wallGeo, wallMat);
        wallMesh.position.set(x, 1, y);  // y=1 puts base of wall at y=0 (since height=2)
        scene.add(wallMesh);
      }
    }
  }
}

//// Game Entities and Mechanics ////

// Create player and enemy meshes and add to scene
function createPlayerAndEnemy(startRoomCenter, endRoomCenter) {
  // Player
  const playerGeo = new THREE.SphereGeometry(0.3, 8, 8);  // small sphere
  const playerMat = new THREE.MeshLambertMaterial({ color: 0x00ff00 });  // green player
  playerMesh = new THREE.Mesh(playerGeo, playerMat);
  playerMesh.position.set(startRoomCenter.cx, 0.3, startRoomCenter.cy);
  scene.add(playerMesh);

  // Enemy
  const enemyGeo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
  const enemyMat = new THREE.MeshLambertMaterial({ color: 0xff0000 });  // red enemy
  enemyMesh = new THREE.Mesh(enemyGeo, enemyMat);
  // place enemy at the center of the last room (or first if only one room)
  const enemyPos = endRoomCenter || startRoomCenter;
  enemyMesh.position.set(enemyPos.cx, 0.25, enemyPos.cy);
  scene.add(enemyMesh);

  // Reset health values
  playerHealth = PLAYER_MAX_HEALTH;
  enemyHealth = ENEMY_MAX_HEALTH;
  updateHealthUI();
}

// Update health bar UI to reflect current player health
function updateHealthUI() {
  const healthPercent = Math.max(playerHealth, 0) / PLAYER_MAX_HEALTH * 100;
  healthBarInner.style.width = healthPercent + '%';
}

// Player attack action (called on Space key press)
function playerAttack() {
  if (!enemyMesh || enemyHealth <= 0) return;
  // Check distance to enemy
  const dx = playerMesh.position.x - enemyMesh.position.x;
  const dz = playerMesh.position.z - enemyMesh.position.z;
  const distSq = dx*dx + dz*dz;
  const attackRange = 1.5;
  if (distSq <= attackRange * attackRange) {
    // Hit the enemy
    enemyHealth -= 50;  // deal damage (tunable)
    if (enemyHealth <= 0) {
      enemyHealth = 0;
      // Enemy defeated: remove from scene (or hide)
      scene.remove(enemyMesh);
      enemyMesh = undefined;
    }
  }
}

// Enemy attack handling (when near player)
function enemyAttack(deltaTime) {
  if (!enemyMesh) return;
  // Compute distance between player and enemy
  const dx = playerMesh.position.x - enemyMesh.position.x;
  const dz = playerMesh.position.z - enemyMesh.position.z;
  const distSq = dx*dx + dz*dz;
  const hitRange = 1.0;
  if (distSq <= hitRange * hitRange) {
    const now = performance.now();
    if (now - lastEnemyAttackTime > ATTACK_INTERVAL) {
      // Enemy hits the player
      playerHealth -= ENEMY_DAMAGE;
      lastEnemyAttackTime = now;
      updateHealthUI();
      // If player died, trigger game over
      if (playerHealth <= 0) {
        playerHealth = 0;
        gameOverText.style.display = 'block';
      }
    }
  }
}

// Game Over / Restart
function restartGame() {
  // Remove existing player/enemy if any
  if (playerMesh) scene.remove(playerMesh);
  if (enemyMesh) scene.remove(enemyMesh);
  // Remove existing floor and all wall meshes
  if (floorMesh) scene.remove(floorMesh);
  // Alternatively, to remove walls: remove all child meshes from scene and add lights back, but here we rebuild entire scene.

  // Clear scene completely and re-initialize (except lights/camera which we keep)
  // We will create a new dungeon and entities.
  const dungeon = generateDungeon(DUNGEON_WIDTH, DUNGEON_HEIGHT, MAX_ROOMS, ROOM_MIN_SIZE, ROOM_MAX_SIZE);
  buildDungeon(dungeon.grid);
  const startCenter = dungeon.rooms[0];
  const endCenter = dungeon.rooms[dungeon.rooms.length - 1] || dungeon.rooms[0];
  createPlayerAndEnemy(startCenter, endCenter);
  // Reset camera position to follow player immediately
  camera.position.set(playerMesh.position.x, 10, playerMesh.position.z + 10);
  camera.lookAt(playerMesh.position);
  // Hide Game Over text
  gameOverText.style.display = 'none';
}

// Main animation loop (called ~60 times per second)
function animate() {
  requestAnimationFrame(animate);

  // Only update game logic if player is alive
  if (playerHealth > 0) {
    const deltaTime = clock.getDelta();  // time since last frame in seconds

    // Player movement based on keys
    if (playerMesh) {
      let moveX = 0, moveZ = 0;
      if (keys.up)    moveZ -= 1;
      if (keys.down)  moveZ += 1;
      if (keys.left)  moveX -= 1;
      if (keys.right) moveX += 1;
      // normalize diagonal movement
      if (moveX !== 0 || moveZ !== 0) {
        const length = Math.sqrt(moveX*moveX + moveZ*moveZ);
        if (length > 0) { moveX /= length; moveZ /= length; }
      }
      const moveDistance = PLAYER_SPEED * deltaTime;
      // Attempt X movement
      if (moveX !== 0) {
        const newX = playerMesh.position.x + moveX * moveDistance;
        // Check collision at newX
        const cellX = Math.floor(newX + 0.5);
        const cellZ = Math.floor(playerMesh.position.z + 0.5);
        if (dungeonGrid[cellZ] && dungeonGrid[cellZ][cellX] === 1) {
          playerMesh.position.x = newX;
        }
      }
      // Attempt Z movement
      if (moveZ !== 0) {
        const newZ = playerMesh.position.z + moveZ * moveDistance;
        const cellX = Math.floor(playerMesh.position.x + 0.5);
        const cellZ = Math.floor(newZ + 0.5);
        if (dungeonGrid[cellZ] && dungeonGrid[cellZ][cellX] === 1) {
          playerMesh.position.z = newZ;
        }
      }
    }

    // Enemy movement (chase player)
    if (enemyMesh) {
      const dx = playerMesh.position.x - enemyMesh.position.x;
      const dz = playerMesh.position.z - enemyMesh.position.z;
      const dist = Math.sqrt(dx*dx + dz*dz);
      if (dist > 0) {
        const step = ENEMY_SPEED * deltaTime;
        // move enemy toward player, small step
        const moveX = (dx / dist) * step;
        const moveZ = (dz / dist) * step;
        // Enemy collision check with walls similar to player
        if (moveX !== 0) {
          const newEx = enemyMesh.position.x + moveX;
          const cellX = Math.floor(newEx + 0.5);
          const cellZ = Math.floor(enemyMesh.position.z + 0.5);
          if (dungeonGrid[cellZ] && dungeonGrid[cellZ][cellX] === 1) {
            enemyMesh.position.x = newEx;
          }
        }
        if (moveZ !== 0) {
          const newEz = enemyMesh.position.z + moveZ;
          const cellX = Math.floor(enemyMesh.position.x + 0.5);
          const cellZ = Math.floor(newEz + 0.5);
          if (dungeonGrid[cellZ] && dungeonGrid[cellZ][cellX] === 1) {
            enemyMesh.position.z = newEz;
          }
        }
      }
    }

    // Enemy attack (if in range)
    enemyAttack(deltaTime);
  }

  // Camera follow player
  if (playerMesh) {
    // Keep camera a fixed offset from player
    const camOffsetX = 0;
    const camOffsetY = 10;
    const camOffsetZ = 10;
    camera.position.x = playerMesh.position.x + camOffsetX;
    camera.position.y = playerMesh.position.y + camOffsetY;
    camera.position.z = playerMesh.position.z + camOffsetZ;
    camera.lookAt(playerMesh.position);
  }

  // Render the scene
  renderer.render(scene, camera);
}

//// Game Initialization ////

// Initialize Three.js and build the first dungeon
initThreeJS();
const dungeonData = generateDungeon(DUNGEON_WIDTH, DUNGEON_HEIGHT, MAX_ROOMS, ROOM_MIN_SIZE, ROOM_MAX_SIZE);
const dungeonGrid = dungeonData.grid;
buildDungeon(dungeonGrid);
// Create player in first room and enemy in last room
const startRoom = dungeonData.rooms[0] || { cx: Math.floor(DUNGEON_WIDTH/2), cy: Math.floor(DUNGEON_HEIGHT/2) };
const endRoom = dungeonData.rooms[dungeonData.rooms.length - 1] || startRoom;
createPlayerAndEnemy(startRoom, endRoom);
// Initialize camera position
camera.position.set(playerMesh.position.x, 10, playerMesh.position.z + 10);
camera.lookAt(playerMesh.position);
// Start the game loop
const clock = new THREE.Clock();
animate();
