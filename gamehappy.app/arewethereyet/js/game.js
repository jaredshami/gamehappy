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
        this.carLoaded = false;
        
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
        
        // Check if GLTFLoader is available
        if (typeof THREE.GLTFLoader !== 'undefined') {
            const loader = new THREE.GLTFLoader();
            
            // Using a realistic free car model hosted on CDN
            // This is a low-poly but detailed sedan model
            loader.load(
                'https://raw.githubusercontent.com/pmndrs/drei-assets/master/hdri/pisa.exr',
                undefined,
                undefined,
                (error) => {
                    console.log('Trying alternative model...');
                    // If that fails, try another source
                    this.loadAlternativeCarModel();
                }
            );
            
            // Alternative: directly load a simple but realistic car
            this.loadAlternativeCarModel();
        } else {
            this.createFallbackCar();
        }
        
        this.scene.add(this.car);
    }

    loadAlternativeCarModel() {
        const loader = new THREE.GLTFLoader();
        
        // Using Khronos glTF Sample Models - CesiumMilkTruck (a detailed vehicle)
        loader.load(
            'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/CesiumMilkTruck/glTF/CesiumMilkTruck.gltf',
            (gltf) => {
                const model = gltf.scene;
                model.scale.set(1.2, 1.2, 1.2);
                model.position.y = 0;
                
                model.traverse((node) => {
                    if (node.isMesh) {
                        node.castShadow = true;
                        node.receiveShadow = true;
                    }
                });
                
                this.car.add(model);
                this.carLoaded = true;
            },
            undefined,
            (error) => {
                console.error('Failed to load model, using fallback:', error);
                this.createFallbackCar();
            }
        );
    }

    createFallbackCar() {
        this.carLoaded = true;
        
        // Main car body material
        const bodyMaterial = new THREE.MeshStandardMaterial({
            color: 0xC41E3A,
            metalness: 0.7,
            roughness: 0.2
        });

        // Glass material
        const glassMaterial = new THREE.MeshStandardMaterial({
            color: 0x87CEEB,
            transparent: true,
            opacity: 0.3,
            metalness: 0.1,
            roughness: 0.1
        });

        // Create main cabin (rounded look using scaled boxes)
        const cabinGeometry = new THREE.BoxGeometry(1.0, 0.7, 2.0);
        const cabin = new THREE.Mesh(cabinGeometry, bodyMaterial);
        cabin.position.y = 0.4;
        cabin.castShadow = true;
        cabin.receiveShadow = true;
        this.car.add(cabin);

        // Hood (front, tapered)
        const hoodGeometry = new THREE.BoxGeometry(1.0, 0.3, 0.7);
        const hood = new THREE.Mesh(hoodGeometry, bodyMaterial);
        hood.position.set(0, 0.35, 1.4);
        hood.scale.z = 0.7;
        hood.castShadow = true;
        hood.receiveShadow = true;
        this.car.add(hood);

        // Trunk (rear)
        const trunkGeometry = new THREE.BoxGeometry(1.0, 0.4, 0.6);
        const trunk = new THREE.Mesh(trunkGeometry, bodyMaterial);
        trunk.position.set(0, 0.35, -1.4);
        trunk.castShadow = true;
        trunk.receiveShadow = true;
        this.car.add(trunk);

        // Roof
        const roofGeometry = new THREE.BoxGeometry(0.9, 0.4, 1.6);
        const roof = new THREE.Mesh(roofGeometry, bodyMaterial);
        roof.position.set(0, 1.1, 0.1);
        roof.castShadow = true;
        roof.receiveShadow = true;
        this.car.add(roof);

        // Windshield (angled)
        const windshieldGeometry = new THREE.PlaneGeometry(0.95, 0.5);
        const windshield = new THREE.Mesh(windshieldGeometry, glassMaterial);
        windshield.position.set(0, 0.8, 1.0);
        windshield.rotation.x = -0.25;
        windshield.castShadow = false;
        windshield.receiveShadow = true;
        this.car.add(windshield);

        // Side windows
        const sideWindowGeometry = new THREE.PlaneGeometry(0.35, 0.5);
        
        const leftWindow = new THREE.Mesh(sideWindowGeometry, glassMaterial);
        leftWindow.rotation.y = Math.PI / 2;
        leftWindow.position.set(-0.55, 0.7, 0.3);
        leftWindow.castShadow = false;
        leftWindow.receiveShadow = true;
        this.car.add(leftWindow);

        const rightWindow = new THREE.Mesh(sideWindowGeometry, glassMaterial);
        rightWindow.rotation.y = Math.PI / 2;
        rightWindow.position.set(0.55, 0.7, 0.3);
        rightWindow.castShadow = false;
        rightWindow.receiveShadow = true;
        this.car.add(rightWindow);

        // Rear window
        const rearWindowGeometry = new THREE.PlaneGeometry(0.95, 0.4);
        const rearWindow = new THREE.Mesh(rearWindowGeometry, glassMaterial);
        rearWindow.position.set(0, 0.85, -1.55);
        rearWindow.rotation.x = 0.2;
        rearWindow.castShadow = false;
        rearWindow.receiveShadow = true;
        this.car.add(rearWindow);

        // Headlights
        const headlightMaterial = new THREE.MeshStandardMaterial({
            color: 0xFFFF99,
            metalness: 0.9,
            roughness: 0.1,
            emissive: 0xFFFF00,
            emissiveIntensity: 0.4
        });

        const headlightGeometry = new THREE.CylinderGeometry(0.12, 0.12, 0.08, 16);
        
        const leftHeadlight = new THREE.Mesh(headlightGeometry, headlightMaterial);
        leftHeadlight.position.set(-0.35, 0.35, 1.8);
        leftHeadlight.rotation.z = Math.PI / 2;
        leftHeadlight.castShadow = true;
        this.car.add(leftHeadlight);

        const rightHeadlight = new THREE.Mesh(headlightGeometry, headlightMaterial);
        rightHeadlight.position.set(0.35, 0.35, 1.8);
        rightHeadlight.rotation.z = Math.PI / 2;
        rightHeadlight.castShadow = true;
        this.car.add(rightHeadlight);

        // Taillights
        const taillightMaterial = new THREE.MeshStandardMaterial({
            color: 0xFF3333,
            metalness: 0.8,
            roughness: 0.2,
            emissive: 0xFF0000,
            emissiveIntensity: 0.3
        });

        const taillightGeometry = new THREE.CylinderGeometry(0.1, 0.1, 0.08, 16);
        
        const leftTaillight = new THREE.Mesh(taillightGeometry, taillightMaterial);
        leftTaillight.position.set(-0.35, 0.35, -1.8);
        leftTaillight.rotation.z = Math.PI / 2;
        leftTaillight.castShadow = true;
        this.car.add(leftTaillight);

        const rightTaillight = new THREE.Mesh(taillightGeometry, taillightMaterial);
        rightTaillight.position.set(0.35, 0.35, -1.8);
        rightTaillight.rotation.z = Math.PI / 2;
        rightTaillight.castShadow = true;
        this.car.add(rightTaillight);

        // Bumpers
        const bumperMaterial = new THREE.MeshStandardMaterial({
            color: 0x111111,
            metalness: 0.6,
            roughness: 0.3
        });

        const frontBumperGeometry = new THREE.BoxGeometry(1.15, 0.12, 0.15);
        const frontBumper = new THREE.Mesh(frontBumperGeometry, bumperMaterial);
        frontBumper.position.set(0, 0.2, 1.95);
        frontBumper.castShadow = true;
        frontBumper.receiveShadow = true;
        this.car.add(frontBumper);

        const rearBumperGeometry = new THREE.BoxGeometry(1.15, 0.12, 0.15);
        const rearBumper = new THREE.Mesh(rearBumperGeometry, bumperMaterial);
        rearBumper.position.set(0, 0.2, -2.0);
        rearBumper.castShadow = true;
        rearBumper.receiveShadow = true;
        this.car.add(rearBumper);

        // Wheels
        const wheelMaterial = new THREE.MeshStandardMaterial({
            color: 0x1a1a1a,
            metalness: 0.8,
            roughness: 0.3
        });

        const rimMaterial = new THREE.MeshStandardMaterial({
            color: 0xb0b0b0,
            metalness: 0.95,
            roughness: 0.15
        });

        const wheelGeometry = new THREE.CylinderGeometry(0.38, 0.38, 0.28, 32);
        const rimGeometry = new THREE.CylinderGeometry(0.25, 0.25, 0.3, 32);
        const tireGeometry = new THREE.TorusGeometry(0.38, 0.08, 16, 32);

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

            const rim = new THREE.Mesh(rimGeometry, rimMaterial);
            rim.position.z = 0.02;
            rim.castShadow = true;
            rim.receiveShadow = true;
            wheelGroup.add(rim);

            this.car.add(wheelGroup);
            this.wheels.push(wheelGroup);
        });
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
    document.getElementById('home-screen').classList.remove('active');
    document.getElementById('game-screen').classList.add('active');
    
    if (gameInstance) {
        gameInstance.stop();
    }
    
    gameInstance = new Game('game-container');
}

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
