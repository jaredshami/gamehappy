/**
 * GameHappy Authentication - Login
 */

class LoginManager {
    constructor() {
        this.form = document.getElementById('login-form');
        this.messageDiv = document.getElementById('message');
        this.setupEventListeners();
        this.checkExistingSession();
    }

    setupEventListeners() {
        this.form.addEventListener('submit', (e) => this.handleSubmit(e));
    }

    checkExistingSession() {
        // Check if already logged in - if so, redirect to home
        fetch('/api/auth/check-session.php')
            .then(response => response.json())
            .then(data => {
                if (data.authenticated) {
                    // Already logged in, redirect to homepage
                    window.location.href = '/index.html';
                }
            })
            .catch(err => console.log('Session check failed', err));
    }

    handleSubmit(e) {
        e.preventDefault();

        const username = document.getElementById('username').value.trim();
        const password = document.getElementById('password').value;
        const remember = document.getElementById('remember').checked;

        if (!username || !password) {
            this.showError('Please enter username and password');
            return;
        }

        this.submitLogin(username, password, remember);
    }

    submitLogin(username, password, remember) {
        const button = this.form.querySelector('button[type="submit"]');
        button.disabled = true;
        button.classList.add('loading');

        fetch('/api/auth/login.php', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                username,
                password,
                remember
            })
        })
        .then(response => response.json())
        .then(data => {
            button.disabled = false;
            button.classList.remove('loading');

            if (data.success) {
                this.showSuccess('Login successful! Redirecting...');
                // Store user info in session storage
                sessionStorage.setItem('userId', data.userId);
                sessionStorage.setItem('username', data.username);
                sessionStorage.setItem('userEmail', data.email);
                
                // Get redirect target from URL params, default to home
                const params = new URLSearchParams(window.location.search);
                const redirectTo = params.get('redirect') || '/index.html';
                
                setTimeout(() => {
                    window.location.href = redirectTo;
                }, 1500);
            } else {
                this.showError(data.message || 'Invalid username or password');
            }
        })
        .catch(error => {
            button.disabled = false;
            button.classList.remove('loading');
            console.error('Login error:', error);
            this.showError('Network error. Please try again.');
        });
    }

    showError(message) {
        this.messageDiv.textContent = message;
        this.messageDiv.className = 'message error';
    }

    showSuccess(message) {
        this.messageDiv.textContent = message;
        this.messageDiv.className = 'message success';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new LoginManager();
});
