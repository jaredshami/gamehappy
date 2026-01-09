// Authentication system
class GameAuth {
    constructor() {
        this.currentUser = this.loadUser();
        this.users = this.loadUsers();
        this.initializeAuth();
    }

    initializeAuth() {
        const loginScreen = document.getElementById('login-screen');
        const homeScreen = document.getElementById('home-screen');

        if (this.currentUser) {
            loginScreen.classList.remove('active');
            homeScreen.classList.add('active');
            document.getElementById('player-name').textContent = this.currentUser.username;
        } else {
            loginScreen.classList.add('active');
            homeScreen.classList.remove('active');
            this.setupLoginHandlers();
        }
    }

    setupLoginHandlers() {
        document.getElementById('login-btn').addEventListener('click', () => this.handleLogin());
        document.getElementById('demo-btn').addEventListener('click', () => this.handleDemoLogin());
        
        document.getElementById('password-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.handleLogin();
        });
    }

    handleLogin() {
        const username = document.getElementById('username-input').value.trim();
        const password = document.getElementById('password-input').value;
        const errorEl = document.getElementById('login-error');

        if (!username || !password) {
            errorEl.textContent = 'Please enter username and password';
            return;
        }

        const user = this.users.find(u => u.username === username);
        if (user && user.password === password) {
            this.loginUser(user);
            errorEl.textContent = '';
        } else {
            errorEl.textContent = 'Invalid username or password';
        }
    }

    handleDemoLogin() {
        const demoUser = {
            id: 'admin',
            username: 'admin',
            password: 'admin',
            email: 'admin@gamehappy.local'
        };
        this.loginUser(demoUser);
    }

    loginUser(user) {
        this.currentUser = {
            id: user.id,
            username: user.username,
            email: user.email
        };
        this.saveUser(this.currentUser);
        document.getElementById('login-screen').classList.remove('active');
        document.getElementById('home-screen').classList.add('active');
        document.getElementById('player-name').textContent = user.username;
    }

    logout() {
        this.currentUser = null;
        localStorage.removeItem('gamehappy_user');
        document.getElementById('home-screen').classList.remove('active');
        document.getElementById('game-screen').classList.remove('active');
        document.getElementById('login-screen').classList.add('active');
        document.getElementById('username-input').value = '';
        document.getElementById('password-input').value = '';
        document.getElementById('login-error').textContent = '';
        this.setupLoginHandlers();
    }

    saveUser(user) {
        localStorage.setItem('gamehappy_user', JSON.stringify(user));
    }

    loadUser() {
        const stored = localStorage.getItem('gamehappy_user');
        return stored ? JSON.parse(stored) : null;
    }

    loadUsers() {
        return [
            {
                id: 'admin',
                username: 'admin',
                password: 'admin',
                email: 'admin@gamehappy.local'
            }
        ];
    }

    isLoggedIn() {
        return this.currentUser !== null;
    }

    getCurrentUser() {
        return this.currentUser;
    }
}

// Initialize auth
let gameAuth;
document.addEventListener('DOMContentLoaded', () => {
    gameAuth = new GameAuth();
    
    document.getElementById('logout-btn').addEventListener('click', () => {
        gameAuth.logout();
    });

    document.getElementById('level-1-btn').addEventListener('click', () => {
        if (gameAuth && gameAuth.isLoggedIn()) {
            startGame();
        }
    });

    document.getElementById('back-btn').addEventListener('click', () => {
        document.getElementById('game-screen').classList.remove('active');
        document.getElementById('home-screen').classList.add('active');
    });
});
