import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsString, Max, Min } from 'class-validator';
import { CoAppearance, RelatedPerson, RelationshipTypePair } from 'src/repositories/relationship.repository';
import { MAX_AGE_GAP, RelationshipGender } from 'src/utils/relationship';
import { Optional, ValidateUUID } from 'src/validation';

/**
 * The expected age difference, in signed years: how much older the counterpart usually is than
 * the subject. Sent as a pair or not at all — one bound on its own says nothing.
 */
class AgeGapFields {
  @ApiPropertyOptional({ type: 'integer', nullable: true })
  @Optional({ nullable: true })
  @IsInt()
  @Min(-MAX_AGE_GAP)
  @Max(MAX_AGE_GAP)
  minAgeGap?: number | null;

  @ApiPropertyOptional({ type: 'integer', nullable: true })
  @Optional({ nullable: true })
  @IsInt()
  @Min(-MAX_AGE_GAP)
  @Max(MAX_AGE_GAP)
  maxAgeGap?: number | null;
}

export class RelationshipTypeCreateDto extends AgeGapFields {
  @IsString()
  @IsNotEmpty()
  name!: string;

  /** A blank opposite makes the type symmetric: its inverse is itself. */
  @IsString()
  @Optional({ nullable: true, emptyToNull: true })
  inverseName?: string | null;
}

export class RelationshipTypeUpdateDto extends AgeGapFields {
  @IsString()
  @IsNotEmpty()
  @Optional()
  name?: string;

  @IsString()
  @IsNotEmpty()
  @Optional()
  inverseName?: string;
}

/** Narrows the type list to the pair of people it is being chosen for, so it can be ordered by age. */
export class RelationshipTypeSearchDto {
  /** The person whose page the type is being chosen from. */
  @ValidateUUID({ optional: true })
  subjectId?: string;

  /** The other person: the one the type would describe. */
  @ValidateUUID({ optional: true })
  counterpartId?: string;
}

export class RelationshipTypeResponseDto {
  id!: string;
  name!: string;
  /** Equal to `id` when the type is symmetric. */
  inverseId!: string;
  inverseName!: string;

  /** How much older the counterpart is expected to be, in signed years. Null when age says nothing. */
  @ApiProperty({ type: 'integer', nullable: true })
  minAgeGap!: number | null;

  @ApiProperty({ type: 'integer', nullable: true })
  maxAgeGap!: number | null;

  /**
   * Whether the age difference between the two people the list was requested for fits this type.
   * Always false when no pair was given, or when either of them has no birth date.
   */
  suggested!: boolean;
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

  /** The other person: the one the type describes. */
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

export class RelationshipOrderUpdateDto {
  /**
   * Everyone on the page, in the order they should appear. Position in the array is the position
   * on the page. Anyone omitted goes back to being placed by relationship type.
   */
  @ValidateUUID({ each: true })
  relatedPersonIds!: string[];
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

  /**
   * What the labels this person already holds state about them, or null when nothing about them is
   * known yet. A gender is never recorded against a person directly, only implied by their
   * relationships, so labels that disagree state nothing between them.
   */
  @ApiProperty({ enum: ['male', 'female'], enumName: 'RelationshipGender', nullable: true })
  gender!: RelationshipGender | null;
}

/** One person their relationships state a gender for. People nothing is known about are not listed. */
export class PersonGenderResponseDto {
  personId!: string;

  @ApiProperty({ enum: ['male', 'female'], enumName: 'RelationshipGender' })
  gender!: RelationshipGender;
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

export function mapCoAppearance(person: CoAppearance, gender: RelationshipGender | null): CoAppearanceResponseDto {
  return {
    id: person.id,
    name: person.name,
    thumbnailPath: person.thumbnailPath,
    sharedAssets: person.sharedAssets,
    gender,
  };
}

export function mapRelationshipType(type: RelationshipTypePair & { suggested?: boolean }): RelationshipTypeResponseDto {
  return {
    id: type.id,
    name: type.name,
    inverseId: type.inverseId,
    inverseName: type.inverseName,
    minAgeGap: type.minAgeGap,
    maxAgeGap: type.maxAgeGap,
    suggested: type.suggested ?? false,
  };
}
