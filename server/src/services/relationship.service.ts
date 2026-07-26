import { BadRequestException, Injectable } from '@nestjs/common';
import { AuthDto } from 'src/dtos/auth.dto';
import {
  mapRelationshipType,
  RelationshipTypeCreateDto,
  RelationshipTypeResponseDto,
  RelationshipTypeUpdateDto,
  RelationshipTypeUsageResponseDto,
} from 'src/dtos/relationship.dto';
import { Permission } from 'src/enum';
import { BaseService } from 'src/services/base.service';

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
