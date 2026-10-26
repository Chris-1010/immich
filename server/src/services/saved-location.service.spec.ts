import { BadRequestException } from '@nestjs/common';
import { LocationSearchResultType, Permission, PersonDetailDatePrecision, PersonDetailKind } from 'src/enum';
import { PersonPlace, SavedLocation } from 'src/repositories/saved-location.repository';
import { SavedLocationService } from 'src/services/saved-location.service';
import { authStub } from 'test/fixtures/auth.stub';
import { newTestService, ServiceMocks } from 'test/utils';

const location = (overrides: Partial<SavedLocation> = {}): SavedLocation => ({
  id: 'location-1',
  name: "Gran's house",
  latitude: 53.3,
  longitude: -6.26,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  ...overrides,
});

const personPlace = (overrides: Partial<PersonPlace> = {}): PersonPlace => ({
  detailId: 'detail-1',
  personId: 'person-1',
  personName: 'Ethan',
  personUpdatedAt: new Date('2026-02-01T00:00:00.000Z'),
  personIsHidden: false,
  kind: PersonDetailKind.Home,
  key: 'Home',
  value: 'Rathmines',
  latitude: 53.32,
  longitude: -6.26,
  since: null,
  sincePrecision: null,
  until: null,
  untilPrecision: null,
  ...overrides,
});

const geoPlace = {
  id: 1,
  name: 'Cork',
  latitude: 51.9,
  longitude: -8.47,
  admin1Name: 'Munster',
  admin2Name: 'County Cork',
  countryCode: 'IE',
  admin1Code: null,
  admin2Code: null,
  alternateNames: null,
  modificationDate: new Date(),
};

describe(SavedLocationService.name, () => {
  let sut: SavedLocationService;
  let mocks: ServiceMocks;

  beforeEach(() => {
    ({ sut, mocks } = newTestService(SavedLocationService));
    mocks.savedLocation.search.mockResolvedValue([]);
    mocks.savedLocation.searchPeoplesPlaces.mockResolvedValue([]);
    mocks.search.searchPlaces.mockResolvedValue([]);
  });

  describe('create', () => {
    it('stores a trimmed name against the caller', async () => {
      mocks.savedLocation.create.mockResolvedValue([location()]);

      await sut.create(authStub.admin, { name: "  Gran's house ", latitude: 53.3, longitude: -6.26 });

      expect(mocks.savedLocation.create).toHaveBeenCalledWith([
        { ownerId: authStub.admin.user.id, name: "Gran's house", latitude: 53.3, longitude: -6.26 },
      ]);
    });

    it('refuses a name that is blank once trimmed', async () => {
      await expect(sut.create(authStub.admin, { name: '   ', latitude: 0, longitude: 0 })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(mocks.savedLocation.create).not.toHaveBeenCalled();
    });
  });

  describe('createAll', () => {
    it('skips exact duplicates of stored locations and of earlier entries in the batch', async () => {
      mocks.savedLocation.getAll.mockResolvedValue([location()]);
      mocks.savedLocation.create.mockResolvedValue([]);

      await sut.createAll(authStub.admin, {
        locations: [
          // Already stored, apart from surrounding spaces.
          { name: " Gran's house", latitude: 53.3, longitude: -6.26 },
          // Same name, a different pin: a different location.
          { name: "Gran's house", latitude: 53.31, longitude: -6.26 },
          { name: 'Beach', latitude: 52, longitude: -9 },
          { name: 'Beach', latitude: 52, longitude: -9 },
          { name: '  ', latitude: 1, longitude: 1 },
        ],
      });

      expect(mocks.savedLocation.create).toHaveBeenCalledWith([
        { ownerId: authStub.admin.user.id, name: "Gran's house", latitude: 53.31, longitude: -6.26 },
        { ownerId: authStub.admin.user.id, name: 'Beach', latitude: 52, longitude: -9 },
      ]);
    });

    it('writes nothing when every entry is already stored', async () => {
      mocks.savedLocation.getAll.mockResolvedValue([location()]);

      const result = await sut.createAll(authStub.admin, {
        locations: [{ name: "Gran's house", latitude: 53.3, longitude: -6.26 }],
      });

      expect(mocks.savedLocation.create).not.toHaveBeenCalled();
      expect(result).toEqual([expect.objectContaining({ id: 'location-1' })]);
    });

    it('reads only the caller’s locations to deduplicate against', async () => {
      mocks.savedLocation.getAll.mockResolvedValue([]);
      mocks.savedLocation.create.mockResolvedValue([]);

      await sut.createAll(authStub.user1, { locations: [{ name: 'Beach', latitude: 52, longitude: -9 }] });

      expect(mocks.savedLocation.getAll).toHaveBeenCalledWith(authStub.user1.user.id);
      expect(mocks.savedLocation.create).toHaveBeenCalledWith([
        expect.objectContaining({ ownerId: authStub.user1.user.id }),
      ]);
    });
  });

  describe('update', () => {
    it('requires access to the location', async () => {
      mocks.access.savedLocation.checkOwnerAccess.mockResolvedValue(new Set());

      await expect(sut.update(authStub.admin, 'location-1', { name: 'Home' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(mocks.access.savedLocation.checkOwnerAccess).toHaveBeenCalledWith(
        authStub.admin.user.id,
        new Set(['location-1']),
      );
      expect(mocks.savedLocation.update).not.toHaveBeenCalled();
    });

    it('renames with the name trimmed', async () => {
      mocks.access.savedLocation.checkOwnerAccess.mockResolvedValue(new Set(['location-1']));
      mocks.savedLocation.update.mockResolvedValue(location({ name: 'Home' }));

      await sut.update(authStub.admin, 'location-1', { name: ' Home ' });

      expect(mocks.savedLocation.update).toHaveBeenCalledWith('location-1', {
        name: 'Home',
        latitude: undefined,
        longitude: undefined,
      });
    });

    it('refuses half a move', async () => {
      mocks.access.savedLocation.checkOwnerAccess.mockResolvedValue(new Set(['location-1']));

      await expect(sut.update(authStub.admin, 'location-1', { latitude: 1 })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('remove', () => {
    it('requires access to the location', async () => {
      mocks.access.savedLocation.checkOwnerAccess.mockResolvedValue(new Set());

      await expect(sut.remove(authStub.admin, 'location-1')).rejects.toBeInstanceOf(BadRequestException);
      expect(mocks.savedLocation.delete).not.toHaveBeenCalled();
    });

    it('deletes an owned location', async () => {
      mocks.access.savedLocation.checkOwnerAccess.mockResolvedValue(new Set(['location-1']));
      mocks.savedLocation.delete.mockResolvedValue();

      await sut.remove(authStub.admin, 'location-1');

      expect(mocks.savedLocation.delete).toHaveBeenCalledWith('location-1');
    });
  });

  describe('search', () => {
    it('orders saved locations, then people’s places, then GeoNames places', async () => {
      mocks.savedLocation.search.mockResolvedValue([location()]);
      mocks.savedLocation.searchPeoplesPlaces.mockResolvedValue([
        personPlace(),
        personPlace({
          detailId: 'detail-2',
          value: 'Cork',
          since: new Date('2015-01-01T00:00:00.000Z'),
          sincePrecision: PersonDetailDatePrecision.Year,
          until: new Date('2021-01-01T00:00:00.000Z'),
          untilPrecision: PersonDetailDatePrecision.Year,
        }),
      ]);
      mocks.search.searchPlaces.mockResolvedValue([geoPlace]);

      const result = await sut.search(authStub.admin, { query: 'co' });

      expect(result.map(({ type }) => type)).toEqual([
        LocationSearchResultType.Saved,
        LocationSearchResultType.Person,
        LocationSearchResultType.Person,
        LocationSearchResultType.Place,
      ]);
      expect(result[1]).toEqual({
        type: LocationSearchResultType.Person,
        person: expect.objectContaining({ personId: 'person-1', isCurrent: true, since: null }),
      });
      expect(result[2].person).toEqual(
        expect.objectContaining({ isCurrent: false, since: '2015-01-01', until: '2021-01-01' }),
      );
      expect(result[3]).toEqual({
        type: LocationSearchResultType.Place,
        place: { name: 'Cork', latitude: 51.9, longitude: -8.47, admin1name: 'Munster', admin2name: 'County Cork' },
      });
    });

    it('scopes every source to the caller and passes the trimmed query through', async () => {
      await sut.search(authStub.user1, { query: '  rath ' });

      expect(mocks.savedLocation.search).toHaveBeenCalledWith(authStub.user1.user.id, 'rath', expect.any(Number));
      expect(mocks.savedLocation.searchPeoplesPlaces).toHaveBeenCalledWith(authStub.user1.user.id, {
        query: 'rath',
        currentOnly: false,
        limit: expect.any(Number),
      });
      expect(mocks.search.searchPlaces).toHaveBeenCalledWith('rath');
    });

    it('returns saved locations and current people’s places only when nothing is typed', async () => {
      await sut.search(authStub.admin, { query: '   ' });

      expect(mocks.savedLocation.search).toHaveBeenCalledWith(authStub.admin.user.id, undefined, expect.any(Number));
      expect(mocks.savedLocation.searchPeoplesPlaces).toHaveBeenCalledWith(authStub.admin.user.id, {
        query: undefined,
        currentOnly: true,
        limit: expect.any(Number),
      });
      expect(mocks.search.searchPlaces).not.toHaveBeenCalled();
    });

    it('leaves people’s places out for an API key without person detail access', async () => {
      const auth = { ...authStub.admin, apiKey: { id: 'key-1', permissions: [Permission.SavedLocationRead] } };
      mocks.savedLocation.search.mockResolvedValue([location()]);

      const result = await sut.search(auth, { query: 'gran' });

      expect(mocks.savedLocation.searchPeoplesPlaces).not.toHaveBeenCalled();
      expect(result).toHaveLength(1);
    });
  });
});
