import { state, addActivity as addActivityToStateArray } from '../state/index.js';
import { Activity } from '../types/index.js';
import { elements } from '../utils/dom.js';
import { formatTime } from '../utils/helpers.js';

export function addActivityToState(newActivity?: Activity) {
    const text = elements.activityInput.value.trim();
    if (text || newActivity) {
        const now = new Date();
        
        if (state.activities.length > 0) {
            const lastActivity = state.activities[state.activities.length - 1];

            let currentTotalElapsedTime = state.totalElapsedTime;
            if (state.timerInterval) {
                currentTotalElapsedTime = (now.getTime() - (state.startTime ?? now.getTime()) + state.pausedTime) / 1000;
            }

            const previousActivitiesDuration = state.activities
                .slice(0, -1)
                .reduce((sum, act) => sum + (act.durationSeconds || 0), 0);

            const newDuration = currentTotalElapsedTime - previousActivitiesDuration;
            lastActivity.durationSeconds = Math.max(0, newDuration);
        }

        const activityToAdd = newActivity || { text, timestamp: now };
        addActivityToStateArray(activityToAdd);
        renderActivities();
        elements.activityInput.value = '';
        elements.activityInput.focus();
    }
}

export function renderActivities() {
    elements.activityList.innerHTML = '';

    if( state.activities.length === 0) {
        elements.activityList.innerHTML = '<li class="text-muted">No activities recorded yet.</li>';
        return; 
    } else {
        elements.activityList.innerHTML = '';
    }
    state.activities.forEach((act, index) => {
        const li = document.createElement('li');
        const time = act.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        let durationHtml = '';
        if (act.durationSeconds !== undefined) {
            durationHtml = `<span class="duration">${formatTime(act.durationSeconds)}</span>`;
        } else if (index === state.activities.length - 1) {
            if (state.timerInterval) { // Running
                durationHtml = `<span class="duration running" id="current-activity-duration">(... running)</span>`;
            } else { // Paused
                const previousActivitiesDuration = state.activities
                    .slice(0, -1)
                    .reduce((sum, act) => sum + (act.durationSeconds || 0), 0);
                const currentActivityDuration = state.totalElapsedTime - previousActivitiesDuration;
                durationHtml = `<span class="duration">${formatTime(Math.max(0, currentActivityDuration))}</span>`;
            }
        }

        li.innerHTML = `
            <div>
                <span class="timestamp">${time}</span> ${act.text}
            </div>
            ${durationHtml}
        `;
        elements.activityList.appendChild(li);
    });
}
