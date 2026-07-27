import type { PersonPageViewMode } from '$lib/constants';
import { createContext } from '$lib/utils/context';
import type { PersonResponseDto } from '@immich/sdk';

export interface PersonPageContext {
  // Wrap values in functions, because context isn't reactive.
  getPerson: () => PersonResponseDto;
  setPerson: (person: PersonResponseDto) => void;
  getViewMode: () => PersonPageViewMode;
  setViewMode: (viewMode: PersonPageViewMode) => void;
  getPreviousRoute: () => string;
  refreshAssetCount: () => Promise<void>;
}

const { get: getPersonPageContext, set: setPersonPageContext } = createContext<PersonPageContext>('person-page');

export { getPersonPageContext, setPersonPageContext };
