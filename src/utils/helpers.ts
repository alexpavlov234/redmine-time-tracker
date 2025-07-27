import { elements } from './dom.js';
import { showError } from './ui.js';

export function formatTime(seconds: number): string {
    const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
    const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
    const s = Math.floor(seconds % 60).toString().padStart(2, '0');
    return `${h}:${m}:${s}`;
}

export function formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
}

export function setButtonLoading(button: HTMLButtonElement, isLoading: boolean, newHtml?: string) {
    const originalHtml = button.dataset.originalHtml || button.innerHTML;
    if (isLoading) {
        button.dataset.originalHtml = originalHtml;
        button.disabled = true;
        button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Loading...';
    } else {
        button.disabled = false;
        button.innerHTML = newHtml || originalHtml;
    }
}

export function showGlobalError(message: string, details?: any) {
    let detailString = '';
    if (details) {
        try {
            if (typeof details === 'string') {
                detailString = details;
            } else if (details instanceof Error) {
                detailString = details.message; // Just the message for brevity in a toast
            } else {
                detailString = JSON.stringify(details);
            }
        } catch (e) {
            detailString = "Could not serialize error details."
        }
    }

    const fullMessage = detailString ? `${message} - ${detailString}` : message;

    // Use the toast component to show the error
    showError(fullMessage, 'An Error Occurred', 10000); // 10-second duration
}

export function showPage(page: 'tracker' | 'settings' | 'logged-time') {
    elements.trackerPage.style.display = 'none';
    elements.settingsPage.style.display = 'none';
    elements.loggedTimePage.style.display = 'none';
    elements.navTracker.classList.remove('active');
    elements.navSettings.classList.remove('active');
    elements.navLoggedTime.classList.remove('active');

    if (page === 'tracker') {
        elements.trackerPage.style.display = 'block';
        elements.navTracker.classList.add('active');
    } else if (page === 'settings') {
        elements.settingsPage.style.display = 'block';
        elements.navSettings.classList.add('active');
    } else if (page === 'logged-time') {
        elements.loggedTimePage.style.display = 'block';
        elements.navLoggedTime.classList.add('active');
    }
}
