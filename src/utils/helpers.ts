import { elements } from './dom.js';

export function formatTime(seconds: number): string {
    const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
    const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
    const s = Math.floor(seconds % 60).toString().padStart(2, '0');
    return `${h}:${m}:${s}`;
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
    // Safety check for global error container
    if (!elements.globalErrorContainer) {
        console.error('Global error container not found, falling back to console:');
        console.error(message, details);
        return;
    }
    
    const errorId = `error-${Date.now()}`;
    const banner = document.createElement('div');
    banner.className = 'error-banner';
    banner.id = errorId;
    
    let detailsHtml = '';
    let detailString = '';
    const detailsId = `details-${errorId}`;

    if (details) {
        try {
            if (typeof details === 'string') {
                detailString = details;
            } else if (details instanceof Error) {
                detailString = `${details.message}\n${details.stack || ''}`;
            } else {
                detailString = JSON.stringify(details, null, 2);
            }
        } catch (e) {
            detailString = "Could not serialize error details."
        }
        detailsHtml = `
            <a href="#" class="error-banner-details-toggle" id="toggle-${detailsId}">Show Details</a>
            <div class="error-banner-details" id="${detailsId}" style="display: none;"></div>
        `;
    }

    banner.innerHTML = `
        <div class="error-banner-header">
            <span><i class="fa-solid fa-circle-exclamation"></i> An error occurred</span>
            <button class="close-error-btn">&times;</button>
        </div>
        <p>${message}</p>
        ${detailsHtml}
    `;
    
    banner.querySelector('.close-error-btn')?.addEventListener('click', () => banner.remove());

    if (details) {
        const toggle = banner.querySelector(`#toggle-${detailsId}`);
        const detailsDiv = banner.querySelector(`#details-${detailsId}`) as HTMLDivElement;
        if(toggle && detailsDiv) {
            detailsDiv.textContent = detailString;
            toggle.addEventListener('click', (e) => {
                e.preventDefault();
                detailsDiv.style.display = detailsDiv.style.display === 'none' ? 'block' : 'none';
                (e.target as HTMLElement).textContent = detailsDiv.style.display === 'none' ? 'Show Details' : 'Hide Details';
            })
        }
    }

    elements.globalErrorContainer.appendChild(banner);
}

export function showPage(page: 'tracker' | 'settings') {
    elements.trackerPage.style.display = 'none';
    elements.settingsPage.style.display = 'none';
    elements.navTracker.classList.remove('active');
    elements.navSettings.classList.remove('active');

    if (page === 'tracker') {
        elements.trackerPage.style.display = 'block';
        elements.navTracker.classList.add('active');
    } else {
        elements.settingsPage.style.display = 'block';
        elements.navSettings.classList.add('active');
    }
}
