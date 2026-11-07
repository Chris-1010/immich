import { BadRequestException, Injectable } from '@nestjs/common';
import { AuthDto } from 'src/dtos/auth.dto';
import {
  LocationSearchDto,
  LocationSearchResultDto,
  mapPersonPlace,
  mapSavedLocation,
  SavedLocationCreateDto,
  SavedLocationResponseDto,
  SavedLocationsBulkCreateDto,
  SavedLocationUpdateDto,
} from 'src/dtos/saved-location.dto';
import { mapPlaces } from 'src/dtos/search.dto';
import { LocationSearchResultType, Permission } from 'src/enum';
import { BaseService } from 'src/services/base.service';
import { isGranted } from 'src/utils/access';

/**
 * How many rows each source contributes to one search. The picker shows the three as one list, so
 * a cap per source keeps a long list of saved pins from pushing every person and place off the end.
 * GeoNames caps itself at the same number.
 */
const SAVED_LIMIT = 20;
const PERSON_LIMIT = 20;

/** The key the import compares on: an exact match of the trimmed name and both coordinates. */
const importKey = ({ name, latitude, longitude }: { name: string; latitude: number; longitude: number }) =>
  JSON.stringify([name.trim(), latitude, longitude]);

@Injectable()
export class SavedLocationService extends BaseService {
  async getAll(auth: AuthDto): Promise<SavedLocationResponseDto[]> {
    const locations = await this.savedLocationRepository.getAll(auth.user.id);
    return locations.map((location) => mapSavedLocation(location));
  }

  async create(auth: AuthDto, dto: SavedLocationCreateDto): Promise<SavedLocationResponseDto> {
    const name = this.requireName(dto.name);
    const [location] = await this.savedLocationRepository.create([
      { ownerId: auth.user.id, name, latitude: dto.latitude, longitude: dto.longitude },
    ]);
    return mapSavedLocation(location);
  }

  /**
   * The one-off move out of browser storage. Anything already stored under the same trimmed name and
   * coordinates is skipped, as is a repeat within the batch itself, so sending the same batch twice
   * leaves the table as the first send did. A name blank once trimmed is dropped rather than
   * refused: the import runs silently, and one bad entry should not cost the user the rest.
   *
   * Returns every saved location the user now has, so the client can replace its list in one go.
   */
  async createAll(auth: AuthDto, dto: SavedLocationsBulkCreateDto): Promise<SavedLocationResponseDto[]> {
    const existing = await this.savedLocationRepository.getAll(auth.user.id);
    const seen = new Set(existing.map((location) => importKey(location)));

    const toInsert = [];
    for (const location of dto.locations) {
      const name = location.name.trim();
      const key = importKey(location);
      if (!name || seen.has(key)) {
        continue;
      }

      seen.add(key);
      toInsert.push({ ownerId: auth.user.id, name, latitude: location.latitude, longitude: location.longitude });
    }

    if (toInsert.length === 0) {
      return existing.map((location) => mapSavedLocation(location));
    }

    await this.savedLocationRepository.create(toInsert);
    return this.getAll(auth);
  }

  async update(auth: AuthDto, id: string, dto: SavedLocationUpdateDto): Promise<SavedLocationResponseDto> {
    await this.requireAccess({ auth, permission: Permission.SavedLocationUpdate, ids: [id] });

    // A pin is moved by both coordinates at once; half a move would land somewhere nobody chose.
    if ((dto.latitude === undefined) !== (dto.longitude === undefined)) {
      throw new BadRequestException('Latitude and longitude must be updated together');
    }

    if (dto.name === undefined && dto.latitude === undefined) {
      throw new BadRequestException('Nothing to update');
    }

    const location = await this.savedLocationRepository.update(id, {
      name: dto.name === undefined ? undefined : this.requireName(dto.name),
      latitude: dto.latitude,
      longitude: dto.longitude,
    });
    return mapSavedLocation(location);
  }

  async remove(auth: AuthDto, id: string): Promise<void> {
    await this.requireAccess({ auth, permission: Permission.SavedLocationDelete, ids: [id] });
    await this.savedLocationRepository.delete(id);
  }

  /**
   * The picker's one search: saved locations, then people's places (Current, then Past), then
   * GeoNames places, as a single ordered list.
   *
   * With nothing typed there is no name to look a GeoNames place up by and no reason yet to dig up
   * where people used to live, so only the saved locations and Current places come back — enough to
   * pick a familiar place without typing.
   *
   * People's places are read from person details, which an API key may not have been granted. Such
   * a key gets saved locations and GeoNames places only, rather than an error for asking.
   */
  async search(auth: AuthDto, dto: LocationSearchDto): Promise<LocationSearchResultDto[]> {
    const query = dto.query?.trim() || undefined;
    const withPeople =
      !auth.apiKey || isGranted({ requested: [Permission.PersonDetailRead], current: auth.apiKey.permissions });

    const [saved, people, places] = await Promise.all([
      this.savedLocationRepository.search(auth.user.id, query, SAVED_LIMIT),
      withPeople
        ? this.savedLocationRepository.searchPeoplesPlaces(auth.user.id, {
            query,
            currentOnly: !query,
            limit: PERSON_LIMIT,
          })
        : [],
      query ? this.searchRepository.searchPlaces(query) : [],
    ]);

    return [
      ...saved.map((location) => ({ type: LocationSearchResultType.Saved, saved: mapSavedLocation(location) })),
      ...people.map((place) => ({ type: LocationSearchResultType.Person, person: mapPersonPlace(place) })),
      ...places.map((place) => ({ type: LocationSearchResultType.Place, place: mapPlaces(place) })),
    ];
  }

  private requireName(name: string) {
    const trimmed = name.trim();
    if (!trimmed) {
      throw new BadRequestException('Name must not be blank');
    }
    return trimmed;
  }
}
