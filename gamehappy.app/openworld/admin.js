// Configuration
const API_URL = '/openworld/api/admin.php';
const AUTH_API_URL = '/openworld/api/auth.php';

// State
let currentWorld = null;
let currentPlace = null;
let worlds = [];
let places = [];
let objects = [];
let loggedIn = false;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
});

function checkAuth() {
    fetch(`${AUTH_API_URL}?action=check`)
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                loggedIn = true;
                document.getElementById('login-screen').classList.remove('visible');
                document.getElementById('dashboard').classList.add('visible');
                loadWorlds();
            } else {
                showLoginScreen();
            }
        })
        .catch(err => {
            console.error('Auth check failed:', err);
            showLoginScreen();
        });
}

function showLoginScreen() {
    loggedIn = false;
    document.getElementById('login-screen').classList.add('visible');
    document.getElementById('dashboard').classList.remove('visible');
}

function performLogin() {
    const username = document.getElementById('login-username').value;
    const password = document.getElementById('login-password').value;
    
    fetch(`${AUTH_API_URL}?action=login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            checkAuth();
            document.getElementById('login-username').value = '';
            document.getElementById('login-password').value = '';
        } else {
            alert('Login failed: ' + data.message);
        }
    })
    .catch(err => {
        console.error('Login error:', err);
        alert('Login error: ' + err.message);
    });
}

function logout() {
    fetch(`${AUTH_API_URL}?action=logout`)
        .then(() => {
            loggedIn = false;
            showLoginScreen();
        });
}

// TAB SWITCHING
function switchTab(tabName) {
    // Hide all tabs
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });

    // Deactivate all buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });

    // Show selected tab
    document.getElementById(tabName).classList.add('active');

    // Activate button
    event.target.classList.add('active');

    // Load data for tab
    if (tabName === 'worlds') {
        loadWorlds();
    } else if (tabName === 'places') {
        loadWorldsForPlaces();
    }
}

// WORLD MANAGEMENT
async function loadWorlds() {
    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'get_worlds' })
        });

        const data = await response.json();
        if (data.success) {
            worlds = data.worlds;
            renderWorldsList();
            loadWorldsForPlaces();
        } else {
            showMessage('Error loading worlds', 'error');
        }
    } catch (error) {
        showMessage('Connection error: ' + error.message, 'error');
    }
}

async function createWorld(e) {
    e.preventDefault();

    const name = document.getElementById('world-name').value;
    const description = document.getElementById('world-desc').value;
    const isPublic = document.getElementById('world-public').checked;

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'create_world',
                name: name,
                description: description,
                is_public: isPublic ? 1 : 0
            })
        });

        const data = await response.json();
        if (data.success) {
            showMessage('World created successfully!', 'success');
            document.getElementById('world-form').reset();
            loadWorlds();
        } else {
            showMessage('Error: ' + data.message, 'error');
        }
    } catch (error) {
        showMessage('Error creating world: ' + error.message, 'error');
    }
}

function renderWorldsList() {
    const container = document.getElementById('worlds-list');
    
    if (worlds.length === 0) {
        container.innerHTML = '<div class="empty-state">No worlds created yet</div>';
        return;
    }

    container.innerHTML = worlds.map(world => `
        <div class="list-item">
            <div class="list-item-content">
                <div class="list-item-title">${escapeHtml(world.name)}</div>
                <div class="list-item-desc">${escapeHtml(world.description || '(no description)')}</div>
                <div class="list-item-meta">
                    ${world.place_count} places | Created: ${new Date(world.created_at).toLocaleDateString()}
                    ${world.is_public ? '| PUBLIC' : '| PRIVATE'}
                </div>
            </div>
        </div>
    `).join('');
}

// PLACE MANAGEMENT
async function loadWorldsForPlaces() {
    const select = document.getElementById('place-world-select');
    if (!select) return;

    select.innerHTML = '<option value="">-- Select World --</option>' + 
        worlds.map(w => `<option value="${w.id}">${escapeHtml(w.name)}</option>`).join('');
}

async function loadWorldPlaces() {
    currentWorld = document.getElementById('place-world-select').value;
    
    if (!currentWorld) {
        document.getElementById('place-form-panel').style.display = 'none';
        document.getElementById('link-form-panel').style.display = 'none';
        document.getElementById('places-list').innerHTML = '';
        return;
    }

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'get_places',
                world_id: currentWorld
            })
        });

        const data = await response.json();
        if (data.success) {
            places = data.places;
            document.getElementById('place-form-panel').style.display = 'block';
            document.getElementById('link-form-panel').style.display = 'block';
            renderPlacesList();
            populatePlaceSelects();
        } else {
            showMessage('Error loading places', 'error');
        }
    } catch (error) {
        showMessage('Error loading places: ' + error.message, 'error');
    }
}

async function createPlace(e) {
    e.preventDefault();

    if (!currentWorld) {
        showMessage('Please select a world first', 'error');
        return;
    }

    const name = document.getElementById('place-name').value;
    const description = document.getElementById('place-desc').value;

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'create_place',
                world_id: currentWorld,
                name: name,
                description: description
            })
        });

        const data = await response.json();
        if (data.success) {
            showMessage('Place created successfully!', 'success');
            document.getElementById('place-form').reset();
            loadWorldPlaces();
        } else {
            showMessage('Error: ' + data.message, 'error');
        }
    } catch (error) {
        showMessage('Error creating place: ' + error.message, 'error');
    }
}

async function linkPlaces(e) {
    e.preventDefault();

    const fromId = document.getElementById('link-from').value;
    const direction = document.getElementById('link-direction').value;
    const toId = document.getElementById('link-to').value;

    if (!fromId || !direction || !toId) {
        showMessage('Please fill in all fields', 'error');
        return;
    }

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'link_places',
                from_place_id: fromId,
                to_place_id: toId,
                direction: direction
            })
        });

        const data = await response.json();
        if (data.success) {
            showMessage('Places linked successfully!', 'success');
            document.getElementById('link-form').reset();
            loadWorldPlaces();
        } else {
            showMessage('Error: ' + data.message, 'error');
        }
    } catch (error) {
        showMessage('Error linking places: ' + error.message, 'error');
    }
}

function renderPlacesList() {
    const container = document.getElementById('places-list');
    
    if (places.length === 0) {
        container.innerHTML = '<div class="empty-state">No places in this world</div>';
        return;
    }

    container.innerHTML = places.map(place => `
        <div class="list-item">
            <div class="list-item-content">
                <div class="list-item-title">${escapeHtml(place.name)}</div>
                <div class="list-item-desc">${escapeHtml(place.description || '(no description)')}</div>
                <div class="list-item-meta">
                    Created: ${new Date(place.created_at).toLocaleDateString()}
                </div>
            </div>
            <div class="list-item-actions">
                <button class="btn-secondary" onclick="editPlace(${place.id})">Edit</button>
            </div>
        </div>
    `).join('');

    // Load objects when places are updated
    loadPlaceObjectsForSelect();
}

function populatePlaceSelects() {
    const fromSelect = document.getElementById('link-from');
    const toSelect = document.getElementById('link-to');
    
    if (!fromSelect || !toSelect) return;

    const options = '<option value="">-- Select Place --</option>' + 
        places.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');
    
    fromSelect.innerHTML = options;
    toSelect.innerHTML = options;
}

// OBJECT MANAGEMENT
async function loadPlaceObjectsForSelect() {
    const select = document.getElementById('object-place-select');
    if (!select || !currentWorld) return;

    select.innerHTML = '<option value="">-- Select Place --</option>' + 
        places.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');
}

async function loadPlaceObjects() {
    currentPlace = document.getElementById('object-place-select').value;
    
    if (!currentPlace) {
        document.getElementById('object-form-panel').style.display = 'none';
        document.getElementById('objects-list').innerHTML = '';
        return;
    }

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'get_objects',
                place_id: currentPlace
            })
        });

        const data = await response.json();
        if (data.success) {
            objects = data.objects;
            document.getElementById('object-form-panel').style.display = 'block';
            renderObjectsList();
        } else {
            showMessage('Error loading objects', 'error');
        }
    } catch (error) {
        showMessage('Error loading objects: ' + error.message, 'error');
    }
}

async function createObject(e) {
    e.preventDefault();

    if (!currentPlace) {
        showMessage('Please select a place first', 'error');
        return;
    }

    const name = document.getElementById('object-name').value;
    const description = document.getElementById('object-desc').value;

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'create_object',
                place_id: currentPlace,
                name: name,
                description: description
            })
        });

        const data = await response.json();
        if (data.success) {
            showMessage('Object created successfully!', 'success');
            document.getElementById('object-form').reset();
            loadPlaceObjects();
        } else {
            showMessage('Error: ' + data.message, 'error');
        }
    } catch (error) {
        showMessage('Error creating object: ' + error.message, 'error');
    }
}

function renderObjectsList() {
    const container = document.getElementById('objects-list');
    
    if (objects.length === 0) {
        container.innerHTML = '<div class="empty-state">No objects in this place</div>';
        return;
    }

    container.innerHTML = objects.map(obj => `
        <div class="list-item">
            <div class="list-item-content">
                <div class="list-item-title">${escapeHtml(obj.name)}</div>
                <div class="list-item-desc">${escapeHtml(obj.description || '(no description)')}</div>
                <div class="list-item-meta">
                    Created: ${new Date(obj.created_at).toLocaleDateString()}
                </div>
            </div>
            <div class="list-item-actions">
                <button class="btn-secondary" onclick="openMechanicsModal(${obj.id})">Add Mechanic</button>
                <button class="btn-secondary" onclick="editObject(${obj.id})">Edit</button>
            </div>
        </div>
    `).join('');
}

// MECHANICS MODAL
function openMechanicsModal(objectId) {
    document.getElementById('mechanic-object-id').value = objectId;
    document.getElementById('mechanic-form').reset();
    document.getElementById('mechanic-settings').innerHTML = '';
    document.getElementById('mechanics-modal').style.display = 'flex';
}

function closeMechanicsModal() {
    document.getElementById('mechanics-modal').style.display = 'none';
}

function showMechanicSettings() {
    const type = document.getElementById('mechanic-type').value;
    const settingsContainer = document.getElementById('mechanic-settings');
    let settings = '';

    switch(type) {
        case 'open':
            settings = `
                <div class="mechanic-setting">
                    <label>Opens to:</label>
                    <input type="text" id="mechanic-open-state" placeholder="e.g., open, unlocked">
                </div>
            `;
            break;
        case 'take':
            settings = `
                <div class="mechanic-setting">
                    <label>Item name:</label>
                    <input type="text" id="mechanic-item-name" placeholder="What the player takes">
                </div>
            `;
            break;
        case 'teleport':
            settings = `
                <div class="mechanic-setting">
                    <label>Destination place:</label>
                    <select id="mechanic-teleport-place">
                        ${places.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('')}
                    </select>
                </div>
            `;
            break;
        case 'trigger':
            settings = `
                <div class="mechanic-setting">
                    <label>Trigger message:</label>
                    <input type="text" id="mechanic-trigger-msg" placeholder="What happens">
                </div>
            `;
            break;
    }

    settingsContainer.innerHTML = settings;
}

async function addMechanic(e) {
    e.preventDefault();

    const objectId = document.getElementById('mechanic-object-id').value;
    const type = document.getElementById('mechanic-type').value;
    const name = document.getElementById('mechanic-name').value;
    const description = document.getElementById('mechanic-desc').value;

    let actionValue = {};

    switch(type) {
        case 'open':
            actionValue = { state: document.getElementById('mechanic-open-state').value || 'open' };
            break;
        case 'take':
            actionValue = { item: document.getElementById('mechanic-item-name').value || 'item' };
            break;
        case 'teleport':
            actionValue = { destination: document.getElementById('mechanic-teleport-place').value };
            break;
        case 'trigger':
            actionValue = { message: document.getElementById('mechanic-trigger-msg').value || 'Something happens' };
            break;
    }

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'add_mechanic',
                object_id: objectId,
                type: type,
                name: name,
                description: description,
                action_value: JSON.stringify(actionValue)
            })
        });

        const data = await response.json();
        if (data.success) {
            showMessage('Mechanic added successfully!', 'success');
            closeMechanicsModal();
            loadPlaceObjects();
        } else {
            showMessage('Error: ' + data.message, 'error');
        }
    } catch (error) {
        showMessage('Error adding mechanic: ' + error.message, 'error');
    }
}

// UTILITY FUNCTIONS
function showMessage(message, type) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type}`;
    messageDiv.textContent = message;
    
    const container = document.querySelector('.container');
    container.insertBefore(messageDiv, container.firstChild);
    
    setTimeout(() => messageDiv.remove(), 5000);
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function editPlace(placeId) {
    // TODO: Implement edit place modal
    showMessage('Edit place feature coming soon', 'info');
}

function editObject(objectId) {
    // TODO: Implement edit object modal
    showMessage('Edit object feature coming soon', 'info');
}

// Close modal when clicking outside
window.addEventListener('click', (e) => {
    const modal = document.getElementById('mechanics-modal');
    if (e.target === modal) {
        closeMechanicsModal();
    }
});
