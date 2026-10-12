import { create } from 'zustand';

interface InteractionDrawerState {
  isOpen: boolean;
  isFollowUp: boolean;
  followUpActionId: number | null;
  selectedCubId: string;
  selectedCubFirstName: string;
  selectedCubLastName: string;
  selectedParentFirstName: string;
  selectedParentLastName: string;
  openDrawer: (options?: {
    cubId?: string;
    cubFirstName?: string;
    cubLastName?: string;
    parentFirstName?: string;
    parentLastName?: string;
    isFollowUp?: boolean;
    followUpActionId?: number;
  }) => void;
  closeDrawer: () => void;
}

export const useInteractionStore = create<InteractionDrawerState>((set) => ({
  isOpen: false,
  isFollowUp: false,
  followUpActionId: null,
  selectedCubId: '',
  selectedCubFirstName: '',
  selectedCubLastName: '',
  selectedParentFirstName: '',
  selectedParentLastName: '',
  openDrawer: (options = {}) =>
    set({
      isOpen: true,
      isFollowUp: options.isFollowUp || false,
      followUpActionId: options.followUpActionId || null,
      selectedCubId: options.cubId || '',
      selectedCubFirstName: options.cubFirstName || '',
      selectedCubLastName: options.cubLastName || '',
      selectedParentFirstName: options.parentFirstName || '',
      selectedParentLastName: options.parentLastName || '',
    }),
  closeDrawer: () =>
    set({
      isOpen: false,
      isFollowUp: false,
      followUpActionId: null,
      selectedCubId: '',
      selectedCubFirstName: '',
      selectedCubLastName: '',
      selectedParentFirstName: '',
      selectedParentLastName: '',
    }),
}));
