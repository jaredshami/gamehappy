# Flag Guardians - Graph-Based Game Mechanics

## Map Layout

The game uses a **graph-based territory control system** featuring a block with houses on the north and south sides, divided by an alleyway.

### Top-Down View

```
NORTH SIDE (Red Team Home)
[N0] [N1] [N2] [N3] [N4] [N5]
 ║    ║    ║    ║    ║    ║
[A0]─[A1]─[A2]─[A3]─[A4]─[A5]  (ALLEYWAY - Neutral Territory)
 ║    ║    ║    ║    ║    ║
[S0] [S1] [S2] [S3] [S4] [S5]
SOUTH SIDE (Blue Team Home)
```

## Node Types

### 18 Total Nodes
- **6 North Nodes (N0-N5)**: Red team's starting territory
- **6 Alleyway Nodes (A0-A5)**: Neutral territory (contested)
- **6 South Nodes (S0-S5)**: Blue team's starting territory

## Node Ownership & Control

### Initial State
- **Red Team Controls**: N0, N1, N2, N3, N4, N5 (North side)
- **Blue Team Controls**: S0, S1, S2, S3, S4, S5 (South side)
- **Neutral**: A0, A1, A2, A3, A4, A5 (Alleyway)

### Visual Indicators
Each node displays:
- **🔴** - Red team controlled
- **🔵** - Blue team controlled
- **⚪** - Neutral (uncontrolled)

## Graph Connections (Edges)

### North Side (Linear)
```
N0 ← → N1 ← → N2 ← → N3 ← → N4 ← → N5
```

### Alleyway (Linear)
```
A0 ← → A1 ← → A2 ← → A3 ← → A4 ← → A5
```

### South Side (Linear)
```
S0 ← → S1 ← → S2 ← → S3 ← → S4 ← → S5
```

### Cross Connections (Vertical)
```
N0 ↔ A0 ↔ S0
N1 ↔ A1 ↔ S1
N2 ↔ A2 ↔ S2
N3 ↔ A3 ↔ S3
N4 ↔ A4 ↔ S4
N5 ↔ A5 ↔ S5
```

### Total Edges: 24
- North side: 5 edges
- South side: 5 edges
- Alleyway: 5 edges
- Vertical connections: 9 edges (6 North→Alley + 6 Alley→South = 12, but bidirectional)

## Game Mechanics

### Node Capture
- **Action**: Click on a node to attempt capture
- **Requirements**: 
  - Node must be adjacent to a node your team controls
  - Can capture neutral nodes
  - Can capture enemy nodes (if adjacent)
  
### Territory Control Rules
- **Linear Expansion**: Teams must expand along connected nodes
- **Alleyway Strategy**: The alleyway (A0-A5) is the key battleground
- **Blocking**: Controlling alleyway nodes blocks enemy expansion
- **Bridges**: Vertical connections are critical for controlling opposite side

### Scoring
- **Territory Control**: Points awarded per round based on nodes controlled
- **Flag Capture**: Bonus points if you reach and capture the enemy flag
- **Holding Territory**: Continuous points for holding key positions

### Flag Locations
- **Red Flag**: Located at N2 or N3 (center of Red's starting territory)
- **Blue Flag**: Located at S2 or S3 (center of Blue's starting territory)

### Winning Conditions
1. **Territory Majority**: Control >50% of nodes for 3 consecutive rounds
2. **Flag Capture**: Successfully capture and return enemy flag to your side
3. **First to 10 Points**: Reach 10 points first (flexible, configurable)

## UI Grid Display

### Visual Representation
- 3 rows (North, Alleyway, South)
- 6 columns (house positions)
- Interactive clickable nodes
- Real-time color updates

### Node Styling
```css
.map-node.owner-red  /* Red gradient background + border */
.map-node.owner-blue /* Blue gradient background + border */
.map-node.owner-neutral /* Neutral gray styling */
```

### Hover Effects
- Scale up slightly (1.05x)
- Golden border highlight
- Enhanced glow effect

## Game Flow

### Phase 1: Game Setup
1. Players join and select teams
2. Host starts game
3. Game initializes with map state

### Phase 2: Active Gameplay
1. Map displays with initial territory
2. Players click nodes to capture them
3. Territory control updates in real-time
4. Game log shows all actions

### Phase 3: Scoring & Results
1. Points calculated based on:
   - Nodes controlled
   - Territory bonuses
   - Flag capture
2. Round advances or game ends
3. Final results displayed

## Data Structure

### MapGraph Object
```javascript
{
  nodes: [
    { id: 'N0', x: 0, y: 0, side: 'north', label: 'N0' },
    { id: 'A0', x: 0, y: 1, side: 'alley', label: 'A0' },
    { id: 'S0', x: 0, y: 2, side: 'south', label: 'S0' },
    // ... 15 more nodes
  ],
  edges: [
    { from: 'N0', to: 'N1' },
    { from: 'N0', to: 'A0' },
    // ... 22 more edges
  ]
}
```

### Node Control Map
```javascript
this.nodeControl = new Map([
  ['N0', 'red'],
  ['N1', 'red'],
  ['A0', 'neutral'],
  ['A1', 'neutral'],
  ['S0', 'blue'],
  // ...
]);
```

## Client-Server Communication

### New Socket Events

#### game:node-action
**Client → Server**: Player attempts to capture a node
```javascript
socket.emit('game:node-action', {
    gameCode: 'AB3X7Z',
    nodeId: 'A0',
    action: 'capture'
}, (response) => {
    // Handle success/failure
});
```

#### game:territory-update
**Server → Client**: Territory control changes
```javascript
socket.on('game:territory-update', (data) => {
    // data.nodeControl: { 'A0': 'red', 'A1': 'blue', ... }
    // data.scores: { red: 5, blue: 3 }
    this.updateGameMap(data.nodeControl);
});
```

#### game:round-complete
**Server → Client**: Round has ended
```javascript
socket.on('game:round-complete', (data) => {
    // data.scores
    // data.nextRound
    // data.gameEnded
});
```

## Strategic Elements

### Strategic Nodes
- **Alleyway Center (A2, A3)**: Control = key to map control
- **Vertical Crossings**: Each position's crossing point
- **Enemy Flag Neighbors**: Need to control nodes adjacent to flag

### Strategies
1. **Controlled Expansion**: Methodically take alleyway nodes
2. **Pincer Attack**: Attack from multiple sides
3. **Flag Defense**: Prioritize defending adjacent nodes
4. **Corridor Control**: Keep vertical passages blocked

## Future Enhancements

### Potential Features
- Node strength/health (takes multiple captures)
- Team members on nodes (occupy to control)
- Special powerups (speed, area control)
- Dynamic flag positions
- Fog of war (partial information)
- Pathfinding visualization
- Movement animations
- Sound effects

## Implementation Status

### ✅ Completed
- Map graph data structure
- Node ownership tracking
- Visual grid rendering
- Click handlers for nodes
- Color-coded ownership display
- CSS styling and animations

### 🚧 In Progress
- Server-side capture logic
- Territory validation
- Socket event handlers
- Scoring system

### 📋 TODO
- Flag capture mechanics
- Scoring calculation
- Round advancement
- Win condition checking
- Game end/results
