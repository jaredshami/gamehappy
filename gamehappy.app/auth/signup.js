/**
 * GameHappy Authentication - Signup
 */

class SignupManager {
    constructor() {
        this.form = document.getElementById('signup-form');
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
        const email = document.getElementById('email').value.trim();
        const password = document.getElementById('password').value;
        const confirmPassword = document.getElementById('confirm-password').value;

        // Validation
        if (!this.validateForm(username, email, password, confirmPassword)) {
            return;
        }

        this.submitSignup(username, email, password);
    }

    validateForm(username, email, password, confirmPassword) {
        // Username validation
        if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
            this.showError('Username must be 3-20 alphanumeric characters');
            return false;
        }

        // Email validation
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            this.showError('Please enter a valid email address');
            return false;
        }

        // Password validation
        if (password.length < 8) {
            this.showError('Password must be at least 8 characters');
            return false;
        }

        // Password match
        if (password !== confirmPassword) {
            this.showError('Passwords do not match');
            return false;
        }

        return true;
    }

    submitSignup(username, email, password) {
        const button = this.form.querySelector('button[type="submit"]');
        button.disabled = true;
        button.classList.add('loading');

        // Send to backend
        fetch('/api/auth/register.php', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                username,
                email,
                password
            })
        })
        .then(response => response.json())
        .then(data => {
            button.disabled = false;
            button.classList.remove('loading');

            // Log the version marker for testing
            if (data.marker) {
                console.log('✅ DEPLOYMENT MARKER FOUND:', data.marker, '| VERSION:', data.version);
            }

            if (data.success) {
                this.showSuccess('Account created successfully! Redirecting to login...');
                setTimeout(() => {
                    window.location.href = '/auth/login.html';
                }, 2000);
            } else {
                this.showError(data.message || 'An error occurred during signup');
            }
        })
        .catch(error => {
            button.disabled = false;
            button.classList.remove('loading');
            console.error('❌ Signup error:', error);
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
    new SignupManager();
});
