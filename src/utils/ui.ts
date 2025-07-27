/**
 * Theme Management System
 */

declare global {
    interface Window {
        bootstrap: any;
    }
}

(() => {
    'use strict'

    const getStoredTheme = () => localStorage.getItem('theme')
    const setStoredTheme = (theme: string) => localStorage.setItem('theme', theme)

    const getPreferredTheme = () => {
        const storedTheme = getStoredTheme()
        if (storedTheme) {
            return storedTheme
        }
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    }

    const setTheme = (theme: string) => {
        if (theme === 'auto') {
            if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
                document.documentElement.setAttribute('data-bs-theme', 'dark')
            } else {
                document.documentElement.setAttribute('data-bs-theme', 'light')
            }
        } else {
            document.documentElement.setAttribute('data-bs-theme', theme)
        }
    }

    const updateThemeIcon = (theme: string) => {
        const themeIcon = document.querySelector('#theme-icon')
        const themeButton = document.querySelector('#theme-toggle')
        
        if (!themeIcon || !themeButton) return

        // Remove all theme classes
        themeIcon.className = 'fa-solid '
        
        // Set icon and tooltip based on theme
        switch (theme) {
            case 'light':
                themeIcon.classList.add('fa-sun')
                themeButton.setAttribute('title', 'Switch to dark theme')
                break
            case 'dark':
                themeIcon.classList.add('fa-moon')
                themeButton.setAttribute('title', 'Switch to auto theme')
                break
            case 'auto':
                themeIcon.classList.add('fa-circle-half-stroke')
                themeButton.setAttribute('title', 'Switch to light theme')
                break
            default:
                themeIcon.classList.add('fa-circle-half-stroke')
                themeButton.setAttribute('title', 'Switch theme')
        }
    }

    const cycleTheme = () => {
        const currentTheme = getStoredTheme() || getPreferredTheme()
        let nextTheme
        
        switch (currentTheme) {
            case 'light':
                nextTheme = 'dark'
                break
            case 'dark':
                nextTheme = 'auto'
                break
            case 'auto':
            default:
                nextTheme = 'light'
                break
        }
        
        setStoredTheme(nextTheme)
        setTheme(nextTheme)
        updateThemeIcon(nextTheme)
    }

    // Initialize theme
    const initialTheme = getPreferredTheme()
    setTheme(initialTheme)

    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        const storedTheme = getStoredTheme()
        if (storedTheme === 'auto' || !storedTheme) {
            setTheme(getPreferredTheme())
        }
    })

    window.addEventListener('DOMContentLoaded', () => {
        const currentTheme = getStoredTheme() || getPreferredTheme()
        updateThemeIcon(currentTheme)

        const themeToggle = document.querySelector('#theme-toggle')
        if (themeToggle) {
            themeToggle.addEventListener('click', cycleTheme)
        }
    })
})()

/**
 * Toast Notification System
 */
class ToastManager {
    private container: HTMLElement
    private toastCount: number

    constructor() {
        const container = document.getElementById('toast-container');
        if (!container) {
            console.error('Toast container not found in DOM');
            // Create a fallback container
            this.container = document.createElement('div');
            this.container.id = 'toast-container-fallback';
            this.container.className = 'toast-container position-fixed top-0 end-0 p-3';
            document.body.appendChild(this.container);
        } else {
            this.container = container;
        }
        this.toastCount = 0;
    }

    show(message: string, type: string = 'info', title: string | null = null, duration: number = 5000) {
        // Check if Bootstrap is available
        if (typeof window.bootstrap === 'undefined') {
            console.error('Bootstrap is not loaded, falling back to console output');
            console.log(`${type.toUpperCase()}: ${title || 'Notification'} - ${message}`);
            return null;
        }
        
        const toastId = `toast-${++this.toastCount}`;
        const toast = this.createToast(toastId, message, type, title, duration);
        
        this.container.appendChild(toast);
        
        const bsToast = new window.bootstrap.Toast(toast, {
            autohide: duration > 0,
            delay: duration
        });
        
        bsToast.show();
        
        // Remove toast element after it's hidden
        toast.addEventListener('hidden.bs.toast', () => {
            toast.remove();
        });
        
        return bsToast;
    }

    private createToast(id: string, message: string, type: string, title: string | null, _duration: number): HTMLElement {
        const iconMap: Record<string, string> = {
            success: 'fa-circle-check',
            error: 'fa-circle-exclamation',
            warning: 'fa-triangle-exclamation',
            info: 'fa-circle-info'
        };

        const bgMap: Record<string, string> = {
            success: 'text-bg-success',
            error: 'text-bg-danger',
            warning: 'text-bg-warning',
            info: 'text-bg-info'
        };

        const defaultTitles: Record<string, string> = {
            success: 'Success',
            error: 'Error',
            warning: 'Warning',
            info: 'Information'
        };

        const toastTitle = title || defaultTitles[type] || 'Notification';
        const icon = iconMap[type] || iconMap.info;
        const bgClass = bgMap[type] || bgMap.info;

        const toastHtml = `
            <div id="${id}" class="toast" role="alert" aria-live="assertive" aria-atomic="true">
                <div class="toast-header ${bgClass}">
                    <i class="fa-solid ${icon} me-2"></i>
                    <strong class="me-auto">${toastTitle}</strong>
                    <small class="text-body-secondary">${this.getTimeString()}</small>
                    <button type="button" class="btn-close" data-bs-dismiss="toast" aria-label="Close"></button>
                </div>
                <div class="toast-body">
                    ${message}
                </div>
            </div>
        `;

        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = toastHtml;
        return tempDiv.firstElementChild as HTMLElement;
    }

    private getTimeString(): string {
        const now = new Date();
        return now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    success(message: string, title: string | null = null, duration: number = 5000) {
        return this.show(message, 'success', title, duration);
    }

    error(message: string, title: string | null = null, duration: number = 8000) {
        return this.show(message, 'error', title, duration);
    }

    warning(message: string, title: string | null = null, duration: number = 6000) {
        return this.show(message, 'warning', title, duration);
    }

    info(message: string, title: string | null = null, duration: number = 5000) {
        return this.show(message, 'info', title, duration);
    }
}

// Initialize global toast manager
declare global {
    interface Window {
        toastManager: ToastManager;
        showToast: (message: string, type?: string, title?: string | null, duration?: number) => any;
        showSuccess: (message: string, title?: string | null, duration?: number) => any;
        showError: (message: string, title?: string | null, duration?: number) => any;
        showWarning: (message: string, title?: string | null, duration?: number) => any;
        showInfo: (message: string, title?: string | null, duration?: number) => any;
    }
}

window.toastManager = new ToastManager();

// Helper functions for easy access
export const showToast = (message: string, type?: string, title?: string | null, duration?: number) =>
    window.toastManager.show(message, type, title, duration);
export const showSuccess = (message: string, title?: string | null, duration?: number) =>
    window.toastManager.success(message, title, duration);
export const showError = (message: string, title?: string | null, duration?: number) =>
    window.toastManager.error(message, title, duration);
export const showWarning = (message: string, title?: string | null, duration?: number) =>
    window.toastManager.warning(message, title, duration);
export const showInfo = (message: string, title?: string | null, duration?: number) =>
    window.toastManager.info(message, title, duration);

window.showToast = showToast;
window.showSuccess = showSuccess;
window.showError = showError;
window.showWarning = showWarning;
window.showInfo = showInfo;

/**
 * Confirmation Dialog System
 */
export const showConfirm = (message: string, subtitle: string = ''): Promise<boolean> => {
    return new Promise((resolve) => {
        const modalId = `confirm-modal-${Date.now()}`;
        const modalHtml = `
            <div class="modal fade" id="${modalId}" tabindex="-1" aria-labelledby="confirmModalLabel" aria-hidden="true">
                <div class="modal-dialog">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title" id="confirmModalLabel">Confirm Action</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                        </div>
                        <div class="modal-body">
                            <p>${message}</p>
                            ${subtitle ? `<p class="text-muted small">${subtitle}</p>` : ''}
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal" id="${modalId}-cancel">Cancel</button>
                            <button type="button" class="btn btn-primary" data-bs-dismiss="modal" id="${modalId}-confirm">Confirm</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Create and append the modal
        const modalContainer = document.createElement('div');
        modalContainer.innerHTML = modalHtml;
        document.body.appendChild(modalContainer);

        // Get the modal element
        const modalElement = document.getElementById(modalId);
        if (!modalElement) {
            console.error('Failed to create confirmation modal');
            resolve(false);
            return;
        }

        // Initialize Bootstrap modal
        const modal = new window.bootstrap.Modal(modalElement);

        // Set up event listeners for the buttons
        const confirmButton = document.getElementById(`${modalId}-confirm`);
        const cancelButton = document.getElementById(`${modalId}-cancel`);

        confirmButton?.addEventListener('click', () => {
            resolve(true);
            cleanupModal();
        });

        cancelButton?.addEventListener('click', () => {
            resolve(false);
            cleanupModal();
        });

        // Handle modal dismissal
        modalElement.addEventListener('hidden.bs.modal', () => {
            resolve(false);
            cleanupModal();
        });

        // Cleanup function
        const cleanupModal = () => {
            setTimeout(() => {
                modalContainer.remove();
            }, 300);
        };

        // Show the modal
        modal.show();
    });
};

// Add to window for global access
declare global {
    interface Window {
        // ...existing declarations...
        showConfirm: (message: string, subtitle?: string) => Promise<boolean>;
    }
}

window.showConfirm = showConfirm;
