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
        this.car = new THREE.Group();
        this.car.position.set(0, 0, 0);

        // Car body
        const bodyGeometry = new THREE.BoxGeometry(1, 0.6, 2);
        const bodyMaterial = new THREE.MeshPhongMaterial({ color: 0xff0000 });
        const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        body.position.y = 0.3;
        body.castShadow = true;
        body.receiveShadow = true;
        this.car.add(body);

        // Car roof
        const roofGeometry = new THREE.BoxGeometry(0.8, 0.4, 1);
        const roofMaterial = new THREE.MeshPhongMaterial({ color: 0xcc0000 });
        const roof = new THREE.Mesh(roofGeometry, roofMaterial);
        roof.position.y = 0.8;
        roof.position.z = -0.1;
        roof.castShadow = true;
        roof.receiveShadow = true;
        this.car.add(roof);

        // Wheels
        const wheelGeometry = new THREE.CylinderGeometry(0.3, 0.3, 0.3, 16);
        const wheelMaterial = new THREE.MeshPhongMaterial({ color: 0x333333 });

        const wheelPositions = [
            { x: -0.4, z: 0.5 },
            { x: 0.4, z: 0.5 },
            { x: -0.4, z: -0.5 },
            { x: 0.4, z: -0.5 }
        ];

        wheelPositions.forEach(pos => {
            const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
            wheel.rotation.z = Math.PI / 2;
            wheel.position.set(pos.x, 0.3, pos.z);
            wheel.castShadow = true;
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

        // Camera always faces north and pans to keep car centered
        const cameraDistance = 25;
        const cameraHeight = 12;
        const offsetDistance = 5; // How far ahead of car to look
        const lookAheadZ = this.carPosition.z + Math.cos(this.carRotation) * offsetDistance;
        const lookAheadX = this.carPosition.x + Math.sin(this.carRotation) * offsetDistance;

        this.camera.position.x = this.carPosition.x;
        this.camera.position.z = this.carPosition.z + cameraDistance;
        this.camera.position.y = cameraHeight;

        // Always look at a point ahead of the car, centered horizontally
        this.camera.lookAt(lookAheadX, 0, lookAheadZ);
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
