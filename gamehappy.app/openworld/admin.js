// Admin Dashboard - Hierarchical Navigation
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
let currentPlaceExits = [];

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
            document.getElementById('world-form').reset();
            loadWorlds();
            closeModal('modal-create-world');
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
        container.innerHTML = '<p class="empty-state">No worlds yet. Create one to get started!</p>';
        return;
    }

    container.innerHTML = worlds.map(world => `
        <div class="list-item clickable" onclick="navigateToPlaces(${world.id}, '${escapeHtml(world.name).replace(/'/g, "\\'")}')" style="cursor: pointer;">
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
            document.getElementById('place-form').reset();
            loadPlacesForWorld(navState.world_id);
            closeModal('modal-create-place');
        } else {
            showMessage('Error: ' + data.message, 'error', 'place-message');
        }
    } catch (error) {
        showMessage('Error creating place', 'error', 'place-message');
    }
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
            showMessage('Exit added!', 'success', 'exit-message');
            document.getElementById('exit-form').reset();
            loadExitsForPlace(navState.place_id);
        } else {
            showMessage('Error: ' + data.message, 'error', 'exit-message');
        }
    } catch (error) {
        showMessage('Error creating exit', 'error', 'exit-message');
    }
}

function renderPlacesList() {
    const container = document.getElementById('places-list');
    if (places.length === 0) {
        container.innerHTML = '<p class="empty-state">No places yet. Create one to get started!</p>';
        return;
    }

    container.innerHTML = places.map(place => `
        <div class="list-item">
            <div class="list-item-content" onclick="navigateToObjects(${place.id}, '${escapeHtml(place.name).replace(/'/g, "\\'")}')" style="cursor: pointer; flex: 1;">
                <div class="list-item-title">${escapeHtml(place.name)}</div>
                <div class="list-item-desc">${escapeHtml(place.description || '(no description)')}</div>
            </div>
            <button class="btn-secondary" onclick="openManageExitsModal(${place.id}, '${escapeHtml(place.name).replace(/'/g, "\\'")}')" style="white-space: nowrap;">
                Manage Exits
            </button>
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
            document.getElementById('object-form').reset();
            loadObjectsForPlace(navState.place_id);
            closeModal('modal-create-object');
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
        container.innerHTML = '<p class="empty-state">No objects yet. Create one to get started!</p>';
        return;
    }

    container.innerHTML = objects.map(obj => `
        <div class="list-item clickable" onclick="navigateToObjectDetails(${obj.id}, '${escapeHtml(obj.name).replace(/'/g, "\\'")}')" style="cursor: pointer;">
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
    
    const detailsDiv = document.getElementById('object-details-content');
    detailsDiv.innerHTML = `
        <div style="margin-bottom: 20px;">
            <div style="color: #64b5f6; font-weight: bold; margin-bottom: 8px;">${escapeHtml(object.name)}</div>
            <div style="color: #b0bec5;">${escapeHtml(object.description || '(no description)')}</div>
        </div>
    `;

    const mechanicsList = document.getElementById('mechanics-list');
    if (mechanics.length === 0) {
        mechanicsList.innerHTML = '<p class="empty-state">No mechanics yet. Add one above!</p>';
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
            document.getElementById('mechanic-form').reset();
            loadObjectDetails(navState.object_id);
            closeModal('modal-add-mechanic');
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

// ===== EXIT MANAGEMENT =====
async function openManageExitsModal(placeId, placeName) {
    navState.place_id = placeId;
    navState.place_name = placeName;
    document.getElementById('exits-place-name').textContent = placeName;
    showExitsView();
    await loadExitsForPlace(placeId);
    openModal('modal-manage-exits');
}

function showExitsView() {
    document.getElementById('exits-view').style.display = 'block';
    document.getElementById('select-destination-overlay').style.display = 'none';
    document.getElementById('exit-message').textContent = '';
}

function showDestinationView(direction) {
    document.getElementById('select-destination-overlay').style.display = 'block';
    document.getElementById('selected-direction-name').textContent = direction.charAt(0).toUpperCase() + direction.slice(1);
    renderDestinationList(direction);
}

function closeDestinationSelector() {
    showExitsView();
}

async function navigateExitsMap(placeId) {
    // Navigate to a different place within the exits modal
    navState.place_id = placeId;
    // Find place name from the places array
    const place = places.find(p => p.id === placeId);
    if (place) {
        navState.place_name = place.name;
    }
    document.getElementById('exits-place-name').textContent = navState.place_name;
    await loadExitsForPlace(placeId);
    showExitsView();
}

async function loadExitsForPlace(placeId) {
    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'get_exits',
                place_id: placeId
            })
        });

        const data = await response.json();
        if (data.success) {
            renderDirectionButtons(data.exits);
        } else {
            renderDirectionButtons([]);
        }
    } catch (error) {
        console.error('Error loading exits:', error);
        renderDirectionButtons([]);
    }
}

function renderDirectionButtons(existingExits) {
    // Store exits globally for use in destination list filtering
    currentPlaceExits = existingExits;
    
    const directions = ['north', 'south', 'east', 'west', 'northeast', 'northwest', 'southeast', 'southwest'];
    const existingDirections = new Set(existingExits.map(e => e.direction.toLowerCase()));
    
    const container = document.getElementById('direction-buttons');
    container.setAttribute('data-place-name', navState.place_name);
    
    const directionIcons = {
        'north': '↑',
        'south': '↓',
        'east': '→',
        'west': '←',
        'northeast': '↗',
        'northwest': '↖',
        'southeast': '↘',
        'southwest': '↙'
    };
    
    const connectionTypeLabels = {
        'full': 'Full',
        'passage': 'Passage',
        'closed': 'Closed',
        'locked': 'Locked',
        'no_throughway': 'No Path'
    };
    
    const connectionTypeColors = {
        'full': '#00ff00',
        'passage': '#00ccff',
        'closed': '#ffaa00',
        'locked': '#ff4444',
        'no_throughway': '#888888'
    };
    
    container.innerHTML = directions.map(dir => {
        const exists = existingDirections.has(dir);
        const exit = existingExits.find(e => e.direction.toLowerCase() === dir);
        const icon = directionIcons[dir];
        const connType = exit?.connection_type || 'full';
        
        if (exists) {
            return `
                <div class="direction-button ${dir} has-exit" onclick="navigateExitsMap(${exit.to_place_id})" style="cursor: pointer; position: relative;">
                    <div class="exit-content">
                        <div class="exit-destination">${escapeHtml(exit.destination_name || 'Unknown')}</div>
                        <button type="button" class="btn-remove" onclick="deleteExit(${exit.id}); event.stopPropagation();">Remove</button>
                    </div>
                    <div class="connection-type-badge connection-badge-${dir}" 
                         style="background-color: ${connectionTypeColors[connType]}"
                         title="${connectionTypeLabels[connType]}"
                         onclick="showConnectionTypeModal(${exit.id}, '${connType}'); event.stopPropagation();">
                        ${connectionTypeLabels[connType].charAt(0)}
                    </div>
                </div>
            `;
        } else {
            return `
                <div class="direction-button ${dir}">
                    <button type="button" class="btn-add" onclick="showDestinationView('${dir}')">
                        ${icon}
                        <span class="arrow-label">${dir.charAt(0).toUpperCase() + dir.slice(1)}</span>
                    </button>
                </div>
            `;
        }
    }).join('');
}

function renderDestinationList(direction) {
    const container = document.getElementById('destination-list');
    
    if (places.length === 0) {
        container.innerHTML = '<p class="empty-state">No places available</p>';
        return;
    }

    // Filter out the current place and any places already assigned to other directions
    const assignedPlaceIds = new Set(currentPlaceExits.map(e => e.to_place_id));
    const availablePlaces = places.filter(p => p.id !== navState.place_id && !assignedPlaceIds.has(p.id));
    
    if (availablePlaces.length === 0) {
        container.innerHTML = '<p class="empty-state">No other places available</p>';
        return;
    }

    container.innerHTML = availablePlaces.map(place => {
        return `
        <div class="list-item clickable" onclick="createExitLink('${direction}', ${place.id})" style="cursor: pointer;">
            <div class="list-item-content">
                <div class="list-item-title">${escapeHtml(place.name)}</div>
                <div class="list-item-desc">${escapeHtml(place.description || '(no description)')}</div>
            </div>
        </div>
    `}).join('');
}

async function createExitLink(direction, toPlaceId) {
    // Map opposite directions (including diagonals)
    const oppositeDirections = {
        'north': 'south',
        'south': 'north',
        'east': 'west',
        'west': 'east',
        'northeast': 'southwest',
        'southwest': 'northeast',
        'northwest': 'southeast',
        'southeast': 'northwest'
    };
    
    try {
        // Create the forward exit
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'link_places',
                from_place_id: navState.place_id,
                to_place_id: toPlaceId,
                direction: direction
            })
        });

        const data = await response.json();
        if (data.success) {
            // Create the reverse exit in the destination place
            const oppositeDirection = oppositeDirections[direction];
            const reverseResponse = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'link_places',
                    from_place_id: toPlaceId,
                    to_place_id: navState.place_id,
                    direction: oppositeDirection
                })
            });
            
            const reverseData = await reverseResponse.json();
            if (reverseData.success) {
                showMessage('Exit created with automatic reverse!', 'success', 'exit-message');
            } else {
                showMessage('Exit created but automatic reverse failed', 'warning', 'exit-message');
            }
            
            // Smart spatial synchronization for adjacent places
            // Check all 8 possible directions from the new place and auto-assign any that exist
            const allDirections = ['north', 'south', 'east', 'west', 'northeast', 'northwest', 'southeast', 'southwest'];
            const oppositeMap = {
                'north': 'south',
                'south': 'north',
                'east': 'west',
                'west': 'east',
                'northeast': 'southwest',
                'southwest': 'northeast',
                'northwest': 'southeast',
                'southeast': 'northwest'
            };
            
            for (const checkDir of allDirections) {
                // For each direction FROM the new place, find if a place exists in that calculated position
                for (const exit of currentPlaceExits) {
                    const calculatedDirection = calculateRelativeDirection(direction, exit.direction);
                    if (calculatedDirection === checkDir) {
                        try {
                            // Create exit FROM the adjacent place TO the new place in the calculated direction
                            // (not the other way around)
                            await fetch(API_URL, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    action: 'link_places',
                                    from_place_id: exit.to_place_id,
                                    to_place_id: toPlaceId,
                                    direction: checkDir
                                })
                            });
                            
                            // Also create the reverse exit (FROM new place TO adjacent place)
                            const reverseDir = oppositeMap[checkDir];
                            await fetch(API_URL, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    action: 'link_places',
                                    from_place_id: toPlaceId,
                                    to_place_id: exit.to_place_id,
                                    direction: reverseDir
                                })
                            });
                        } catch (error) {
                            console.error('Spatial sync failed:', error);
                        }
                        break; // Found the place for this direction, move to next
                    }
                }
            }
            
            await loadExitsForPlace(navState.place_id);
            showExitsView();
        } else {
            showMessage('Error: ' + data.message, 'error', 'exit-message');
        }
    } catch (error) {
        showMessage('Error creating exit', 'error', 'exit-message');
    }
}

function calculateRelativeDirection(fromDirection, toDirection) {
    // Calculate where place X is relative to place B if:
    // B is fromDirection from A, and X is toDirection from A
    // Returns the direction from B to X
    
    // Direction vectors
    const directionMap = {
        'north': { x: 0, y: -1 },
        'south': { x: 0, y: 1 },
        'east': { x: 1, y: 0 },
        'west': { x: -1, y: 0 },
        'northeast': { x: 1, y: -1 },
        'northwest': { x: -1, y: -1 },
        'southeast': { x: 1, y: 1 },
        'southwest': { x: -1, y: 1 }
    };
    
    const reverseMap = {
        '1,-1': 'northeast',
        '-1,-1': 'northwest',
        '1,1': 'southeast',
        '-1,1': 'southwest',
        '1,0': 'east',
        '-1,0': 'west',
        '0,1': 'south',
        '0,-1': 'north'
    };
    
    const from = directionMap[fromDirection];
    const to = directionMap[toDirection];
    
    if (!from || !to) return null;
    
    // Calculate relative position: where 'from' is relative to 'to'
    // (reverse the subtraction to get the correct direction)
    const relX = from.x - to.x;
    const relY = from.y - to.y;
    
    // Ignore if same direction
    if (relX === 0 && relY === 0) return null;
    
    return reverseMap[relX + ',' + relY] || null;
}

async function deleteExit(exitId) {
    if (!confirm('Delete this exit?')) return;
    
    // Map opposite directions (including diagonals)
    const oppositeDirections = {
        'north': 'south',
        'south': 'north',
        'east': 'west',
        'west': 'east',
        'northeast': 'southwest',
        'southwest': 'northeast',
        'northwest': 'southeast',
        'southeast': 'northwest'
    };
    
    // Find the exit to get its destination and direction
    const exitToDelete = currentPlaceExits.find(e => e.id === exitId);
    
    try {
        // Delete the forward exit
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'delete_exit',
                exit_id: exitId
            })
        });

        const data = await response.json();
        if (data.success) {
            // If we found the exit, also delete the reverse exit in the destination place
            if (exitToDelete) {
                const oppositeDirection = oppositeDirections[exitToDelete.direction.toLowerCase()];
                
                // Find exits from the destination place back to current place
                try {
                    const reverseExitsResponse = await fetch(API_URL, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            action: 'get_exits',
                            place_id: exitToDelete.to_place_id
                        })
                    });
                    
                    const reverseExitsData = await reverseExitsResponse.json();
                    if (reverseExitsData.success) {
                        // Find the reverse exit
                        const reverseExit = reverseExitsData.exits.find(e => 
                            e.direction.toLowerCase() === oppositeDirection && 
                            e.to_place_id === navState.place_id
                        );
                        
                        if (reverseExit) {
                            // Delete the reverse exit
                            await fetch(API_URL, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    action: 'delete_exit',
                                    exit_id: reverseExit.id
                                })
                            });
                        }
                        
                        // Spatial sync cleanup: delete corresponding exits from other adjacent places
                        // For each exit from current place, check if it relates spatially to the deleted exit
                        for (const exit of currentPlaceExits) {
                            const relatedDirection = calculateRelativeDirection(exitToDelete.direction, exit.direction);
                            if (relatedDirection) {
                                // This adjacent place has a related exit that should be deleted
                                // Find and delete exits from exit.to_place_id to exitToDelete.to_place_id in the related direction
                                try {
                                    const adjacentExitsResponse = await fetch(API_URL, {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({
                                            action: 'get_exits',
                                            place_id: exit.to_place_id
                                        })
                                    });
                                    
                                    const adjacentExitsData = await adjacentExitsResponse.json();
                                    if (adjacentExitsData.success) {
                                        const exitToRemove = adjacentExitsData.exits.find(e => 
                                            e.direction.toLowerCase() === relatedDirection && 
                                            e.to_place_id === exitToDelete.to_place_id
                                        );
                                        
                                        if (exitToRemove) {
                                            await fetch(API_URL, {
                                                method: 'POST',
                                                headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify({
                                                    action: 'delete_exit',
                                                    exit_id: exitToRemove.id
                                                })
                                            });
                                        }
                                    }
                                } catch (error) {
                                    console.error('Error deleting spatial sync exit:', error);
                                }
                            }
                        }
                    }
                } catch (error) {
                    console.error('Error deleting reverse exit:', error);
                }
            }
            
            showMessage('Exit deleted', 'success', 'exit-message');
            await loadExitsForPlace(navState.place_id);
        } else {
            showMessage('Error: ' + data.message, 'error', 'exit-message');
        }
    } catch (error) {
        showMessage('Error deleting exit', 'error', 'exit-message');
    }
}

// ===== MODAL FUNCTIONS =====
function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
    }
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'none';
        // Check if any other modals are still open
        const openModals = document.querySelectorAll('.modal[style*="display: flex"]');
        if (openModals.length === 0) {
            document.body.style.overflow = 'auto';
        }
    }
}

// Close modal when clicking outside
window.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal')) {
        e.target.style.display = 'none';
    }
});

// Close modal when clicking close button
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-close')) {
        const modal = e.target.closest('.modal');
        if (modal) {
            modal.style.display = 'none';
        }
    }
});

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

// ===== CONNECTION TYPE FUNCTIONS =====
function showConnectionTypeModal(exitId, currentType) {
    // Store current exit ID for updating
    window.currentExitId = exitId;
    window.currentExitType = currentType;
    
    const connectionTypes = [
        { id: 'full', label: 'Full', description: 'Completely open area (like being outside or a huge room)', color: '#00ff00' },
        { id: 'passage', label: 'Passage', description: 'Open passage like an arch or doorway (can look through)', color: '#00ccff' },
        { id: 'closed', label: 'Closed', description: 'Closed door or hatch (need to open)', color: '#ffaa00' },
        { id: 'locked', label: 'Locked', description: 'Locked door or hatch (need an item)', color: '#ff4444' },
        { id: 'no_throughway', label: 'No Throughway', description: 'Exists spatially but cannot enter', color: '#888888' }
    ];
    
    const container = document.getElementById('connection-type-options');
    container.innerHTML = connectionTypes.map(type => `
        <div style="
            padding: 12px;
            margin: 8px 0;
            border: 2px solid ${type.color};
            border-radius: 4px;
            cursor: pointer;
            background: ${currentType === type.id ? 'rgba(' + hexToRgb(type.color).join(',') + ',0.2)' : 'transparent'};
            transition: all 0.2s;
        " 
        onclick="updateConnectionType('${type.id}')">
            <div style="font-weight: bold; color: ${type.color};">${type.label}</div>
            <div style="font-size: 12px; color: #aaa; margin-top: 4px;">${type.description}</div>
        </div>
    `).join('');
    
    openModal('modal-connection-type');
}

function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? [
        parseInt(result[1], 16),
        parseInt(result[2], 16),
        parseInt(result[3], 16)
    ] : [0, 0, 0];
}

async function updateConnectionType(newType) {
    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'update_exit_type',
                exit_id: window.currentExitId,
                connection_type: newType
            })
        });
        
        const data = await response.json();
        if (data.success) {
            // Reload exits to show updated type
            await loadExitsForPlace(navState.place_id);
            closeModal('modal-connection-type');
        } else {
            alert('Error updating connection type: ' + data.message);
        }
    } catch (error) {
        console.error('Error updating connection type:', error);
        alert('Error updating connection type');
    }
}

