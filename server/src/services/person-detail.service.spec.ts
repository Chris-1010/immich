import { BadRequestException } from '@nestjs/common';
import { PersonDetailDatePrecision } from 'src/enum';
import { AlongWith, AlongWithPerson, PersonDetail } from 'src/repositories/person-detail.repository';
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
});
