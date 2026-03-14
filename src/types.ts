export type SidebarMode = 'explorer' | 'scm';

export interface TabDescriptor {
  kind: 'text' | 'diff' | 'other' | 'gitChange';
  uri?: string;
  originalUri?: string;
  modifiedUri?: string;
  label: string;
  viewColumn: number;
  isPinned: boolean;
  isActive: boolean;
  isDirty: boolean;
}

export interface ModeState {
  tabs: TabDescriptor[];
  activeTabLabel?: string;
}
