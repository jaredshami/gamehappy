// Are We There Yet? - 3D Neighborhood Game
class NeighborhoodGame {
    constructor() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x87ceeb); // Sky blue
        this.scene.fog = new THREE.Fog(0x87ceeb, 200, 500);

        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.camera.position.set(0, 5, -15);
        this.camera.lookAt(0, 0, 0);

        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        document.getElementById('game-container').appendChild(this.renderer.domElement);

        // Lighting
        this.setupLighting();

        // Game state
        this.car = null;
        this.carSpeed = 0;
        this.carRotation = 0; // 0 = East, PI/2 = North, PI = West, 3PI/2 = South
        this.carPosition = { x: 0, y: 0.5, z: 0 };
        this.scenePosition = { x: 0, y: 0, z: 0 }; // Track scene translation
        this.maxSpeed = 0.5;
        this.acceleration = 0.02;
        this.turnSpeed = 0.05;

        // Input
        this.keys = {};
        this.setupControls();

        // Build the neighborhood
        this.buildNeighborhood();

        // Window resize
        window.addEventListener('resize', () => this.onWindowResize());

        // Start animation loop
        this.animate();
    }

    setupLighting() {
        // Ambient light
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambientLight);

        // Directional light (sun)
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(100, 100, 50);
        directionalLight.shadow.mapSize.width = 2048;
        directionalLight.shadow.mapSize.height = 2048;
        directionalLight.shadow.camera.left = -200;
        directionalLight.shadow.camera.right = 200;
        directionalLight.shadow.camera.top = 200;
        directionalLight.shadow.camera.bottom = -200;
        directionalLight.castShadow = true;
        this.scene.add(directionalLight);
    }

    buildNeighborhood() {
        // Ground/terrain
        const groundGeometry = new THREE.PlaneGeometry(300, 300);
        const groundMaterial = new THREE.MeshLambertMaterial({ color: 0x2d5016 }); // Dark green (grass)
        const ground = new THREE.Mesh(groundGeometry, groundMaterial);
        ground.rotation.x = -Math.PI / 2;
        ground.receiveShadow = true;
        this.scene.add(ground);

        // Create the car
        this.createCar();
    }

    buildRoads() {
        const roadWidth = 15;
        const blockSize = 60;
        const roadColor = 0x444444; // Dark gray

        // Horizontal roads
        for (let i = 0; i < 3; i++) {
            const z = -60 + i * blockSize + roadWidth / 2;
            const road = this.createRoad(200, roadWidth, z);
            this.scene.add(road);
        }

        // Vertical roads
        for (let i = 0; i < 3; i++) {
            const x = -60 + i * blockSize + roadWidth / 2;
            const road = this.createRoad(roadWidth, 200, 0, x);
            this.scene.add(road);
        }
    }

    createRoad(width, depth, z = 0, x = 0) {
        const roadGeometry = new THREE.PlaneGeometry(width, depth);
        const roadMaterial = new THREE.MeshLambertMaterial({ color: 0x444444 });
        const road = new THREE.Mesh(roadGeometry, roadMaterial);
        road.rotation.x = -Math.PI / 2;
        road.position.set(x, 0.01, z);
        road.receiveShadow = true;

        // Add road markings (yellow lines)
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 256;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#444444';
        ctx.fillRect(0, 0, 256, 256);
        ctx.strokeStyle = '#ffff00';
        ctx.lineWidth = 8;
        ctx.setLineDash([20, 20]);
        ctx.beginPath();
        ctx.moveTo(128, 0);
        ctx.lineTo(128, 256);
        ctx.stroke();

        const texture = new THREE.CanvasTexture(canvas);
        texture.repeat.set(4, 4);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        roadMaterial.map = texture;

        return road;
    }

    buildHouses() {
        const housePositions = [
            // Top left block (x: -90 to -30, z: -90 to -30)
            { x: -80, z: -80, color: 0xff6b6b }, // Red
            { x: -50, z: -80, color: 0x4ecdc4 }, // Teal
            { x: -80, z: -50, color: 0xffe66d }, // Yellow
            { x: -50, z: -50, color: 0x95e1d3 }, // Mint

            // Top right block (x: 30 to 90, z: -90 to -30)
            { x: 40, z: -80, color: 0xff6b6b },
            { x: 70, z: -80, color: 0x4ecdc4 },
            { x: 40, z: -50, color: 0xffe66d },
            { x: 70, z: -50, color: 0x95e1d3 },

            // Bottom left block (x: -90 to -30, z: 30 to 90)
            { x: -80, z: 40, color: 0xff6b6b },
            { x: -50, z: 40, color: 0x4ecdc4 },
            { x: -80, z: 70, color: 0xffe66d },
            { x: -50, z: 70, color: 0x95e1d3 },

            // Bottom right block (x: 30 to 90, z: 30 to 90)
            { x: 40, z: 40, color: 0xff6b6b },
            { x: 70, z: 40, color: 0x4ecdc4 },
            { x: 40, z: 70, color: 0xffe66d },
            { x: 70, z: 70, color: 0x95e1d3 }
        ];

        housePositions.forEach(pos => {
            const house = this.createHouse(pos.color);
            house.position.set(pos.x, 0, pos.z);
            this.scene.add(house);
        });
    }

    createHouse(color) {
        const group = new THREE.Group();

        // Main structure (cube)
        const bodyGeometry = new THREE.BoxGeometry(18, 18, 18);
        const bodyMaterial = new THREE.MeshLambertMaterial({ color: color });
        const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        body.position.y = 9;
        body.castShadow = true;
        body.receiveShadow = true;
        group.add(body);

        // Roof (pyramid)
        const roofGeometry = new THREE.ConeGeometry(13, 12, 4);
        const roofMaterial = new THREE.MeshLambertMaterial({ color: 0x8b4513 }); // Brown
        const roof = new THREE.Mesh(roofGeometry, roofMaterial);
        roof.position.y = 24;
        roof.rotation.y = Math.PI / 4;
        roof.castShadow = true;
        group.add(roof);

        // Door (dark)
        const doorGeometry = new THREE.BoxGeometry(4, 8, 0.5);
        const doorMaterial = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
        const door = new THREE.Mesh(doorGeometry, doorMaterial);
        door.position.set(0, 6, 9.2);
        door.castShadow = true;
        group.add(door);

        // Windows
        const windowGeometry = new THREE.BoxGeometry(3, 3, 0.5);
        const windowMaterial = new THREE.MeshLambertMaterial({ color: 0x87ceeb }); // Light blue
        
        const windowPositions = [
            { x: -5, y: 12 },
            { x: 5, y: 12 }
        ];

        windowPositions.forEach(pos => {
            const window = new THREE.Mesh(windowGeometry, windowMaterial);
            window.position.set(pos.x, pos.y, 9.2);
            window.castShadow = true;
            group.add(window);
        });

        return group;
    }

    buildSchool() {
        const group = new THREE.Group();

        // Main building (larger cube)
        const bodyGeometry = new THREE.BoxGeometry(30, 24, 30);
        const bodyMaterial = new THREE.MeshLambertMaterial({ color: 0xffa500 }); // Orange
        const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        body.position.y = 12;
        body.castShadow = true;
        body.receiveShadow = true;
        group.add(body);

        // Roof
        const roofGeometry = new THREE.ConeGeometry(20, 12, 4);
        const roofMaterial = new THREE.MeshLambertMaterial({ color: 0xff0000 }); // Red
        const roof = new THREE.Mesh(roofGeometry, roofMaterial);
        roof.position.y = 30;
        roof.rotation.y = Math.PI / 4;
        roof.castShadow = true;
        group.add(roof);

        // Flag pole
        const poleGeometry = new THREE.CylinderGeometry(0.5, 0.5, 20, 8);
        const poleMaterial = new THREE.MeshLambertMaterial({ color: 0x8b4513 });
        const pole = new THREE.Mesh(poleGeometry, poleMaterial);
        pole.position.set(0, 30, 0);
        pole.castShadow = true;
        group.add(pole);

        // Sign
        const signGeometry = new THREE.BoxGeometry(15, 8, 2);
        const signMaterial = new THREE.MeshLambertMaterial({ color: 0xffffff });
        const sign = new THREE.Mesh(signGeometry, signMaterial);
        sign.position.set(0, 5, 15.5);
        sign.castShadow = true;
        group.add(sign);

        group.position.set(100, 0, 100);
        this.scene.add(group);

        // Label for school
        this.schoolPosition = new THREE.Vector3(100, 0, 100);
    }

    createCar() {
        const group = new THREE.Group();

        // Main body (red box) - 8 units long in Z direction, but we'll rotate it to align with our movement
        const bodyGeometry = new THREE.BoxGeometry(4, 3, 8);
        const bodyMaterial = new THREE.MeshLambertMaterial({ color: 0xff0000 }); // Red
        const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        body.position.y = 1.5;
        body.castShadow = true;
        body.receiveShadow = true;
        group.add(body);

        // Top (smaller)
        const topGeometry = new THREE.BoxGeometry(3, 2, 4);
        const topMaterial = new THREE.MeshLambertMaterial({ color: 0xcc0000 }); // Darker red
        const top = new THREE.Mesh(topGeometry, topMaterial);
        top.position.set(0, 3.5, -0.5);
        top.castShadow = true;
        group.add(top);

        // Wheels
        const wheelGeometry = new THREE.CylinderGeometry(0.8, 0.8, 0.6, 16);
        const wheelMaterial = new THREE.MeshLambertMaterial({ color: 0x000000 }); // Black

        const wheelPositions = [
            { x: -1.5, z: 2 },
            { x: 1.5, z: 2 },
            { x: -1.5, z: -2 },
            { x: 1.5, z: -2 }
        ];

        wheelPositions.forEach(pos => {
            const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
            wheel.rotation.z = Math.PI / 2;
            wheel.position.set(pos.x, 0.8, pos.z);
            wheel.castShadow = true;
            group.add(wheel);
        });

        // Rotate group to align with movement direction (car naturally points Z, we move in X)
        group.rotation.y = Math.PI / 2;

        this.car = group;
        // Car stays at center of screen
        this.car.position.set(0, 0.5, 0);
        this.scene.add(this.car);
    }

    setupControls() {
        // Keyboard
        document.addEventListener('keydown', (e) => {
            this.keys[e.key.toLowerCase()] = true;
        });
        document.addEventListener('keyup', (e) => {
            this.keys[e.key.toLowerCase()] = false;
        });

        // Button controls
        document.getElementById('forward-btn').addEventListener('mousedown', () => {
            this.keys['forward'] = true;
        });
        document.getElementById('forward-btn').addEventListener('mouseup', () => {
            this.keys['forward'] = false;
        });

        document.getElementById('turn-right-btn').addEventListener('mousedown', () => {
            this.keys['right'] = true;
        });
        document.getElementById('turn-right-btn').addEventListener('mouseup', () => {
            this.keys['right'] = false;
        });

        document.getElementById('turn-left-btn').addEventListener('mousedown', () => {
            this.keys['left'] = true;
        });
        document.getElementById('turn-left-btn').addEventListener('mouseup', () => {
            this.keys['left'] = false;
        });

        // Touch controls
        document.getElementById('forward-btn').addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.keys['forward'] = true;
        });
        document.getElementById('forward-btn').addEventListener('touchend', (e) => {
            e.preventDefault();
            this.keys['forward'] = false;
        });

        document.getElementById('turn-right-btn').addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.keys['right'] = true;
        });
        document.getElementById('turn-right-btn').addEventListener('touchend', (e) => {
            e.preventDefault();
            this.keys['right'] = false;
        });

        document.getElementById('turn-left-btn').addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.keys['left'] = true;
        });
        document.getElementById('turn-left-btn').addEventListener('touchend', (e) => {
            e.preventDefault();
            this.keys['left'] = false;
        });
    }

    updateCarMovement() {
        // Turning
        if (this.keys['right'] || this.keys['arrowright']) {
            this.carRotation += this.turnSpeed;
        }
        if (this.keys['left'] || this.keys['arrowleft']) {
            this.carRotation -= this.turnSpeed;
        }

        // Acceleration (forward and backward)
        if (this.keys['forward'] || this.keys['arrowup'] || this.keys['w']) {
            this.carSpeed = Math.min(this.carSpeed + this.acceleration, this.maxSpeed);
        } else if (this.keys['backward'] || this.keys['arrowdown'] || this.keys['s']) {
            this.carSpeed = Math.max(this.carSpeed - this.acceleration, -this.maxSpeed);
        } else {
            // Decelerate
            if (this.carSpeed > 0) {
                this.carSpeed = Math.max(this.carSpeed - this.acceleration * 0.5, 0);
            } else if (this.carSpeed < 0) {
                this.carSpeed = Math.min(this.carSpeed + this.acceleration * 0.5, 0);
            }
        }

        // Car stays at center, world moves
        // Rotate scene with car rotation
        this.scene.rotation.y = this.carRotation;

        // Move the world in opposite direction of car movement
        const worldOffsetX = -Math.cos(this.carRotation) * this.carSpeed;
        const worldOffsetZ = -Math.sin(this.carRotation) * this.carSpeed;

        // Update scene position and track it
        this.scenePosition.x += worldOffsetX;
        this.scenePosition.z += worldOffsetZ;
        this.scene.position.x = this.scenePosition.x;
        this.scene.position.z = this.scenePosition.z;

        // Keep car visually fixed - counteract scene rotation and translation
        this.car.rotation.y = -this.carRotation;
        this.car.position.x = -this.scenePosition.x;
        this.car.position.z = -this.scenePosition.z;

        // Update HUD
        document.getElementById('speed-display').textContent = `Speed: ${Math.abs(this.carSpeed * 100).toFixed(0)}%`;
        const directions = ['East', 'North', 'West', 'South'];
        const dirIndex = Math.round((this.carRotation / (Math.PI / 2)) % 4 + 4) % 4;
        document.getElementById('direction-display').textContent = `Direction: ${directions[dirIndex]}`;
    }

    isOnRoad(x, z) {
        const roadWidth = 15;
        const roadHalfWidth = roadWidth / 2;
        
        // Road positions (centers)
        const roadPositions = [-60, 0, 60];

        // Check horizontal roads
        for (let roadZ of roadPositions) {
            if (Math.abs(z - roadZ) <= roadHalfWidth && x >= -150 && x <= 150) {
                return true;
            }
        }

        // Check vertical roads
        for (let roadX of roadPositions) {
            if (Math.abs(x - roadX) <= roadHalfWidth && z >= -150 && z <= 150) {
                return true;
            }
        }

        return false;
    }

    updateCamera() {
        // Camera is fixed in position - car and world rotate around it
        // Camera position is already set in constructor
    }

    animate() {
        requestAnimationFrame(() => this.animate());

        this.updateCarMovement();
        this.updateCamera();

        this.renderer.render(this.scene, this.camera);
    }

    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }
}

// Start game when page loads
document.addEventListener('DOMContentLoaded', () => {
    new NeighborhoodGame();
});
