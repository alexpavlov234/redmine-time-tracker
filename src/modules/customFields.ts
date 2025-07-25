import { getTimeEntryCustomFields } from '../services/redmine.js';
import { elements } from '../utils/dom.js';

interface CustomField {
    id: number;
    name: string;
    field_format: string;
    possible_values?: string[];
    default_value?: string;
    required?: boolean;
    is_required?: boolean;
}

let availableCustomFields: CustomField[] = [];
let customFieldElements: { [key: number]: HTMLElement } = {};

export async function loadCustomFields() {
    try {
        availableCustomFields = await getTimeEntryCustomFields();
        console.log('Loaded custom fields:', availableCustomFields);
        
        // Clear existing custom fields
        clearCustomFields();
        
        // Create form elements for each custom field
        if (availableCustomFields.length > 0) {
            renderCustomFields();
        }
        
        return availableCustomFields;
    } catch (error) {
        console.error('Failed to load custom fields:', error);
        return [];
    }
}

function clearCustomFields() {
    // Remove existing custom field elements
    Object.values(customFieldElements).forEach(element => {
        if (element && element.parentNode) {
            element.parentNode.removeChild(element);
        }
    });
    customFieldElements = {};
}

function renderCustomFields() {
    // Add custom fields to summary modal
    const summaryModal = elements.summaryModal;
    const insertPoint = summaryModal.querySelector('#billable-option-container');
    
    availableCustomFields.forEach(field => {
        const fieldElement = createCustomFieldElement(field);
        customFieldElements[field.id] = fieldElement;
        
        // Insert before billable options
        if (insertPoint && insertPoint.parentNode) {
            insertPoint.parentNode.insertBefore(fieldElement, insertPoint);
        }
    });
}

function createCustomFieldElement(field: CustomField): HTMLElement {
    const container = document.createElement('div');
    container.className = 'form-group custom-field-group';
    container.dataset.fieldId = field.id.toString();
    
    const label = document.createElement('label');
    label.textContent = field.name;
    if (field.required || field.is_required) {
        label.innerHTML += ' <span class="required">*</span>';
    }
    
    let input: HTMLElement;
    
    switch (field.field_format) {
        case 'list':
            input = document.createElement('select');
            input.className = 'control';
            
            // Add default option
            const defaultOption = document.createElement('option');
            defaultOption.value = '';
            defaultOption.textContent = `-- Select ${field.name} --`;
            input.appendChild(defaultOption);
            
            // Add possible values
            if (field.possible_values) {
                field.possible_values.forEach(value => {
                    const option = document.createElement('option');
                    option.value = value;
                    option.textContent = value;
                    input.appendChild(option);
                });
            }
            break;
            
        case 'bool':
            const checkboxContainer = document.createElement('div');
            checkboxContainer.className = 'checkbox-container';
            
            input = document.createElement('input');
            input.setAttribute('type', 'checkbox');
            input.className = 'custom-field-checkbox';
            
            const checkboxLabel = document.createElement('label');
            checkboxLabel.textContent = field.name;
            
            checkboxContainer.appendChild(input);
            checkboxContainer.appendChild(checkboxLabel);
            
            container.appendChild(checkboxContainer);
            return container;
            
        case 'text':
            input = document.createElement('textarea');
            input.className = 'control';
            (input as HTMLTextAreaElement).rows = 3;
            break;
            
        case 'float':
        case 'int':
            input = document.createElement('input');
            input.setAttribute('type', 'number');
            input.className = 'control';
            if (field.field_format === 'float') {
                input.setAttribute('step', '0.01');
            }
            break;
            
        default: // string and others
            input = document.createElement('input');
            input.setAttribute('type', 'text');
            input.className = 'control';
            break;
    }
    
    input.id = `custom-field-${field.id}`;
    
    // Set default value if available
    if (field.default_value) {
        if (input.tagName === 'INPUT' && input.getAttribute('type') === 'checkbox') {
            (input as HTMLInputElement).checked = field.default_value === '1' || field.default_value.toLowerCase() === 'true';
        } else {
            (input as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value = field.default_value;
        }
    }
    
    container.appendChild(label);
    container.appendChild(input);
    
    return container;
}

export function getCustomFieldValues(): { [key: number]: string } {
    const values: { [key: number]: string } = {};
    
    availableCustomFields.forEach(field => {
        const element = document.getElementById(`custom-field-${field.id}`);
        if (element) {
            if (element.tagName === 'INPUT' && (element as HTMLInputElement).type === 'checkbox') {
                values[field.id] = (element as HTMLInputElement).checked ? '1' : '0';
            } else {
                values[field.id] = (element as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value || '';
            }
        }
    });
    
    return values;
}

export function resetCustomFields() {
    availableCustomFields.forEach(field => {
        const element = document.getElementById(`custom-field-${field.id}`);
        if (element) {
            if (element.tagName === 'INPUT' && (element as HTMLInputElement).type === 'checkbox') {
                (element as HTMLInputElement).checked = false;
            } else {
                (element as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value = field.default_value || '';
            }
        }
    });
}

export function getAvailableCustomFields(): CustomField[] {
    return availableCustomFields;
}

// Initialize custom fields when module loads
export function initializeCustomFields() {
    return loadCustomFields();
}
