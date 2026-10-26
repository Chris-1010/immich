import { BadRequestException } from '@nestjs/common';
import { PersonDetailDatePrecision, PersonDetailKind } from 'src/enum';
import { AlongWith, AlongWithPerson, detailKeyToken, PersonDetail } from 'src/repositories/person-detail.repository';
import { PersonDetailService } from 'src/services/person-detail.service';
import { authStub } from 'test/fixtures/auth.stub';
import { newTestService, ServiceMocks } from 'test/utils';

const detail = (overrides: Partial<PersonDetail> = {}): PersonDetail => ({
  id: 'detail-1',
  key: 'Works at',
  value: 'Intel',
  sortOrder: 0,
  createdAt: new Date('2024-09-03T00:00:00.000Z'),
  since: null,
  sincePrecision: null,
  until: null,
  untilPrecision: null,
  kind: null,
  latitude: null,
  longitude: null,
  subdetails: [],
  ...overrides,
});

const coHolder = (id: string): AlongWithPerson => ({
  id,
  name: id,
  matchedKeys: ['works at'],
  matchedSubKeys: [],
  matchedSubValues: [],
});

describe(PersonDetailService.name, () => {
  let sut: PersonDetailService;
  let mocks: ServiceMocks;

  beforeEach(() => {
    ({ sut, mocks } = newTestService(PersonDetailService));
    mocks.access.person.checkOwnerAccess.mockImplementation((_, ids) => Promise.resolve(new Set(ids)));
    mocks.personDetail.addForPeople.mockResolvedValue();
  });

  it('should be defined', () => {
    expect(sut).toBeDefined();
  });

  describe('getDetails', () => {
    it('should return dates and split along-with into current and past', async () => {
      const group: AlongWith = {
        key: 'works at',
        value: 'intel',
        current: { total: 3, people: [coHolder('person-a')] },
        past: { total: 1, people: [coHolder('person-b')] },
      };
      mocks.personDetail.getForPerson.mockResolvedValue([
        detail({
          since: new Date('2019-03-01'),
          sincePrecision: PersonDetailDatePrecision.Month,
          until: new Date('2026-01-01'),
          untilPrecision: PersonDetailDatePrecision.Year,
        }),
      ]);
      mocks.personDetail.getAlongWith.mockResolvedValue([group]);

      const [result] = await sut.getDetails(authStub.admin, 'person-1');

      expect(result).toMatchObject({
        since: '2019-03-01',
        sincePrecision: 'month',
        until: '2026-01-01',
        untilPrecision: 'year',
        alongWith: {
          current: { total: 3, people: [{ id: 'person-a', sharedKeys: [], sharedSubdetails: [] }] },
          past: { total: 1, people: [{ id: 'person-b' }] },
        },
      });
    });

    it('should match a kind row on its kind and a free-text row on its key, never each other', async () => {
      const homeToken = detailKeyToken({ kind: PersonDetailKind.Home, key: '' });
      const kindGroup: AlongWith = {
        key: homeToken,
        value: 'rathmines',
        current: { total: 1, people: [{ ...coHolder('neighbour'), matchedKeys: [homeToken, 'works at'] }] },
        past: { total: 0, people: [] },
      };
      const textGroup: AlongWith = {
        key: 'home',
        value: 'rathmines',
        current: { total: 1, people: [{ ...coHolder('free-text'), matchedKeys: ['home'] }] },
        past: { total: 0, people: [] },
      };
      mocks.personDetail.getForPerson.mockResolvedValue([
        detail({ id: 'kind-row', key: 'Baile', value: 'Rathmines', kind: PersonDetailKind.Home }),
        detail({ id: 'text-row', key: 'Home', value: 'Rathmines' }),
        detail({ id: 'work-row', key: 'Works at', value: 'Intel' }),
      ]);
      mocks.personDetail.getAlongWith.mockResolvedValue([kindGroup, textGroup]);

      const [kindRow, textRow] = await sut.getDetails(authStub.admin, 'person-1');

      expect(kindRow).toMatchObject({
        kind: PersonDetailKind.Home,
        alongWith: { current: { people: [{ id: 'neighbour', sharedKeys: ['Works at'] }] } },
      });
      expect(textRow).toMatchObject({
        kind: null,
        alongWith: { current: { people: [{ id: 'free-text', sharedKeys: [] }] } },
      });
    });

    it('should return a pin with its detail', async () => {
      mocks.personDetail.getForPerson.mockResolvedValue([
        detail({ kind: PersonDetailKind.Home, key: 'Home', value: 'Rathmines', latitude: 53.32, longitude: -6.26 }),
      ]);
      mocks.personDetail.getAlongWith.mockResolvedValue([]);

      const [result] = await sut.getDetails(authStub.admin, 'person-1');

      expect(result).toMatchObject({ kind: 'home', latitude: 53.32, longitude: -6.26 });
      expect(result.subdetails).toEqual([]);
    });

    it('should return empty halves for a detail nobody else holds', async () => {
      mocks.personDetail.getForPerson.mockResolvedValue([detail()]);
      mocks.personDetail.getAlongWith.mockResolvedValue([]);

      const [result] = await sut.getDetails(authStub.admin, 'person-1');

      expect(result.alongWith).toEqual({ current: { total: 0, people: [] }, past: { total: 0, people: [] } });
      expect(result.since).toBeNull();
      expect(result.until).toBeNull();
    });
  });

  describe('updateDetails', () => {
    beforeEach(() => {
      mocks.personDetail.replaceForPerson.mockResolvedValue([]);
      mocks.personDetail.getAlongWith.mockResolvedValue([]);
    });

    it('should keep an archived row alongside its replacement', async () => {
      mocks.personDetail.getForPerson.mockResolvedValue([
        detail({ subdetails: [{ id: 'sub-1', key: 'Role', value: 'Engineer', sortOrder: 0 }] }),
      ]);

      await sut.updateDetails(authStub.admin, 'person-1', {
        details: [
          { key: 'Works at', value: 'Google' },
          {
            id: 'detail-1',
            key: 'Works at',
            value: 'Intel',
            until: '2026-10-26',
            untilPrecision: PersonDetailDatePrecision.Month,
            subdetails: [{ id: 'sub-1', key: 'Role', value: 'Engineer' }],
          },
        ],
      });

      expect(mocks.personDetail.replaceForPerson).toHaveBeenCalledWith(authStub.admin.user.id, 'person-1', [
        expect.objectContaining({ id: undefined, value: 'Google', until: null, untilPrecision: null }),
        expect.objectContaining({
          id: 'detail-1',
          value: 'Intel',
          until: '2026-10-01',
          untilPrecision: PersonDetailDatePrecision.Month,
          subdetails: [{ id: 'sub-1', key: 'Role', value: 'Engineer' }],
        }),
      ]);
    });

    it('should snap dates to the start of their period and default the precision to month', async () => {
      mocks.personDetail.getForPerson.mockResolvedValue([]);

      await sut.updateDetails(authStub.admin, 'person-1', {
        details: [
          { key: 'Hometown', value: 'Cork', since: '2019-07-15', sincePrecision: PersonDetailDatePrecision.Year },
          { key: 'Works at', value: 'Intel', since: '2020-05-20' },
          { key: 'School', value: 'CBC', sincePrecision: PersonDetailDatePrecision.Year },
        ],
      });

      expect(mocks.personDetail.replaceForPerson).toHaveBeenCalledWith(authStub.admin.user.id, 'person-1', [
        expect.objectContaining({ since: '2019-01-01', sincePrecision: PersonDetailDatePrecision.Year }),
        expect.objectContaining({ since: '2020-05-01', sincePrecision: PersonDetailDatePrecision.Month }),
        expect.objectContaining({ since: null, sincePrecision: null }),
      ]);
    });

    it('should reject a detail that ends before it began', async () => {
      mocks.personDetail.getForPerson.mockResolvedValue([]);

      await expect(
        sut.updateDetails(authStub.admin, 'person-1', {
          details: [{ key: 'Works at', value: 'Intel', since: '2020-05-01', until: '2019-05-01' }],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(mocks.personDetail.replaceForPerson).not.toHaveBeenCalled();
    });

    it('should store a kind and pin on the detail and leave free-text rows unkinded', async () => {
      mocks.personDetail.getForPerson.mockResolvedValue([]);

      await sut.updateDetails(authStub.admin, 'person-1', {
        details: [
          {
            key: 'Home',
            value: 'Rathmines',
            kind: PersonDetailKind.Home,
            latitude: 53.32,
            longitude: -6.26,
            subdetails: [{ key: 'Since', value: 'College' }],
          },
          { key: 'Email', value: 'a@example.com', kind: PersonDetailKind.Email },
          { key: 'Hometown', value: 'Cork' },
        ],
      });

      expect(mocks.personDetail.replaceForPerson).toHaveBeenCalledWith(authStub.admin.user.id, 'person-1', [
        expect.objectContaining({
          kind: PersonDetailKind.Home,
          latitude: 53.32,
          longitude: -6.26,
          subdetails: [{ id: undefined, key: 'Since', value: 'College' }],
        }),
        expect.objectContaining({ kind: PersonDetailKind.Email, latitude: null, longitude: null }),
        expect.objectContaining({ kind: null, latitude: null, longitude: null }),
      ]);
    });

    it('should reject half a pin', async () => {
      mocks.personDetail.getForPerson.mockResolvedValue([]);

      await expect(
        sut.updateDetails(authStub.admin, 'person-1', {
          details: [{ key: 'Home', value: 'Rathmines', kind: PersonDetailKind.Home, latitude: 53.32 }],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(mocks.personDetail.replaceForPerson).not.toHaveBeenCalled();
    });

    it.each([
      { name: 'a free-text detail', kind: undefined },
      { name: 'an email', kind: PersonDetailKind.Email },
      { name: 'a phone', kind: PersonDetailKind.Phone },
    ])('should reject a pin on $name', async ({ kind }) => {
      mocks.personDetail.getForPerson.mockResolvedValue([]);

      await expect(
        sut.updateDetails(authStub.admin, 'person-1', {
          details: [{ key: 'Somewhere', value: 'x', kind, latitude: 53.32, longitude: -6.26 }],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('should compare at the coarser precision when one end is a year', async () => {
      mocks.personDetail.getForPerson.mockResolvedValue([]);

      await sut.updateDetails(authStub.admin, 'person-1', {
        details: [
          {
            key: 'Works at',
            value: 'Intel',
            since: '2019-03-01',
            until: '2019-01-01',
            untilPrecision: PersonDetailDatePrecision.Year,
          },
        ],
      });

      expect(mocks.personDetail.replaceForPerson).toHaveBeenCalled();
    });
  });

  describe('addDetails', () => {
    it('should archive replaced values by default', async () => {
      await sut.addDetails(authStub.admin, {
        personIds: ['person-1', 'person-2'],
        details: [{ key: 'Works at', value: 'Google', replaceForPersonIds: ['person-1'] }],
      });

      expect(mocks.personDetail.addForPeople).toHaveBeenCalledWith(
        authStub.admin.user.id,
        ['person-1', 'person-2'],
        [expect.objectContaining({ replaceForPersonIds: ['person-1'], archiveReplaced: true })],
      );
    });

    it('should carry a kind and pin through to the bulk write', async () => {
      await sut.addDetails(authStub.admin, {
        personIds: ['person-1'],
        details: [{ key: 'Work', value: 'Intel', kind: PersonDetailKind.Work, latitude: 53.3, longitude: -6.2 }],
      });

      expect(mocks.personDetail.addForPeople).toHaveBeenCalledWith(
        authStub.admin.user.id,
        ['person-1'],
        [expect.objectContaining({ kind: PersonDetailKind.Work, latitude: 53.3, longitude: -6.2 })],
      );
    });

    it('should reject a pin on a phone in a bulk add', async () => {
      await expect(
        sut.addDetails(authStub.admin, {
          personIds: ['person-1'],
          details: [{ key: 'Phone', value: '555', kind: PersonDetailKind.Phone, latitude: 1, longitude: 1 }],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(mocks.personDetail.addForPeople).not.toHaveBeenCalled();
    });

    it('should overwrite when archiving is turned off', async () => {
      await sut.addDetails(authStub.admin, {
        personIds: ['person-1'],
        details: [{ key: 'Works at', value: 'Google', replaceForPersonIds: ['person-1'], archiveReplaced: false }],
      });

      expect(mocks.personDetail.addForPeople).toHaveBeenCalledWith(
        authStub.admin.user.id,
        ['person-1'],
        [expect.objectContaining({ archiveReplaced: false })],
      );
    });
  });

  describe('getConflicts', () => {
    it('should ask about kinds apart from keys and answer each by its own', async () => {
      mocks.personDetail.getConflicts.mockResolvedValue([
        { key: 'works at', kind: null, personId: 'person-1', name: 'Ann', detailId: 'd1', value: 'Intel' },
        { key: null, kind: PersonDetailKind.Home, personId: 'person-2', name: 'Bo', detailId: 'd2', value: 'Cork' },
      ]);

      const result = await sut.getConflicts(authStub.admin, {
        personIds: ['person-1', 'person-2'],
        keys: ['Works at', 'Hometown'],
        kinds: [PersonDetailKind.Home, PersonDetailKind.Work],
      });

      expect(mocks.personDetail.getConflicts).toHaveBeenCalledWith(
        authStub.admin.user.id,
        ['person-1', 'person-2'],
        ['works at', 'hometown'],
        [PersonDetailKind.Home, PersonDetailKind.Work],
      );
      expect(result).toEqual([
        { key: 'works at', kind: null, people: [{ id: 'person-1', name: 'Ann', value: 'Intel' }] },
        { key: 'home', kind: PersonDetailKind.Home, people: [{ id: 'person-2', name: 'Bo', value: 'Cork' }] },
      ]);
    });
  });

  describe('getValueSuggestions', () => {
    beforeEach(() => {
      mocks.personDetail.getValueSuggestions.mockResolvedValue([]);
    });

    it('should look values up by kind when one is given', async () => {
      await sut.getValueSuggestions(authStub.admin, { kind: PersonDetailKind.Work, term: 'In' });

      expect(mocks.personDetail.getValueSuggestions).toHaveBeenCalledWith(
        authStub.admin.user.id,
        { key: undefined, kind: PersonDetailKind.Work },
        'In',
        10,
        undefined,
      );
    });

    it('should require a key or a kind', async () => {
      await expect(sut.getValueSuggestions(authStub.admin, { detailKey: '  ' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });
});
