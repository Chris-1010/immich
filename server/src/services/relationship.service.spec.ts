import { BadRequestException } from '@nestjs/common';
import { RelationshipService } from 'src/services/relationship.service';
import { authStub } from 'test/fixtures/auth.stub';
import { newTestService, ServiceMocks } from 'test/utils';

const ownerId = authStub.admin.user.id;

const parentType = { id: 'type-parent', name: 'Parent', ownerId, inverseId: 'type-child', inverseName: 'Child' };
const childType = { id: 'type-child', name: 'Child', ownerId, inverseId: 'type-parent', inverseName: 'Parent' };
const siblingType = { id: 'type-sibling', name: 'Sibling', ownerId, inverseId: 'type-sibling', inverseName: 'Sibling' };
const workType = { id: 'type-work', name: 'Work', ownerId, inverseId: 'type-work', inverseName: 'Work' };

/** Alice sorts before Bob, so a symmetric relationship between them is stored with Alice first. */
const alice = 'person-alice';
const bob = 'person-bob';

/** Access is granted by default; the tests that care revoke it by returning an empty set. */
const granted = (_ownerId: string, ids: Set<string>) => Promise.resolve(ids);

const relationshipRow = (relationship: { id: string; subjectId: string; counterpartId: string; typeId: string }) => ({
  ownerId,
  createdAt: new Date(),
  ...relationship,
});

describe(RelationshipService.name, () => {
  let sut: RelationshipService;
  let mocks: ServiceMocks;

  beforeEach(() => {
    ({ sut, mocks } = newTestService(RelationshipService));

    mocks.access.person.checkOwnerAccess.mockImplementation(granted);
    mocks.access.relationshipType.checkOwnerAccess.mockImplementation(granted);
    mocks.access.relationship.checkOwnerAccess.mockImplementation(granted);
  });

  it('should work', () => {
    expect(sut).toBeDefined();
  });

  describe('getTypes', () => {
    it('should seed the starter set for an owner who has none', async () => {
      mocks.relationship.getTypes.mockResolvedValueOnce([]);
      mocks.relationship.seedTypes.mockResolvedValue([]);
      mocks.relationship.getTypes.mockResolvedValueOnce([parentType, childType]);

      await expect(sut.getTypes(authStub.admin)).resolves.toEqual([
        { id: parentType.id, name: 'Parent', inverseId: 'type-child', inverseName: 'Child' },
        { id: childType.id, name: 'Child', inverseId: 'type-parent', inverseName: 'Parent' },
      ]);

      expect(mocks.relationship.seedTypes).toHaveBeenCalledWith(ownerId);
      expect(mocks.relationship.getTypes).toHaveBeenCalledTimes(2);
    });

    it('should not seed an owner who already has types', async () => {
      mocks.relationship.getTypes.mockResolvedValue([siblingType]);

      await expect(sut.getTypes(authStub.admin)).resolves.toEqual([
        { id: siblingType.id, name: 'Sibling', inverseId: 'type-sibling', inverseName: 'Sibling' },
      ]);

      expect(mocks.relationship.seedTypes).not.toHaveBeenCalled();
    });
  });

  describe('createType', () => {
    it('should reject a pair whose name and opposite both already exist', async () => {
      mocks.relationship.getTypes.mockResolvedValue([parentType]);

      await expect(sut.createType(authStub.admin, { name: 'Parent', inverseName: 'Child' })).rejects.toBeInstanceOf(
        BadRequestException,
      );

      expect(mocks.relationship.createTypePair).not.toHaveBeenCalled();
    });

    it('should allow a repeated name with a different opposite', async () => {
      const uncleNephew = { id: 'type-uncle', name: 'Uncle', ownerId, inverseId: 'type-nephew', inverseName: 'Nephew' };
      mocks.relationship.getTypes.mockResolvedValue([uncleNephew]);
      mocks.relationship.createTypePair.mockResolvedValue({
        id: 'type-uncle-2',
        name: 'Uncle',
        inverseId: 'type-niece',
        inverseName: 'Niece',
      });

      await expect(sut.createType(authStub.admin, { name: 'Uncle', inverseName: 'Niece' })).resolves.toEqual({
        id: 'type-uncle-2',
        name: 'Uncle',
        inverseId: 'type-niece',
        inverseName: 'Niece',
      });
    });

    it('should treat a blank opposite as symmetric', async () => {
      mocks.relationship.getTypes.mockResolvedValue([]);
      mocks.relationship.createTypePair.mockResolvedValue({
        id: workType.id,
        name: 'Work',
        inverseId: workType.id,
        inverseName: 'Work',
      });

      await expect(sut.createType(authStub.admin, { name: 'Work', inverseName: '' })).resolves.toEqual({
        id: workType.id,
        name: 'Work',
        inverseId: workType.id,
        inverseName: 'Work',
      });

      expect(mocks.relationship.createTypePair).toHaveBeenCalledWith({ ownerId, name: 'Work', inverseName: 'Work' });
    });
  });

  describe('updateType', () => {
    it('should rename both halves of a pair', async () => {
      mocks.relationship.getType.mockResolvedValue(parentType);
      mocks.relationship.getTypes.mockResolvedValue([parentType]);
      mocks.relationship.renameType.mockResolvedValue(void 0);

      await expect(
        sut.updateType(authStub.admin, parentType.id, { name: 'Mother', inverseName: 'Daughter' }),
      ).resolves.toEqual({ id: parentType.id, name: 'Mother', inverseId: 'type-child', inverseName: 'Daughter' });

      expect(mocks.relationship.renameType).toHaveBeenNthCalledWith(1, parentType.id, 'Mother');
      expect(mocks.relationship.renameType).toHaveBeenNthCalledWith(2, childType.id, 'Daughter');
    });

    it('should rename a symmetric type once', async () => {
      mocks.relationship.getType.mockResolvedValue(siblingType);
      mocks.relationship.getTypes.mockResolvedValue([siblingType]);
      mocks.relationship.renameType.mockResolvedValue(void 0);

      await expect(sut.updateType(authStub.admin, siblingType.id, { name: 'Brother' })).resolves.toEqual({
        id: siblingType.id,
        name: 'Brother',
        inverseId: siblingType.id,
        inverseName: 'Brother',
      });

      expect(mocks.relationship.renameType).toHaveBeenCalledTimes(1);
    });

    it('should reject giving a symmetric type a different opposite', async () => {
      mocks.relationship.getType.mockResolvedValue(siblingType);

      await expect(
        sut.updateType(authStub.admin, siblingType.id, { name: 'Sibling', inverseName: 'Cousin' }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(mocks.relationship.renameType).not.toHaveBeenCalled();
    });

    it('should reject renaming an asymmetric pair so both halves match', async () => {
      mocks.relationship.getType.mockResolvedValue(parentType);

      await expect(
        sut.updateType(authStub.admin, parentType.id, { name: 'Friend', inverseName: 'Friend' }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(mocks.relationship.renameType).not.toHaveBeenCalled();
    });

    it('should require update access', async () => {
      mocks.access.relationshipType.checkOwnerAccess.mockResolvedValue(new Set());

      await expect(sut.updateType(authStub.admin, parentType.id, { name: 'Mother' })).rejects.toBeInstanceOf(
        BadRequestException,
      );

      expect(mocks.relationship.renameType).not.toHaveBeenCalled();
    });
  });

  describe('getTypeUsage', () => {
    it('should count the relationships and the distinct people a deletion would affect', async () => {
      mocks.relationship.getType.mockResolvedValue(parentType);
      mocks.relationship.getRelationshipsUsingPair.mockResolvedValue([
        { subjectId: alice, counterpartId: bob },
        { subjectId: alice, counterpartId: 'person-carol' },
      ]);

      await expect(sut.getTypeUsage(authStub.admin, parentType.id)).resolves.toEqual({
        relationshipCount: 2,
        personCount: 3,
      });
    });
  });

  describe('deleteType', () => {
    it('should delete both halves of the pair and report what went with them', async () => {
      mocks.relationship.getType.mockResolvedValue(parentType);
      mocks.relationship.getRelationshipsUsingPair.mockResolvedValue([{ subjectId: alice, counterpartId: bob }]);
      mocks.relationship.deleteTypePair.mockResolvedValue(void 0);

      await expect(sut.deleteType(authStub.admin, parentType.id)).resolves.toEqual({
        relationshipCount: 1,
        personCount: 2,
      });

      // The pair is deleted by either half's id; the repository removes the row and its inverse.
      expect(mocks.relationship.deleteTypePair).toHaveBeenCalledWith(parentType.id);
      expect(mocks.relationship.getRelationshipsUsingPair).toHaveBeenCalledWith(parentType.id);
    });

    it('should require delete access', async () => {
      mocks.access.relationshipType.checkOwnerAccess.mockResolvedValue(new Set());

      await expect(sut.deleteType(authStub.admin, parentType.id)).rejects.toBeInstanceOf(BadRequestException);

      expect(mocks.relationship.deleteTypePair).not.toHaveBeenCalled();
    });
  });

  describe('createRelationship', () => {
    it('should reject a person being related to themselves', async () => {
      await expect(
        sut.createRelationship(authStub.admin, { subjectId: alice, counterpartId: alice, typeId: siblingType.id }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(mocks.relationship.create).not.toHaveBeenCalled();
    });

    it('should store a symmetric relationship in canonical order whichever end it is added from', async () => {
      mocks.relationship.getType.mockResolvedValue(siblingType);
      mocks.relationship.getRelationshipByKey.mockResolvedValue(void 0);
      mocks.relationship.create.mockResolvedValue(
        relationshipRow({ id: 'relationship-1', subjectId: alice, counterpartId: bob, typeId: siblingType.id }),
      );

      // Added from Alice's page, then from Bob's.
      await sut.createRelationship(authStub.admin, {
        subjectId: alice,
        counterpartId: bob,
        typeId: siblingType.id,
      });
      await sut.createRelationship(authStub.admin, {
        subjectId: bob,
        counterpartId: alice,
        typeId: siblingType.id,
      });

      const expected = { ownerId, subjectId: alice, counterpartId: bob, typeId: siblingType.id };
      expect(mocks.relationship.create).toHaveBeenNthCalledWith(1, expected);
      expect(mocks.relationship.create).toHaveBeenNthCalledWith(2, expected);
    });

    it('should store an asymmetric relationship exactly as entered', async () => {
      mocks.relationship.getType.mockResolvedValue(parentType);
      mocks.relationship.getRelationshipByKey.mockResolvedValue(void 0);
      mocks.relationship.create.mockResolvedValue(
        relationshipRow({ id: 'relationship-1', subjectId: bob, counterpartId: alice, typeId: parentType.id }),
      );

      await expect(
        sut.createRelationship(authStub.admin, { subjectId: bob, counterpartId: alice, typeId: parentType.id }),
      ).resolves.toEqual({
        id: 'relationship-1',
        subjectId: bob,
        counterpartId: alice,
        typeId: parentType.id,
        typeName: 'Parent',
        inverseId: 'type-child',
        inverseName: 'Child',
      });

      expect(mocks.relationship.create).toHaveBeenCalledWith({
        ownerId,
        subjectId: bob,
        counterpartId: alice,
        typeId: parentType.id,
      });
    });

    it('should be a no-op when the relationship is already recorded', async () => {
      mocks.relationship.getType.mockResolvedValue(siblingType);
      mocks.relationship.getRelationshipByKey.mockResolvedValue(
        relationshipRow({ id: 'relationship-1', subjectId: alice, counterpartId: bob, typeId: siblingType.id }),
      );

      await expect(
        sut.createRelationship(authStub.admin, { subjectId: bob, counterpartId: alice, typeId: siblingType.id }),
      ).resolves.toEqual(expect.objectContaining({ id: 'relationship-1', subjectId: alice, counterpartId: bob }));

      expect(mocks.relationship.create).not.toHaveBeenCalled();
    });

    it('should be a no-op when the same fact is already recorded from the other end', async () => {
      mocks.relationship.getType.mockResolvedValue(parentType);
      // No (bob, alice, Parent) row, but (alice, bob, Child) says the same thing.
      mocks.relationship.getRelationshipByKey.mockResolvedValueOnce(void 0);
      mocks.relationship.getRelationshipByKey.mockResolvedValueOnce(
        relationshipRow({ id: 'relationship-1', subjectId: alice, counterpartId: bob, typeId: childType.id }),
      );

      await expect(
        sut.createRelationship(authStub.admin, { subjectId: bob, counterpartId: alice, typeId: parentType.id }),
      ).resolves.toEqual({
        id: 'relationship-1',
        subjectId: alice,
        counterpartId: bob,
        typeId: childType.id,
        typeName: 'Child',
        inverseId: parentType.id,
        inverseName: 'Parent',
      });

      expect(mocks.relationship.create).not.toHaveBeenCalled();
    });

    it('should require read access to both people', async () => {
      mocks.access.person.checkOwnerAccess.mockResolvedValue(new Set([alice]));

      await expect(
        sut.createRelationship(authStub.admin, { subjectId: alice, counterpartId: bob, typeId: siblingType.id }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(mocks.relationship.create).not.toHaveBeenCalled();
    });
  });

  describe('updateRelationship', () => {
    const stored = relationshipRow({
      id: 'relationship-1',
      subjectId: alice,
      counterpartId: bob,
      typeId: parentType.id,
    });

    it('should reject a subject that is not one of the two people', async () => {
      mocks.relationship.getRelationship.mockResolvedValue(stored);

      await expect(
        sut.updateRelationship(authStub.admin, 'relationship-1', {
          subjectId: 'person-carol',
          typeId: siblingType.id,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(mocks.relationship.update).not.toHaveBeenCalled();
    });

    it('should keep the direction when relabelling from the stored subject', async () => {
      mocks.relationship.getRelationship.mockResolvedValue(stored);
      mocks.relationship.getType.mockResolvedValue(childType);
      mocks.relationship.getRelationshipByKey.mockResolvedValue(void 0);
      mocks.relationship.update.mockResolvedValue(void 0);

      // On Alice's page Bob is relabelled from her Parent to her Child.
      await expect(
        sut.updateRelationship(authStub.admin, 'relationship-1', { subjectId: alice, typeId: childType.id }),
      ).resolves.toEqual(
        expect.objectContaining({ subjectId: alice, counterpartId: bob, typeId: childType.id, typeName: 'Child' }),
      );

      expect(mocks.relationship.update).toHaveBeenCalledWith('relationship-1', {
        subjectId: alice,
        counterpartId: bob,
        typeId: childType.id,
      });
    });

    it('should swap the direction when relabelling from the far end', async () => {
      mocks.relationship.getRelationship.mockResolvedValue(stored);
      mocks.relationship.getType.mockResolvedValue(parentType);
      mocks.relationship.getRelationshipByKey.mockResolvedValue(void 0);
      mocks.relationship.update.mockResolvedValue(void 0);

      // Bob's page showed Alice as his Child. Relabelling her to Parent there means Alice is Bob's
      // parent, which is the stored row turned around.
      await expect(
        sut.updateRelationship(authStub.admin, 'relationship-1', { subjectId: bob, typeId: parentType.id }),
      ).resolves.toEqual(expect.objectContaining({ subjectId: bob, counterpartId: alice, typeId: parentType.id }));

      expect(mocks.relationship.update).toHaveBeenCalledWith('relationship-1', {
        subjectId: bob,
        counterpartId: alice,
        typeId: parentType.id,
      });
    });

    it('should re-canonicalise when relabelling to a symmetric type from the far end', async () => {
      mocks.relationship.getRelationship.mockResolvedValue(
        relationshipRow({ id: 'relationship-1', subjectId: bob, counterpartId: alice, typeId: parentType.id }),
      );
      mocks.relationship.getType.mockResolvedValue(siblingType);
      mocks.relationship.getRelationshipByKey.mockResolvedValue(void 0);
      mocks.relationship.update.mockResolvedValue(void 0);

      await sut.updateRelationship(authStub.admin, 'relationship-1', { subjectId: alice, typeId: siblingType.id });

      expect(mocks.relationship.update).toHaveBeenCalledWith('relationship-1', {
        subjectId: alice,
        counterpartId: bob,
        typeId: siblingType.id,
      });
    });

    it('should drop the redundant row when relabelling into a type the two people already hold', async () => {
      mocks.relationship.getRelationship.mockResolvedValue(stored);
      mocks.relationship.getType.mockResolvedValue(siblingType);
      mocks.relationship.getRelationshipByKey.mockResolvedValue(
        relationshipRow({ id: 'relationship-2', subjectId: alice, counterpartId: bob, typeId: siblingType.id }),
      );
      mocks.relationship.remove.mockResolvedValue(void 0);
      mocks.relationship.update.mockResolvedValue(void 0);

      await sut.updateRelationship(authStub.admin, 'relationship-1', { subjectId: alice, typeId: siblingType.id });

      expect(mocks.relationship.remove).toHaveBeenCalledWith('relationship-2');
      expect(mocks.relationship.update).toHaveBeenCalledWith('relationship-1', {
        subjectId: alice,
        counterpartId: bob,
        typeId: siblingType.id,
      });
    });

    it('should not write anything when the label is unchanged', async () => {
      mocks.relationship.getRelationship.mockResolvedValue(stored);
      mocks.relationship.getType.mockResolvedValue(parentType);

      await sut.updateRelationship(authStub.admin, 'relationship-1', { subjectId: alice, typeId: parentType.id });

      expect(mocks.relationship.update).not.toHaveBeenCalled();
      expect(mocks.relationship.remove).not.toHaveBeenCalled();
    });
  });

  describe('deleteRelationship', () => {
    it('should delete a relationship', async () => {
      mocks.relationship.remove.mockResolvedValue(void 0);

      await sut.deleteRelationship(authStub.admin, 'relationship-1');

      expect(mocks.relationship.remove).toHaveBeenCalledWith('relationship-1');
    });

    it('should require delete access', async () => {
      mocks.access.relationship.checkOwnerAccess.mockResolvedValue(new Set());

      await expect(sut.deleteRelationship(authStub.admin, 'relationship-1')).rejects.toBeInstanceOf(
        BadRequestException,
      );

      expect(mocks.relationship.remove).not.toHaveBeenCalled();
    });
  });

  describe('getRelatedPeople', () => {
    it('should return the grouped counterparts of a person', async () => {
      mocks.relationship.getRelatedPeople.mockResolvedValue([
        {
          id: bob,
          name: 'Bob',
          thumbnailPath: '/bob.jpg',
          familyRank: 10,
          sortOrder: null,
          relationships: [
            {
              id: 'relationship-1',
              typeId: parentType.id,
              typeName: 'Parent',
              inverseId: childType.id,
              inverseName: 'Child',
            },
          ],
        },
      ]);

      // The ordering fields are how the repository sorts the list; they are not part of the response.
      await expect(sut.getRelatedPeople(authStub.admin, alice)).resolves.toEqual([
        {
          id: bob,
          name: 'Bob',
          thumbnailPath: '/bob.jpg',
          relationships: [
            {
              id: 'relationship-1',
              typeId: parentType.id,
              typeName: 'Parent',
              inverseId: childType.id,
              inverseName: 'Child',
            },
          ],
        },
      ]);

      expect(mocks.relationship.getRelatedPeople).toHaveBeenCalledWith(alice);
    });

    it('should require read access to the person', async () => {
      mocks.access.person.checkOwnerAccess.mockResolvedValue(new Set());

      await expect(sut.getRelatedPeople(authStub.admin, alice)).rejects.toBeInstanceOf(BadRequestException);

      expect(mocks.relationship.getRelatedPeople).not.toHaveBeenCalled();
    });
  });

  describe('setRelatedPeopleOrder', () => {
    const carol = 'person-carol';

    beforeEach(() => {
      mocks.relationship.setRelatedPeopleOrder.mockResolvedValue();
    });

    it('should store the order exactly as given', async () => {
      await sut.setRelatedPeopleOrder(authStub.admin, alice, { relatedPersonIds: [carol, bob] });

      expect(mocks.relationship.setRelatedPeopleOrder).toHaveBeenCalledWith(alice, [carol, bob]);
    });

    it('should keep only the first mention of a repeated person', async () => {
      await sut.setRelatedPeopleOrder(authStub.admin, alice, { relatedPersonIds: [carol, bob, carol] });

      expect(mocks.relationship.setRelatedPeopleOrder).toHaveBeenCalledWith(alice, [carol, bob]);
    });

    it('should clear the order when given an empty list', async () => {
      await sut.setRelatedPeopleOrder(authStub.admin, alice, { relatedPersonIds: [] });

      expect(mocks.relationship.setRelatedPeopleOrder).toHaveBeenCalledWith(alice, []);
    });

    it('should reject a list containing the person whose page it is', async () => {
      await expect(
        sut.setRelatedPeopleOrder(authStub.admin, alice, { relatedPersonIds: [bob, alice] }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(mocks.relationship.setRelatedPeopleOrder).not.toHaveBeenCalled();
    });

    it('should require update access to the person whose page it is', async () => {
      mocks.access.person.checkOwnerAccess.mockResolvedValue(new Set());

      await expect(
        sut.setRelatedPeopleOrder(authStub.admin, alice, { relatedPersonIds: [bob] }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(mocks.relationship.setRelatedPeopleOrder).not.toHaveBeenCalled();
    });

    it('should require access to everyone being ordered', async () => {
      // The page itself is reachable, but one of the people listed belongs to somebody else.
      mocks.access.person.checkOwnerAccess.mockImplementation((_ownerId, ids) =>
        Promise.resolve(new Set([...ids].filter((id) => id !== bob))),
      );

      await expect(
        sut.setRelatedPeopleOrder(authStub.admin, alice, { relatedPersonIds: [bob] }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(mocks.relationship.setRelatedPeopleOrder).not.toHaveBeenCalled();
    });
  });

  describe('getCoAppearances', () => {
    it('should return candidate counterparts ranked by shared photos', async () => {
      mocks.relationship.getCoAppearances.mockResolvedValue([
        { id: bob, name: 'Bob', thumbnailPath: '/bob.jpg', sharedAssets: 12 },
        { id: 'person-carol', name: 'Carol', thumbnailPath: '/carol.jpg', sharedAssets: 0 },
      ]);

      await expect(sut.getCoAppearances(authStub.admin, alice)).resolves.toEqual([
        { id: bob, name: 'Bob', thumbnailPath: '/bob.jpg', sharedAssets: 12 },
        { id: 'person-carol', name: 'Carol', thumbnailPath: '/carol.jpg', sharedAssets: 0 },
      ]);

      expect(mocks.relationship.getCoAppearances).toHaveBeenCalledWith(ownerId, alice);
    });
  });
});
