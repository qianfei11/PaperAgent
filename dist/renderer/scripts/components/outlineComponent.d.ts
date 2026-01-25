import { OutlineItem } from '../../../shared/types';
export declare class OutlineComponent {
    private container;
    private outlineData;
    constructor(containerId: string);
    setData(outlineData: OutlineItem[]): void;
    render(): void;
    private buildOutlineTree;
    private createOutlineItemElement;
    private onItemClick;
    addItem(item: OutlineItem, parentId?: string | null): void;
    private addToParent;
    updateItem(id: string, updates: Partial<OutlineItem>): void;
    removeItem(id: string): boolean;
}
//# sourceMappingURL=outlineComponent.d.ts.map