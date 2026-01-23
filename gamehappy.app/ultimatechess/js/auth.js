/**
 * GameHappy Authentication Manager
 * Shared across all games
 */

class GameHappyAuth {
    constructor() {
        this.userId = null;
        this.username = null;
        this.email = null;
        this.isLoggedIn = false;
        this.checkSession();
    }

    checkSession() {
        fetch('/api/auth/check-session.php')
            .then(response => response.json())
            .then(data => {
                if (data.authenticated || data.loggedIn) {
                    this.userId = data.userId;
                    this.username = data.username;
                    this.email = data.email;
                    this.isLoggedIn = true;
                    this.onSessionValid();
                } else {
                    this.redirectToLogin();
                }
            })
            .catch(err => {
                console.error('Session check failed:', err);
                this.redirectToLogin();
            });
    }

    onSessionValid() {
        // Override in child classes
    }

    redirectToLogin() {
        // Redirect to login with return URL
        const returnUrl = encodeURIComponent(window.location.pathname + window.location.search);
        window.location.href = '/auth/login.html?redirect=' + returnUrl;
    }

    logout() {
        fetch('/api/auth/logout.php', { method: 'POST' })
            .then(() => {
                window.location.href = '/index.html';
            });
    }

    updateUserStats(gameType, result, eloChange = 0) {
        const data = {
            game_type: gameType,
            result: result
        };

        if (eloChange !== 0) {
            data.elo_rating_change = eloChange;
        }

        return fetch('/api/auth/profile.php', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        })
        .then(response => response.json());
    }

    getUserProfile() {
        return fetch('/api/auth/profile.php')
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    return data.user;
                }
                throw new Error('Failed to fetch profile');
            });
    }
}
