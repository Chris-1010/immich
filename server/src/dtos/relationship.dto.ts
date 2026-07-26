import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';
import { CoAppearance, RelatedPerson, RelationshipTypePair } from 'src/repositories/relationship.repository';
import { Optional, ValidateUUID } from 'src/validation';

export class RelationshipTypeCreateDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  /** A blank opposite makes the type symmetric: its inverse is itself. */
  @IsString()
  @Optional({ nullable: true, emptyToNull: true })
  inverseName?: string | null;
}

export class RelationshipTypeUpdateDto {
  @IsString()
  @IsNotEmpty()
  @Optional()
  name?: string;

  @IsString()
  @IsNotEmpty()
  @Optional()
  inverseName?: string;
}

export class RelationshipTypeResponseDto {
  id!: string;
  name!: string;
  /** Equal to `id` when the type is symmetric. */
  inverseId!: string;
  inverseName!: string;
}

/** How much a pair deletion would take with it, for the confirmation dialog. */
export class RelationshipTypeUsageResponseDto {
  @ApiProperty({ type: 'integer' })
  relationshipCount!: number;

  @ApiProperty({ type: 'integer' })
  personCount!: number;
}

export class RelationshipCreateDto {
  /** The person whose page the relationship is being added from. */
  @ValidateUUID()
  subjectId!: string;

  /** The other person — the one the type describes. */
  @ValidateUUID()
  counterpartId!: string;

  @ValidateUUID()
  typeId!: string;
}

export class RelationshipUpdateDto {
  /**
   * The person the relabelled type is read from. A stored relationship is rendered from both
   * ends, so the new type only means something once the end it was chosen from is known.
   */
  @ValidateUUID()
  subjectId!: string;

  @ValidateUUID()
  typeId!: string;
}

/** A stored relationship, in the direction it is stored in. */
export class RelationshipResponseDto {
  id!: string;
  subjectId!: string;
  counterpartId!: string;
  typeId!: string;
  typeName!: string;
  inverseId!: string;
  inverseName!: string;
}

/** One relationship as read from a person's page: the type always describes the other person. */
export class PersonRelationshipResponseDto {
  id!: string;
  typeId!: string;
  typeName!: string;
  inverseId!: string;
  inverseName!: string;
}

export class RelatedPersonResponseDto {
  id!: string;
  name!: string;
  thumbnailPath!: string;
  relationships!: PersonRelationshipResponseDto[];
}

/** A candidate counterpart, ranked by the photos they share with the subject. */
export class CoAppearanceResponseDto {
  id!: string;
  name!: string;
  thumbnailPath!: string;

  @ApiProperty({ type: 'integer' })
  sharedAssets!: number;
}

export function mapRelationship(
  relationship: { id: string; subjectId: string; counterpartId: string },
  type: RelationshipTypePair,
): RelationshipResponseDto {
  return {
    id: relationship.id,
    subjectId: relationship.subjectId,
    counterpartId: relationship.counterpartId,
    typeId: type.id,
    typeName: type.name,
    inverseId: type.inverseId,
    inverseName: type.inverseName,
  };
}

export function mapRelatedPerson(person: RelatedPerson): RelatedPersonResponseDto {
  return {
    id: person.id,
    name: person.name,
    thumbnailPath: person.thumbnailPath,
    relationships: person.relationships.map((relationship) => ({
      id: relationship.id,
      typeId: relationship.typeId,
      typeName: relationship.typeName,
      inverseId: relationship.inverseId,
      inverseName: relationship.inverseName,
    })),
  };
}

export function mapCoAppearance(person: CoAppearance): CoAppearanceResponseDto {
  return {
    id: person.id,
    name: person.name,
    thumbnailPath: person.thumbnailPath,
    sharedAssets: person.sharedAssets,
  };
}

export function mapRelationshipType(type: RelationshipTypePair): RelationshipTypeResponseDto {
  return {
    id: type.id,
    name: type.name,
    inverseId: type.inverseId,
    inverseName: type.inverseName,
  };
}
