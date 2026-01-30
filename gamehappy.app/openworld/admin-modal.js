// Admin Dashboard - Modal-based Forms with Clickable Lists
const API_URL = '/openworld/api/admin.php';

// Navigation state
let navState = {
    world_id: null,
    world_name: null,
    place_id: null,
    place_name: null,
    object_id: null,
    object_name: null
};

// Data cache
let worlds = [];
let places = [];
let objects = [];
let currentObjectMechanics = [];

// ===== MODAL FUNCTIONS =====
function openWorldModal() {
    document.getElementById('modal-create-world').style.display = 'flex';
}

function openPlaceModal() {
    if (!navState.world_id) {
        alert('Select a world first');
        return;
    }
    document.getElementById('modal-create-place').style.display = 'flex';
}

function openObjectModal() {
    if (!navState.place_id) {
        alert('Select a place first');
        return;
    }
    document.getElementById('modal-create-object').style.display = 'flex';
}

function openMechanicModal() {
    if (!navState.object_id) {
        alert('Select an object first');
        return;
    }
    document.getElementById('modal-create-mechanic').style.display = 'flex';
}

function closeModal(modalId) {
    document.getElementById(modalId).style.display = 'none';
    // Reset forms
    const modal = document.getElementById(modalId);
    const form = modal.querySelector('form');
    if (form) form.reset();
    // Clear messages
    const messages = modal.querySelectorAll('.message');
    messages.forEach(m => m.textContent = '');
}

// Close modal on background click
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal')) {
        e.target.style.display = 'none';
    }
});

// ===== AUTHENTICATION =====
window.addEventListener('load', () => {
    checkAuth();
});

async function checkAuth() {
    try {
        const response = await fetch('/openworld/api/auth.php?action=checkAuth');
        const data = await response.json();
        
        if (data.authenticated) {
            document.getElementById('login-screen').classList.remove('visible');
            document.getElementById('dashboard').style.display = 'block';
            loadWorlds();
        } else {
            document.getElementById('login-screen').classList.add('visible');
            document.getElementById('dashboard').style.display = 'none';
        }
    } catch (error) {
        console.error('Auth check failed:', error);
        document.getElementById('login-screen').classList.add('visible');
    }
}

async function performLogin() {
    const username = document.getElementById('login-username').value;
    const password = document.getElementById('login-password').value;

    try {
        const response = await fetch('/openworld/api/auth.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'login',
                username: username,
                password: password
            })
        });

        const data = await response.json();
        if (data.success) {
            document.getElementById('login-screen').classList.remove('visible');
            document.getElementById('dashboard').style.display = 'block';
            loadWorlds();
        } else {
            alert('Login failed: ' + data.message);
        }
    } catch (error) {
        alert('Login error: ' + error.message);
    }
}

function logout() {
    fetch('/openworld/api/auth.php?action=logout').then(() => {
        document.getElementById('login-screen').classList.add('visible');
        document.getElementById('dashboard').style.display = 'none';
    });
}

// ===== NAVIGATION FUNCTIONS =====
function navigateToWorlds() {
    navState = { world_id: null, world_name: null, place_id: null, place_name: null, object_id: null, object_name: null };
    updateBreadcrumb();
    showView('view-worlds');
    loadWorlds();
}

function navigateToPlaces(worldId, worldName) {
    navState.world_id = worldId;
    navState.world_name = worldName;
    navState.place_id = null;
    navState.place_name = null;
    navState.object_id = null;
    navState.object_name = null;
    updateBreadcrumb();
    showView('view-places');
    loadPlacesForWorld(worldId);
}

function navigateToObjects(placeId, placeName) {
    navState.place_id = placeId;
    navState.place_name = placeName;
    navState.object_id = null;
    navState.object_name = null;
    updateBreadcrumb();
    showView('view-objects');
    loadObjectsForPlace(placeId);
}

function navigateToObjectDetails(objectId, objectName) {
    navState.object_id = objectId;
    navState.object_name = objectName;
    updateBreadcrumb();
    showView('view-object-details');
    loadObjectDetails(objectId);
}

function showView(viewId) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(viewId).classList.add('active');
}

function updateBreadcrumb() {
    const breadcrumb = document.getElementById('breadcrumb');
    let html = '<a href="#" onclick="navigateToWorlds(); return false;" class="breadcrumb-item">Worlds</a>';
    
    if (navState.world_id) {
        html += ` / <a href="#" onclick="navigateToPlaces(${navState.world_id}, '${escapeHtml(navState.world_name)}'); return false;" class="breadcrumb-item">${escapeHtml(navState.world_name)}</a>`;
    }
    
    if (navState.place_id) {
        html += ` / <a href="#" onclick="navigateToObjects(${navState.place_id}, '${escapeHtml(navState.place_name)}'); return false;" class="breadcrumb-item">${escapeHtml(navState.place_name)}</a>`;
    }
    
    if (navState.object_id) {
        html += ` / <span class="breadcrumb-item active">${escapeHtml(navState.object_name)}</span>`;
    }
    
    breadcrumb.innerHTML = html;
}

// ===== WORLDS =====
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
        }
    } catch (error) {
        showMessage('Error loading worlds', 'error', 'world-message');
    }
}

async function createWorld(e) {
    e.preventDefault();
    const name = document.getElementById('world-name').value;
    const description = document.getElementById('world-desc').value;

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'create_world',
                name: name,
                description: description
            })
        });

        const data = await response.json();
        if (data.success) {
            showMessage('World created!', 'success', 'world-message');
            setTimeout(() => {
                closeModal('modal-create-world');
                loadWorlds();
            }, 800);
        } else {
            showMessage('Error: ' + data.message, 'error', 'world-message');
        }
    } catch (error) {
        showMessage('Error creating world', 'error', 'world-message');
    }
}

function renderWorldsList() {
    const container = document.getElementById('worlds-list');
    if (worlds.length === 0) {
        container.innerHTML = '<p class="empty-state">No worlds yet. Click + Add World to create one!</p>';
        return;
    }

    container.innerHTML = worlds.map(world => `
        <div class="list-item clickable" onclick="navigateToPlaces(${world.id}, '${escapeHtml(world.name).replace(/'/g, "\\'")}')" title="Click to view places">
            <div class="list-item-content">
                <div class="list-item-title">${escapeHtml(world.name)}</div>
                <div class="list-item-desc">${escapeHtml(world.description || '(no description)')}</div>
            </div>
        </div>
    `).join('');
}

// ===== PLACES =====
async function loadPlacesForWorld(worldId) {
    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'get_places',
                world_id: worldId
            })
        });

        const data = await response.json();
        if (data.success) {
            places = data.places;
            loadExitDestinations();
            renderPlacesList();
        }
    } catch (error) {
        showMessage('Error loading places', 'error', 'place-message');
    }
}

async function createPlace(e) {
    e.preventDefault();
    if (!navState.world_id) {
        showMessage('Select a world first', 'error', 'place-message');
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
                world_id: navState.world_id,
                name: name,
                description: description
            })
        });

        const data = await response.json();
        if (data.success) {
            showMessage('Place created!', 'success', 'place-message');
            setTimeout(() => {
                closeModal('modal-create-place');
                loadPlacesForWorld(navState.world_id);
            }, 800);
        } else {
            showMessage('Error: ' + data.message, 'error', 'place-message');
        }
    } catch (error) {
        showMessage('Error creating place', 'error', 'place-message');
    }
}

async function loadExitDestinations() {
    const select = document.getElementById('exit-destination');
    select.innerHTML = '<option value="">-- Select Destination --</option>' + 
        places.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');
}

async function linkPlaces(e) {
    e.preventDefault();
    if (!navState.place_id) {
        showMessage('Select a place first', 'error', 'exit-message');
        return;
    }

    const direction = document.getElementById('exit-direction').value;
    const destination = document.getElementById('exit-destination').value;

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'link_places',
                from_place_id: navState.place_id,
                to_place_id: destination,
                direction: direction
            })
        });

        const data = await response.json();
        if (data.success) {
            showMessage('Link created!', 'success', 'exit-message');
            document.getElementById('exit-form').reset();
            loadPlacesForWorld(navState.world_id);
        } else {
            showMessage('Error: ' + data.message, 'error', 'exit-message');
        }
    } catch (error) {
        showMessage('Error creating link', 'error', 'exit-message');
    }
}

function renderPlacesList() {
    const container = document.getElementById('places-list');
    if (places.length === 0) {
        container.innerHTML = '<p class="empty-state">No places yet. Click + Add Place to create one!</p>';
        return;
    }

    container.innerHTML = places.map(place => `
        <div class="list-item clickable" onclick="navigateToObjects(${place.id}, '${escapeHtml(place.name).replace(/'/g, "\\'")}')" title="Click to view objects">
            <div class="list-item-content">
                <div class="list-item-title">${escapeHtml(place.name)}</div>
                <div class="list-item-desc">${escapeHtml(place.description || '(no description)')}</div>
            </div>
        </div>
    `).join('');
}

// ===== OBJECTS =====
async function loadObjectsForPlace(placeId) {
    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'get_objects',
                place_id: placeId
            })
        });

        const data = await response.json();
        if (data.success) {
            objects = data.objects;
            renderObjectsList();
        }
    } catch (error) {
        showMessage('Error loading objects', 'error', 'object-message');
    }
}

async function createObject(e) {
    e.preventDefault();
    if (!navState.place_id) {
        showMessage('Select a place first', 'error', 'object-message');
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
                place_id: navState.place_id,
                name: name,
                description: description
            })
        });

        const data = await response.json();
        if (data.success) {
            showMessage('Object created!', 'success', 'object-message');
            setTimeout(() => {
                closeModal('modal-create-object');
                loadObjectsForPlace(navState.place_id);
            }, 800);
        } else {
            showMessage('Error: ' + data.message, 'error', 'object-message');
        }
    } catch (error) {
        showMessage('Error creating object', 'error', 'object-message');
    }
}

function renderObjectsList() {
    const container = document.getElementById('objects-list');
    if (objects.length === 0) {
        container.innerHTML = '<p class="empty-state">No objects yet. Click + Add Object to create one!</p>';
        return;
    }

    container.innerHTML = objects.map(obj => `
        <div class="list-item clickable" onclick="navigateToObjectDetails(${obj.id}, '${escapeHtml(obj.name).replace(/'/g, "\\'")}')" title="Click to view mechanics">
            <div class="list-item-content">
                <div class="list-item-title">${escapeHtml(obj.name)}</div>
                <div class="list-item-desc">${escapeHtml(obj.description || '(no description)')}</div>
            </div>
        </div>
    `).join('');
}

// ===== OBJECT DETAILS =====
async function loadObjectDetails(objectId) {
    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'get_object_mechanics',
                object_id: objectId
            })
        });

        const data = await response.json();
        if (data.success) {
            renderObjectDetails(data.object, data.mechanics);
        }
    } catch (error) {
        showMessage('Error loading object details', 'error', 'mechanic-message');
    }
}

function renderObjectDetails(object, mechanics) {
    currentObjectMechanics = mechanics;
    document.getElementById('object-title').textContent = object.name;
    
    const detailsDiv = document.getElementById('object-details-content');
    detailsDiv.innerHTML = `
        <div style="margin-bottom: 20px;">
            <div style="color: #64b5f6; font-weight: bold; margin-bottom: 8px;">${escapeHtml(object.name)}</div>
            <div style="color: #b0bec5;">${escapeHtml(object.description || '(no description)')}</div>
        </div>
    `;

    const mechanicsList = document.getElementById('mechanics-list');
    if (mechanics.length === 0) {
        mechanicsList.innerHTML = '<p class="empty-state">No mechanics yet. Click + Add Mechanic above!</p>';
    } else {
        mechanicsList.innerHTML = mechanics.map(m => `
            <div class="list-item">
                <div class="list-item-content">
                    <div class="list-item-title">${escapeHtml(m.name)}</div>
                    <div style="color: #ffd700; font-size: 12px; margin-bottom: 5px;">Type: ${m.type}</div>
                    <div class="list-item-desc">${escapeHtml(m.description || '(no description)')}</div>
                    ${m.action_value ? `<div style="color: #81c784; font-size: 11px; margin-top: 8px; font-family: monospace; background: #0f1419; padding: 8px; border-radius: 3px; word-break: break-all;">Config: ${escapeHtml(typeof m.action_value === 'string' ? m.action_value : JSON.stringify(m.action_value))}</div>` : ''}
                </div>
                <button class="btn-secondary" onclick="deleteMechanic(${m.id})" style="background: #b71c1c; border-color: #ff5252; color: #ff5252;">Delete</button>
            </div>
        `).join('');
    }
}

// ===== MECHANICS =====
function showMechanicSettings() {
    const type = document.getElementById('mechanic-type').value;
    const settingsContainer = document.getElementById('mechanic-settings');
    
    if (!type) {
        settingsContainer.style.display = 'none';
        return;
    }
    
    document.querySelectorAll('[id^="mechanic-"][id$="-settings"]').forEach(el => {
        el.style.display = 'none';
    });
    
    const typeSettingsId = `mechanic-${type}-settings`;
    const typeSettingsEl = document.getElementById(typeSettingsId);
    if (typeSettingsEl) {
        typeSettingsEl.style.display = 'block';
        settingsContainer.style.display = 'block';
    } else {
        settingsContainer.style.display = 'none';
    }
}

async function addMechanic(e) {
    e.preventDefault();
    if (!navState.object_id) {
        showMessage('Select an object first', 'error', 'mechanic-message');
        return;
    }

    const type = document.getElementById('mechanic-type').value;
    const name = document.getElementById('mechanic-name').value;
    const description = document.getElementById('mechanic-desc').value;

    let actionValue = {};

    switch(type) {
        case 'open':
            actionValue = { state: document.getElementById('mechanic-open-state')?.value || 'open' };
            break;
        case 'examine':
            actionValue = { description: document.getElementById('mechanic-examine-desc')?.value || '' };
            break;
        case 'take':
            actionValue = { item: document.getElementById('mechanic-item-name')?.value || 'item' };
            break;
        case 'use':
            actionValue = { effect: document.getElementById('mechanic-use-effect')?.value || '' };
            break;
        case 'purchase':
            const priceInput = document.getElementById('mechanic-purchase-price');
            actionValue = { gold_price: parseInt(priceInput?.value || '0') || 0 };
            break;
        case 'teleport':
            actionValue = { destination: document.getElementById('mechanic-teleport-dest')?.value || '' };
            break;
        case 'create_area':
            actionValue = { area_name: document.getElementById('mechanic-create_area-name')?.value || 'New Area' };
            break;
        case 'trigger':
            actionValue = { event_name: document.getElementById('mechanic-trigger-event')?.value || 'trigger' };
            break;
        default:
            actionValue = {};
    }

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'add_mechanic',
                object_id: navState.object_id,
                type: type,
                name: name,
                description: description,
                action_value: JSON.stringify(actionValue)
            })
        });

        const data = await response.json();
        if (data.success) {
            showMessage('Mechanic added!', 'success', 'mechanic-message');
            setTimeout(() => {
                closeModal('modal-create-mechanic');
                loadObjectDetails(navState.object_id);
            }, 800);
        } else {
            showMessage('Error: ' + data.message, 'error', 'mechanic-message');
        }
    } catch (error) {
        showMessage('Error adding mechanic', 'error', 'mechanic-message');
    }
}

async function deleteMechanic(mechanicId) {
    if (!confirm('Delete this mechanic?')) return;
    
    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'delete_mechanic',
                mechanic_id: mechanicId
            })
        });

        const data = await response.json();
        if (data.success) {
            showMessage('Mechanic deleted', 'success', 'mechanic-message');
            loadObjectDetails(navState.object_id);
        } else {
            showMessage('Error: ' + data.message, 'error', 'mechanic-message');
        }
    } catch (error) {
        showMessage('Error deleting mechanic', 'error', 'mechanic-message');
    }
}

// ===== UTILITIES =====
function showMessage(message, type, elementId) {
    const el = document.getElementById(elementId);
    if (el) {
        el.textContent = message;
        el.className = `message ${type}`;
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
