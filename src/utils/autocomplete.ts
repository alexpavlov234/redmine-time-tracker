export function initAutocomplete<T extends { id: number | string }>(options: {
    inputEl: HTMLInputElement,
    listEl: HTMLDivElement,
    sourceData: T[],
    renderItem: (item: T) => string,
    filterItem: (item: T, query: string) => boolean,
    onSelect: (item: T) => void
}) {
    const { inputEl, listEl, sourceData, renderItem, filterItem, onSelect } = options;
    let activeIndex = -1;

    const renderList = (items: T[]) => {
        listEl.innerHTML = '';
        if (items.length === 0) {
            listEl.style.display = 'none';
            return;
        }
        items.forEach((item, index) => {
            const div = document.createElement('div');
            div.innerHTML = renderItem(item);
            div.dataset.index = String(index);
            div.addEventListener('mousedown', (e) => {
                e.preventDefault();
                onSelect(item);
                listEl.style.display = 'none';
            });
            listEl.appendChild(div);
        });
        listEl.style.display = 'block';
        activeIndex = -1;
    };
    
    inputEl.addEventListener('input', () => {
        const query = inputEl.value.toLowerCase();
        const filtered = sourceData.filter(item => filterItem(item, query));
        renderList(filtered);
    });

    inputEl.addEventListener('blur', () => {
        setTimeout(() => {
            listEl.style.display = 'none';
        }, 150);
    });

    inputEl.addEventListener('keydown', e => {
        const items = Array.from(listEl.children) as HTMLElement[];
        if (items.length === 0) return;

        switch (e.key) {
            case 'ArrowDown':
                activeIndex = (activeIndex + 1) % items.length;
                break;
            case 'ArrowUp':
                activeIndex = (activeIndex - 1 + items.length) % items.length;
                break;
            case 'Enter':
                e.preventDefault();
                if (activeIndex > -1) {
                    items[activeIndex].dispatchEvent(new Event('mousedown'));
                }
                return;
            case 'Escape':
                listEl.style.display = 'none';
                return;
            default:
                return;
        }
        
        items.forEach(item => item.classList.remove('autocomplete-active'));
        if(activeIndex > -1) {
            items[activeIndex].classList.add('autocomplete-active');
            items[activeIndex].scrollIntoView({ block: 'nearest' });
        }
    });
}
