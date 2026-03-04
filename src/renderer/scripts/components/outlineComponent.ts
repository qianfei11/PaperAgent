// src/renderer/scripts/components/outlineComponent.ts

import type { OutlineItem } from '../../../shared/types.js';

export class OutlineComponent {
  private container: HTMLElement;
  private outlineData: OutlineItem[];

  constructor(containerId: string) {
    this.container = document.getElementById(containerId) as HTMLElement;
    this.outlineData = [];
    
    if (!this.container) {
      throw new Error(`Element with id "${containerId}" not found.`);
    }
  }

  public setData(outlineData: OutlineItem[]): void {
    this.outlineData = outlineData;
    this.render();
  }

  public render(): void {
    if (this.outlineData.length === 0) {
      this.container.innerHTML = '<p>暂无大纲内容</p>';
      return;
    }

    this.container.innerHTML = '';
    const outlineFragment = this.buildOutlineTree(this.outlineData, 0);
    this.container.appendChild(outlineFragment);
  }

  private buildOutlineTree(items: OutlineItem[], level: number): DocumentFragment {
    const fragment = document.createDocumentFragment();

    items.forEach(item => {
      const outlineItemElement = this.createOutlineItemElement(item, level);
      fragment.appendChild(outlineItemElement);

      // 如果有子项，则渲染子项
      if (item.children && item.children.length > 0) {
        const childFragment = this.buildOutlineTree(item.children, level + 1);
        outlineItemElement.appendChild(childFragment);
      }
    });

    return fragment;
  }

  private createOutlineItemElement(item: OutlineItem, level: number): HTMLElement {
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

    // 添加点击事件来查看详细信息
    outlineItem.addEventListener('click', (e) => {
      // 防止点击子元素时冒泡
      if ((e.target as HTMLElement).classList.contains('outline-item') || 
          (e.target as HTMLElement).classList.contains('outline-item-title') ||
          (e.target as HTMLElement).classList.contains('outline-item-summary')) {
        this.onItemClick(item);
      }
    });

    return outlineItem;
  }

  private onItemClick(item: OutlineItem): void {
    // 在实际实现中，这里会显示大纲项的详细信息
    console.log('Outline item clicked:', item);
    
    // 可以触发一个自定义事件
    const event = new CustomEvent('outline-item-clicked', {
      detail: { item }
    });
    document.dispatchEvent(event);
  }

  public addItem(item: OutlineItem, parentId: string | null = null): void {
    if (parentId) {
      // 添加到指定父项下
      this.addToParent(this.outlineData, parentId, item);
    } else {
      // 添加到顶层
      this.outlineData.push(item);
    }
    this.render();
  }

  private addToParent(items: OutlineItem[], parentId: string, newItem: OutlineItem): boolean {
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

  public updateItem(id: string, updates: Partial<OutlineItem>): void {
    const updateRecursively = (items: OutlineItem[]): OutlineItem[] => {
      return items.map(item => {
        if (item.id === id) {
          return { ...item, ...updates } as OutlineItem;
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

  public removeItem(id: string): boolean {
    const removeRecursively = (items: OutlineItem[]): { items: OutlineItem[], removed: boolean } => {
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