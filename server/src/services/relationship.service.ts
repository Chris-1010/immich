import { BadRequestException, Injectable } from '@nestjs/common';
import { AuthDto } from 'src/dtos/auth.dto';
import {
  CoAppearanceResponseDto,
  mapCoAppearance,
  mapRelatedPerson,
  mapRelationship,
  mapRelationshipType,
  RelatedPersonResponseDto,
  RelationshipCreateDto,
  RelationshipResponseDto,
  RelationshipTypeCreateDto,
  RelationshipTypeResponseDto,
  RelationshipTypeUpdateDto,
  RelationshipTypeUsageResponseDto,
  RelationshipUpdateDto,
} from 'src/dtos/relationship.dto';
import { Permission } from 'src/enum';
import { canonicalOrder, RelationshipTypePair } from 'src/repositories/relationship.repository';
import { BaseService } from 'src/services/base.service';

/** The same pair read from the other end, so a mirrored row can be described without a re-read. */
const invertPair = (type: RelationshipTypePair): RelationshipTypePair => ({
  id: type.inverseId,
  name: type.inverseName,
  inverseId: type.id,
  inverseName: type.name,
});

@Injectable()
export class RelationshipService extends BaseService {
  /** The starter set is seeded on first read, so an owner never sees an empty type picker. */
  async getTypes(auth: AuthDto): Promise<RelationshipTypeResponseDto[]> {
    let types = await this.relationshipRepository.getTypes(auth.user.id);
    if (types.length === 0) {
      await this.relationshipRepository.seedTypes(auth.user.id);
      types = await this.relationshipRepository.getTypes(auth.user.id);
    }

    return types.map((type) => mapRelationshipType(type));
  }

  async createType(auth: AuthDto, dto: RelationshipTypeCreateDto): Promise<RelationshipTypeResponseDto> {
    const name = dto.name.trim();
    const inverseName = dto.inverseName?.trim() || name;
    if (!name) {
      throw new BadRequestException('A relationship type needs a name');
    }

    await this.requireUniquePair(auth.user.id, name, inverseName);

    const type = await this.relationshipRepository.createTypePair({ ownerId: auth.user.id, name, inverseName });

    return mapRelationshipType(type);
  }

  /**
   * Renames one or both halves of a pair. The pairing itself never changes: a symmetric type
   * stays symmetric, so both its names have to stay identical.
   */
  async updateType(auth: AuthDto, id: string, dto: RelationshipTypeUpdateDto): Promise<RelationshipTypeResponseDto> {
    await this.requireAccess({ auth, permission: Permission.RelationshipTypeUpdate, ids: [id] });

    const type = await this.findTypeOrFail(id);
    const isSymmetric = type.id === type.inverseId;

    const name = dto.name?.trim() || type.name;
    const inverseName = isSymmetric ? name : dto.inverseName?.trim() || type.inverseName;

    if (isSymmetric && dto.inverseName !== undefined && dto.inverseName.trim() !== name) {
      throw new BadRequestException('A symmetric relationship type is its own opposite, so both names must match');
    }

    // Two identically named halves would look symmetric while still being stored as entered,
    // which is how mirrored duplicates of the same fact get in.
    if (!isSymmetric && inverseName === name) {
      throw new BadRequestException('A relationship type and its opposite can only share a name when it is symmetric');
    }

    await this.requireUniquePair(type.ownerId, name, inverseName, [type.id, type.inverseId]);

    await this.relationshipRepository.renameType(type.id, name);
    if (!isSymmetric) {
      await this.relationshipRepository.renameType(type.inverseId, inverseName);
    }

    return { id: type.id, name, inverseId: type.inverseId, inverseName };
  }

  /** What deleting this pair would remove, so the confirmation can say so before it happens. */
  async getTypeUsage(auth: AuthDto, id: string): Promise<RelationshipTypeUsageResponseDto> {
    await this.requireAccess({ auth, permission: Permission.RelationshipTypeRead, ids: [id] });
    await this.findTypeOrFail(id);

    return this.countUsage(id);
  }

  /**
   * Deleting either half deletes both, and every relationship using either. The counts of what
   * went are returned so the caller can report them.
   */
  async deleteType(auth: AuthDto, id: string): Promise<RelationshipTypeUsageResponseDto> {
    await this.requireAccess({ auth, permission: Permission.RelationshipTypeDelete, ids: [id] });
    await this.findTypeOrFail(id);

    const usage = await this.countUsage(id);
    await this.relationshipRepository.deleteTypePair(id);

    return usage;
  }

  /** Everyone a person is related to, grouped, with every label read from that person's end. */
  async getRelatedPeople(auth: AuthDto, personId: string): Promise<RelatedPersonResponseDto[]> {
    await this.requireAccess({ auth, permission: Permission.PersonRead, ids: [personId] });

    const people = await this.relationshipRepository.getRelatedPeople(personId);

    return people.map((person) => mapRelatedPerson(person));
  }

  /** Candidate counterparts, most shared photos first. Ordering only — nothing is filtered out. */
  async getCoAppearances(auth: AuthDto, personId: string): Promise<CoAppearanceResponseDto[]> {
    await this.requireAccess({ auth, permission: Permission.PersonRead, ids: [personId] });

    const people = await this.relationshipRepository.getCoAppearances(auth.user.id, personId);

    return people.map((person) => mapCoAppearance(person));
  }

  /**
   * Relates two people under one type. Adding a relationship that is already recorded — in either
   * direction — returns the existing one rather than failing.
   */
  async createRelationship(auth: AuthDto, dto: RelationshipCreateDto): Promise<RelationshipResponseDto> {
    if (dto.subjectId === dto.counterpartId) {
      throw new BadRequestException('A person cannot be related to themselves');
    }

    await this.requireAccess({ auth, permission: Permission.PersonRead, ids: [dto.subjectId, dto.counterpartId] });
    await this.requireAccess({ auth, permission: Permission.RelationshipTypeRead, ids: [dto.typeId] });

    const type = await this.findTypeOrFail(dto.typeId);
    const { subjectId, counterpartId } = canonicalOrder(type, dto.subjectId, dto.counterpartId);

    const existing = await this.findEquivalent(type, subjectId, counterpartId);
    if (existing) {
      return mapRelationship(existing.relationship, existing.type);
    }

    const created = await this.relationshipRepository.create({
      ownerId: auth.user.id,
      subjectId,
      counterpartId,
      typeId: type.id,
    });

    // `create` skips the insert on conflict, so a concurrent add of the same relationship lands here.
    const relationship =
      created ?? (await this.relationshipRepository.getRelationshipByKey(subjectId, counterpartId, type.id));
    if (!relationship) {
      throw new BadRequestException('Relationship could not be created');
    }

    return mapRelationship(relationship, type);
  }

  /**
   * Relabels a relationship. The new type describes the person opposite `subjectId`, so relabelling
   * from the far end swaps the stored direction, and a symmetric type is re-canonicalised.
   */
  async updateRelationship(auth: AuthDto, id: string, dto: RelationshipUpdateDto): Promise<RelationshipResponseDto> {
    await this.requireAccess({ auth, permission: Permission.RelationshipUpdate, ids: [id] });
    await this.requireAccess({ auth, permission: Permission.RelationshipTypeRead, ids: [dto.typeId] });

    const relationship = await this.findRelationshipOrFail(id);
    if (dto.subjectId !== relationship.subjectId && dto.subjectId !== relationship.counterpartId) {
      throw new BadRequestException('The subject must be one of the two people in the relationship');
    }

    const type = await this.findTypeOrFail(dto.typeId);
    const otherId = dto.subjectId === relationship.subjectId ? relationship.counterpartId : relationship.subjectId;
    const { subjectId, counterpartId } = canonicalOrder(type, dto.subjectId, otherId);

    if (
      relationship.typeId === type.id &&
      relationship.subjectId === subjectId &&
      relationship.counterpartId === counterpartId
    ) {
      return mapRelationship(relationship, type);
    }

    // The two people may already hold the target type. Relabelling into it would break the unique
    // constraint, so the row that would become redundant is dropped rather than duplicated.
    const existing = await this.findEquivalent(type, subjectId, counterpartId);
    if (existing && existing.relationship.id !== id) {
      await this.relationshipRepository.remove(existing.relationship.id);
    }

    await this.relationshipRepository.update(id, { subjectId, counterpartId, typeId: type.id });

    return mapRelationship({ id, subjectId, counterpartId }, type);
  }

  async deleteRelationship(auth: AuthDto, id: string): Promise<void> {
    await this.requireAccess({ auth, permission: Permission.RelationshipDelete, ids: [id] });

    await this.relationshipRepository.remove(id);
  }

  /**
   * The row already stating this fact, if there is one. An asymmetric fact can be stored from
   * either end — "Bob is Alice's parent" and "Alice is Bob's child" are one relationship — so the
   * mirrored row counts as the same relationship and is returned described from its own end.
   */
  private async findEquivalent(type: RelationshipTypePair, subjectId: string, counterpartId: string) {
    const direct = await this.relationshipRepository.getRelationshipByKey(subjectId, counterpartId, type.id);
    if (direct) {
      return { relationship: direct, type };
    }

    if (type.id === type.inverseId) {
      return;
    }

    const mirrored = await this.relationshipRepository.getRelationshipByKey(counterpartId, subjectId, type.inverseId);
    if (mirrored) {
      return { relationship: mirrored, type: invertPair(type) };
    }
  }

  private async findRelationshipOrFail(id: string) {
    const relationship = await this.relationshipRepository.getRelationship(id);
    if (!relationship) {
      throw new BadRequestException('Relationship not found');
    }

    return relationship;
  }

  private async countUsage(id: string): Promise<RelationshipTypeUsageResponseDto> {
    const relationships = await this.relationshipRepository.getRelationshipsUsingPair(id);
    const people = new Set<string>();
    for (const { subjectId, counterpartId } of relationships) {
      people.add(subjectId);
      people.add(counterpartId);
    }

    return { relationshipCount: relationships.length, personCount: people.size };
  }

  /**
   * Names are not unique on their own — Uncle/Nephew and Uncle/Niece are two pairs — so a pair is
   * a duplicate only when both its names match an existing one.
   */
  private async requireUniquePair(ownerId: string, name: string, inverseName: string, ignoreIds: string[] = []) {
    const types = await this.relationshipRepository.getTypes(ownerId);
    const duplicate = types.some(
      (type) => !ignoreIds.includes(type.id) && type.name === name && type.inverseName === inverseName,
    );

    if (duplicate) {
      throw new BadRequestException('A relationship type with that name and opposite already exists');
    }
  }

  private async findTypeOrFail(id: string) {
    const type = await this.relationshipRepository.getType(id);
    if (!type) {
      throw new BadRequestException('Relationship type not found');
    }

    return type;
  }
}
