// Authentication instance
let auth;

// Menu navigation
function navigateTo(gameType) {
    if (!auth || !auth.isLoggedIn) {
        alert('Please log in to play');
        auth.redirectToLogin();
        return;
    }

    const routes = {
        'friendly-chess': 'games/friendly-chess.html',
        'timed-chess': 'games/timed-chess.html',
        'world-chess': 'games/world-chess.html',
        'wack-chess': 'games/wack-chess.html'
    };

    if (routes[gameType]) {
        window.location.href = routes[gameType];
    }
}

// Extended auth class for menu
class MenuAuth extends GameHappyAuth {
    onSessionValid() {
        document.getElementById('username-display').textContent = 'Welcome, ' + this.username;
    }

    logout() {
        fetch('/api/auth/logout.php', { method: 'POST' })
            .then(() => {
                // Redirect to homepage after logout
                window.location.href = '/index.html';
            });
    }
}

// Initialize menu
document.addEventListener('DOMContentLoaded', () => {
    auth = new MenuAuth();
});
