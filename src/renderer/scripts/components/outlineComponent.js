export class OutlineComponent {
    container;
    outlineData;
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.outlineData = [];
        if (!this.container) {
            throw new Error(`Element with id "${containerId}" not found.`);
        }
    }
    setData(outlineData) {
        this.outlineData = outlineData;
        this.render();
    }
    render() {
        if (this.outlineData.length === 0) {
            this.container.innerHTML = '<p>No outline yet.</p>';
            return;
        }
        this.container.innerHTML = '';
        const outlineFragment = this.buildOutlineTree(this.outlineData, 0);
        this.container.appendChild(outlineFragment);
    }
    buildOutlineTree(items, level) {
        const fragment = document.createDocumentFragment();
        items.forEach(item => {
            const outlineItemElement = this.createOutlineItemElement(item, level);
            fragment.appendChild(outlineItemElement);
            if (item.children && item.children.length > 0) {
                const childFragment = this.buildOutlineTree(item.children, level + 1);
                outlineItemElement.appendChild(childFragment);
            }
        });
        return fragment;
    }
    createOutlineItemElement(item, level) {
        const outlineItem = document.createElement('div');
        outlineItem.classList.add('outline-item', `level-${level}`);
        outlineItem.dataset.id = item.id;
        const titleDiv = document.createElement('div');
        titleDiv.classList.add('outline-item-title');
        titleDiv.textContent = item.title;
        const summaryDiv = document.createElement('div');
        summaryDiv.classList.add('outline-item-summary');
        summaryDiv.textContent = item.summary;
        outlineItem.appendChild(titleDiv);
        outlineItem.appendChild(summaryDiv);
        outlineItem.addEventListener('click', (e) => {
            if (e.target.classList.contains('outline-item') ||
                e.target.classList.contains('outline-item-title') ||
                e.target.classList.contains('outline-item-summary')) {
                this.onItemClick(item);
            }
        });
        return outlineItem;
    }
    onItemClick(item) {
        console.log('Outline item clicked:', item);
        const event = new CustomEvent('outline-item-clicked', {
            detail: { item }
        });
        document.dispatchEvent(event);
    }
    addItem(item, parentId = null) {
        if (parentId) {
            this.addToParent(this.outlineData, parentId, item);
        }
        else {
            this.outlineData.push(item);
        }
        this.render();
    }
    addToParent(items, parentId, newItem) {
        for (const item of items) {
            if (item.id === parentId) {
                if (!item.children) {
                    item.children = [];
                }
                item.children.push(newItem);
                return true;
            }
            if (item.children) {
                const found = this.addToParent(item.children, parentId, newItem);
                if (found) {
                    return true;
                }
            }
        }
        return false;
    }
    updateItem(id, updates) {
        const updateRecursively = (items) => {
            return items.map(item => {
                if (item.id === id) {
                    return { ...item, ...updates };
                }
                if (item.children) {
                    return { ...item, children: updateRecursively(item.children) };
                }
                return item;
            });
        };
        this.outlineData = updateRecursively(this.outlineData);
        this.render();
    }
    removeItem(id) {
        const removeRecursively = (items) => {
            const filteredItems = items.filter(item => item.id !== id);
            let anyRemoved = filteredItems.length !== items.length;
            const updatedItems = filteredItems.map(item => {
                if (item.children) {
                    const result = removeRecursively(item.children);
                    if (result.removed) {
                        anyRemoved = true;
                        return { ...item, children: result.items };
                    }
                }
                return item;
            });
            return { items: updatedItems, removed: anyRemoved };
        };
        const result = removeRecursively(this.outlineData);
        this.outlineData = result.items;
        this.render();
        return result.removed;
    }
}
//# sourceMappingURL=outlineComponent.js.map
