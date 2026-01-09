// Three.js game engine
let gameInstance = null;

class Game {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.car = null;
        this.carSpeed = 0;
        this.carRotation = 0;
        this.carPosition = { x: 0, z: 0 };
        this.wheels = [];
        this.wheelRotation = 0;
        this.keys = {};
        this.isRunning = false;
        
        this.init();
    }

    init() {
        // Scene setup
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x87ceeb);
        this.scene.fog = new THREE.Fog(0x87ceeb, 200, 500);

        // Camera setup - fixed to always face north
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;
        this.camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
        this.camera.position.set(0, 12, -25);
        this.camera.lookAt(0, 0, 0);

        // Renderer setup
        this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
        this.renderer.setSize(width, height);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFShadowShadowMap;
        this.container.appendChild(this.renderer.domElement);

        // Lighting
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(50, 50, 50);
        directionalLight.castShadow = true;
        directionalLight.shadow.mapSize.width = 2048;
        directionalLight.shadow.mapSize.height = 2048;
        directionalLight.shadow.camera.left = -100;
        directionalLight.shadow.camera.right = 100;
        directionalLight.shadow.camera.top = 100;
        directionalLight.shadow.camera.bottom = -100;
        this.scene.add(directionalLight);

        // Ground
        const groundGeometry = new THREE.PlaneGeometry(400, 400);
        const groundMaterial = new THREE.MeshLambertMaterial({ color: 0x2d5016 });
        const ground = new THREE.Mesh(groundGeometry, groundMaterial);
        ground.rotation.x = -Math.PI / 2;
        ground.receiveShadow = true;
        this.scene.add(ground);

        // Create car
        this.createCar();

        // Input handling
        this.setupControls();

        // Window resize handling
        window.addEventListener('resize', () => this.onWindowResize());

        // Start game loop
        this.isRunning = true;
        this.gameLoop();
    }

    createCar() {
        this.wheels = [];

        // Car body - station wagon shape (longer and roomier)
        const bodyGeometry = new THREE.BoxGeometry(1.2, 0.7, 3.2);
        const bodyMaterial = new THREE.MeshPhongMaterial({ color: 0x8B4513 });
        const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        body.position.y = 0.35;
        body.castShadow = true;
        body.receiveShadow = true;
        this.car.add(body);

        // Hood (front)
        const hoodGeometry = new THREE.BoxGeometry(1.2, 0.3, 0.6);
        const hoodMaterial = new THREE.MeshPhongMaterial({ color: 0x704010 });
        const hood = new THREE.Mesh(hoodGeometry, hoodMaterial);
        hood.position.set(0, 0.65, 1.7);
        hood.castShadow = true;
        hood.receiveShadow = true;
        this.car.add(hood);

        // Roof/Cargo area (extended for station wagon)
        const roofGeometry = new THREE.BoxGeometry(1.0, 0.5, 2.2);
        const roofMaterial = new THREE.MeshPhongMaterial({ color: 0x704010 });
        const roof = new THREE.Mesh(roofGeometry, roofMaterial);
        roof.position.set(0, 1.15, -0.1);
        roof.castShadow = true;
        roof.receiveShadow = true;
        this.car.add(roof);

        // Windshield (front window)
        const windshieldGeometry = new THREE.PlaneGeometry(1.0, 0.5);
        const glassMaterial = new THREE.MeshPhongMaterial({
            color: 0x87CEEB,
            transparent: true,
            opacity: 0.4,
            side: THREE.DoubleSide,
            shininess: 100
        });
        const windshield = new THREE.Mesh(windshieldGeometry, glassMaterial);
        windshield.position.set(0, 0.7, 1.55);
        windshield.castShadow = false;
        windshield.receiveShadow = true;
        this.car.add(windshield);

        // Side windows (left and right)
        const sideWindowGeometry = new THREE.PlaneGeometry(0.35, 0.45);
        const leftWindow = new THREE.Mesh(sideWindowGeometry, glassMaterial);
        leftWindow.rotation.y = Math.PI / 2;
        leftWindow.position.set(-0.65, 0.65, 0.2);
        leftWindow.castShadow = false;
        leftWindow.receiveShadow = true;
        this.car.add(leftWindow);

        const rightWindow = new THREE.Mesh(sideWindowGeometry, glassMaterial);
        rightWindow.rotation.y = Math.PI / 2;
        rightWindow.position.set(0.65, 0.65, 0.2);
        rightWindow.castShadow = false;
        rightWindow.receiveShadow = true;
        this.car.add(rightWindow);

        // Rear window (cargo area)
        const rearWindowGeometry = new THREE.PlaneGeometry(1.0, 0.4);
        const rearWindow = new THREE.Mesh(rearWindowGeometry, glassMaterial);
        rearWindow.position.set(0, 0.85, -1.5);
        rearWindow.castShadow = false;
        rearWindow.receiveShadow = true;
        this.car.add(rearWindow);

        // Bumpers
        const bumperGeometry = new THREE.BoxGeometry(1.2, 0.15, 0.1);
        const bumperMaterial = new THREE.MeshPhongMaterial({ color: 0x333333 });
        
        const frontBumper = new THREE.Mesh(bumperGeometry, bumperMaterial);
        frontBumper.position.set(0, 0.35, 1.75);
        frontBumper.castShadow = true;
        frontBumper.receiveShadow = true;
        this.car.add(frontBumper);

        const rearwheel rotation based on movement
        this.wheelRotation += this.carSpeed * 0.15;
        this.wheels.forEach(wheel => {
            wheel.rotation.x = this.wheelRotation;
        });

        // Update Bumper = new THREE.Mesh(bumperGeometry, bumperMaterial);
        rearBumper.position.set(0, 0.35, -1.75);
        rearBumper.castShadow = true;
        rearBumper.receiveShadow = true;
        this.car.add(rearBumper);

        // Wheels
        const wheelGeometry = new THREE.CylinderGeometry(0.35, 0.35, 0.25, 16);
        const wheelMaterial = new THREE.MeshPhongMaterial({ color: 0x222222 });
        const rimGeometry = new THREE.CylinderGeometry(0.22, 0.22, 0.27, 16);
        const rimMaterial = new THREE.MeshPhongMaterial({ color: 0x888888 });

        const wheelPositions = [
            { x: -0.5, z: 0.8 },
            { x: 0.5, z: 0.8 },
            { x: -0.5, z: -0.8 },
            { x: 0.5, z: -0.8 }
        ];

        wheelPositions.forEach((pos, index) => {
            const wheelGroup = new THREE.Group();
            wheelGroup.position.set(pos.x, 0.35, pos.z);
            wheelGroup.rotation.z = Math.PI / 2;

            const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
            wheel.castShadow = true;
            wheel.receiveShadow = true;
            wheelGroup.add(wheel);

            const rim = new THREE.Mesh(rimGeometry, rimMaterial);
            rim.position.z = 0.01;
            rim.castShadow = true;
            rim.receiveShadow = true;
            wheelGroup.add(rim);

            this.car.add(wheelGroup);
            this.wheels.push(wheelGroup true;
            wheel.receiveShadow = true;
            this.car.add(wheel);
        });

        this.scene.add(this.car);
    }

    setupControls() {
        window.addEventListener('keydown', (e) => {
            this.keys[e.key.toLowerCase()] = true;
        });

        window.addEventListener('keyup', (e) => {
            this.keys[e.key.toLowerCase()] = false;
        });
    }

    updateCarMovement() {
        const acceleration = 0.01;
        const maxSpeed = 0.3;
        const friction = 0.92;
        const turnSpeed = 0.08;

        // Forward/Backward
        if (this.keys['arrowup'] || this.keys['w']) {
            this.carSpeed = Math.min(this.carSpeed + acceleration, maxSpeed);
        } else if (this.keys['arrowdown'] || this.keys['s']) {
            this.carSpeed = Math.max(this.carSpeed - acceleration, -maxSpeed);
        } else {
            this.carSpeed *= friction;
        }

        // Left/Right turning
        if (this.keys['arrowleft'] || this.keys['a']) {
            this.carRotation += turnSpeed;
        }
        if (this.keys['arrowright'] || this.keys['d']) {
            this.carRotation -= turnSpeed;
        }

        // Update car position based on rotation and speed
        this.carPosition.x += Math.sin(this.carRotation) * this.carSpeed;
        this.carPosition.z += Math.cos(this.carRotation) * this.carSpeed;

        // Update car world position and rotation
        this.car.position.x = this.carPosition.x;
        this.car.position.z = this.carPosition.z;
        this.car.rotation.y = this.carRotation;

        // Camera positioned behind the car, always looking at it
        const cameraDistance = 6;
        const cameraHeight = 2;
        
        // Position camera behind car based on its rotation
        this.camera.position.x = this.carPosition.x + Math.sin(this.carRotation) * cameraDistance;
        this.camera.position.z = this.carPosition.z + Math.cos(this.carRotation) * cameraDistance;
        this.camera.position.y = cameraHeight;

        // Always look at the car
        this.camera.lookAt(this.carPosition.x, 0.3, this.carPosition.z);
    }

    gameLoop = () => {
        if (!this.isRunning) return;

        this.updateCarMovement();
        this.renderer.render(this.scene, this.camera);
        requestAnimationFrame(this.gameLoop);
    }

    onWindowResize() {
        if (!this.container || !this.camera || !this.renderer) return;
        
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;

        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
    }

    stop() {
        this.isRunning = false;
        if (this.renderer && this.container && this.renderer.domElement.parentNode === this.container) {
            this.container.removeChild(this.renderer.domElement);
        }
    }
}

function startGame() {
    document.getElementById('home-screen').classList.remove('active');
    document.getElementById('game-screen').classList.add('active');
    
    if (gameInstance) {
        gameInstance.stop();
    }
    
    gameInstance = new Game('game-container');
}

// Cleanup when going back
document.addEventListener('DOMContentLoaded', () => {
    const backBtn = document.getElementById('back-btn');
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            if (gameInstance) {
                gameInstance.stop();
                gameInstance = null;
            }
        });
    }
});
