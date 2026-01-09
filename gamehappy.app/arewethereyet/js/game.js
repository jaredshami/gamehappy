// Three.js game engine
let gameInstance = null;

class Game {
    constructor(containerId) {
        console.log('=== Game Constructor Started ===');
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
        this.carLoaded = false;
        
        this.init();
    }

    init() {
        console.log('Game.init() called');
        
        // Scene setup
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x87ceeb);
        this.scene.fog = new THREE.Fog(0x87ceeb, 200, 500);

        // Camera setup
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
        console.log('Renderer created');

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
        console.log('Ground created');

        // Create car
        this.createCar();

        // Input handling
        this.setupControls();

        // Window resize handling
        window.addEventListener('resize', () => this.onWindowResize());

        // Start game loop
        this.isRunning = true;
        console.log('Starting game loop');
        this.gameLoop();
    }

    createCar() {
        console.log('=== createCar() called ===');
        this.car = new THREE.Group();
        this.car.position.set(0, 0, 0);
        
        console.log('Loading car sprite from assets/car1.png');
        this.loadCarSprite();
        
        this.scene.add(this.car);
    }

    loadCarSprite() {
        const textureLoader = new THREE.TextureLoader();
        
        textureLoader.load(
            'assets/car1.png',
            (texture) => {
                console.log('✓ Car sprite texture loaded!');
                
                // Create sprite material with the car image
                const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
                
                // Create sprite
                const sprite = new THREE.Sprite(spriteMaterial);
                
                // Image is 536x729 (width x height), so aspect ratio is 0.735
                // Scale sprite to 8 units height, maintaining aspect ratio
                const aspectRatio = 536 / 729;
                sprite.scale.set(8 * aspectRatio, 8, 1);
                sprite.position.y = 0; // Center sprite
                
                this.car.add(sprite);
                this.carLoaded = true;
                console.log('Car sprite added with proper scale');
            },
            undefined,
            (error) => {
                console.error('✗ Failed to load car sprite:', error);
                console.log('Using fallback car');
                this.createFallbackCar();
            }
        );
    }

    createFallbackCar() {
        console.log('Creating fallback car (geometric shapes)');
        this.carLoaded = true;
        
        const bodyMaterial = new THREE.MeshStandardMaterial({
            color: 0xC41E3A,
            metalness: 0.7,
            roughness: 0.2
        });

        const cabinGeometry = new THREE.BoxGeometry(1.0, 0.7, 2.0);
        const cabin = new THREE.Mesh(cabinGeometry, bodyMaterial);
        cabin.position.y = 0.4;
        cabin.castShadow = true;
        cabin.receiveShadow = true;
        this.car.add(cabin);

        const hoodGeometry = new THREE.BoxGeometry(1.0, 0.3, 0.7);
        const hood = new THREE.Mesh(hoodGeometry, bodyMaterial);
        hood.position.set(0, 0.35, 1.4);
        hood.scale.z = 0.7;
        hood.castShadow = true;
        hood.receiveShadow = true;
        this.car.add(hood);

        const trunkGeometry = new THREE.BoxGeometry(1.0, 0.4, 0.6);
        const trunk = new THREE.Mesh(trunkGeometry, bodyMaterial);
        trunk.position.set(0, 0.35, -1.4);
        trunk.castShadow = true;
        trunk.receiveShadow = true;
        this.car.add(trunk);

        const roofGeometry = new THREE.BoxGeometry(0.9, 0.4, 1.6);
        const roof = new THREE.Mesh(roofGeometry, bodyMaterial);
        roof.position.set(0, 1.1, 0.1);
        roof.castShadow = true;
        roof.receiveShadow = true;
        this.car.add(roof);

        // Wheels
        const wheelMaterial = new THREE.MeshStandardMaterial({
            color: 0x1a1a1a,
            metalness: 0.8,
            roughness: 0.3
        });

        const wheelGeometry = new THREE.CylinderGeometry(0.38, 0.38, 0.28, 32);

        const wheelPositions = [
            { x: -0.5, z: 0.7 },
            { x: 0.5, z: 0.7 },
            { x: -0.5, z: -0.7 },
            { x: 0.5, z: -0.7 }
        ];

        wheelPositions.forEach((pos) => {
            const wheelGroup = new THREE.Group();
            wheelGroup.position.set(pos.x, 0.38, pos.z);
            wheelGroup.rotation.z = Math.PI / 2;

            const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
            wheel.castShadow = true;
            wheel.receiveShadow = true;
            wheelGroup.add(wheel);

            this.car.add(wheelGroup);
            this.wheels.push(wheelGroup);
        });
        
        console.log('Fallback car created');
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

        if (this.keys['arrowup'] || this.keys['w']) {
            this.carSpeed = Math.min(this.carSpeed + acceleration, maxSpeed);
        } else if (this.keys['arrowdown'] || this.keys['s']) {
            this.carSpeed = Math.max(this.carSpeed - acceleration, -maxSpeed);
        } else {
            this.carSpeed *= friction;
        }

        if (this.keys['arrowleft'] || this.keys['a']) {
            this.carRotation += turnSpeed;
        }
        if (this.keys['arrowright'] || this.keys['d']) {
            this.carRotation -= turnSpeed;
        }

        if (this.wheels.length > 0) {
            this.wheelRotation += this.carSpeed * 0.15;
            this.wheels.forEach(wheel => {
                wheel.rotation.x = this.wheelRotation;
            });
        }

        this.carPosition.x += Math.sin(this.carRotation) * this.carSpeed;
        this.carPosition.z += Math.cos(this.carRotation) * this.carSpeed;

        this.car.position.x = this.carPosition.x;
        this.car.position.z = this.carPosition.z;
        this.car.rotation.y = this.carRotation;

        const cameraDistance = 6;
        const cameraHeight = 2;
        
        this.camera.position.x = this.carPosition.x + Math.sin(this.carRotation) * cameraDistance;
        this.camera.position.z = this.carPosition.z + Math.cos(this.carRotation) * cameraDistance;
        this.camera.position.y = cameraHeight;

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
    console.log('=== startGame() called ===');
    document.getElementById('home-screen').classList.remove('active');
    document.getElementById('game-screen').classList.add('active');
    
    if (gameInstance) {
        gameInstance.stop();
    }
    
    gameInstance = new Game('game-container');
}

document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM Content Loaded');
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
