import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsLatitude,
  IsLongitude,
  IsNotEmpty,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { PlacesResponseDto } from 'src/dtos/search.dto';
import { LocationSearchResultType, PersonDetailDatePrecision, PersonDetailKind } from 'src/enum';
import { PersonPlace, SavedLocation } from 'src/repositories/saved-location.repository';
import { asDateString } from 'src/utils/date';
import { Optional, ValidateEnum } from 'src/validation';

/** Long enough for an address typed out in full, short enough to stay a label. */
const MAX_NAME_LENGTH = 200;

/**
 * Generous for what browser storage ever held, and still one bounded insert. The import is the only
 * caller sending more than one at a time.
 */
const MAX_BULK_SIZE = 1000;

export class SavedLocationCreateDto {
  /** Trimmed before it is stored. A name that is blank once trimmed is refused. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_NAME_LENGTH)
  name!: string;

  @IsLatitude()
  @ApiProperty({ type: 'number', format: 'double' })
  latitude!: number;

  @IsLongitude()
  @ApiProperty({ type: 'number', format: 'double' })
  longitude!: number;
}

export class SavedLocationsBulkCreateDto {
  /**
   * Everything the browser had saved before saved locations moved to the server. An entry matching
   * one already stored — the same trimmed name and the same coordinates exactly — is skipped, so the
   * import can be sent again after a failed clear without doubling anything up.
   */
  @IsArray()
  @ArrayMaxSize(MAX_BULK_SIZE)
  @ValidateNested({ each: true })
  @Type(() => SavedLocationCreateDto)
  locations!: SavedLocationCreateDto[];
}

/** Rename, move, or both. Anything left out keeps its stored value. */
export class SavedLocationUpdateDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_NAME_LENGTH)
  @Optional()
  name?: string;

  @IsLatitude()
  @Optional()
  @ApiProperty({ type: 'number', format: 'double', required: false })
  latitude?: number;

  @IsLongitude()
  @Optional()
  @ApiProperty({ type: 'number', format: 'double', required: false })
  longitude?: number;
}

export class SavedLocationResponseDto {
  id!: string;
  name!: string;

  @ApiProperty({ type: 'number', format: 'double' })
  latitude!: number;

  @ApiProperty({ type: 'number', format: 'double' })
  longitude!: number;

  createdAt!: Date;
  updatedAt!: Date;
}

export class LocationSearchDto {
  /**
   * What the user has typed. Blank or missing means nothing typed yet: the picker is then offered
   * the saved locations and everyone's current places, and no GeoNames places, since there is no
   * name to look one up by.
   */
  @IsString()
  @MaxLength(MAX_NAME_LENGTH)
  @Optional()
  query?: string;
}

/**
 * A pinned Home or Work contact field, offered as a place to pick: "Ethan's Home · Rathmines". Past
 * ones are offered too, below the current ones, since where someone used to live is as much a place
 * a photo was taken as where they live now.
 */
export class PersonPlaceResponseDto {
  /** The detail row the pin is on. */
  detailId!: string;

  personId!: string;
  personName!: string;

  /** The person's last change, which is what a face thumbnail URL is cache-busted with. */
  personUpdatedAt!: Date;

  /** Hidden people are still offered: the places are the owner's own record, not a face to show. */
  personIsHidden!: boolean;

  @ValidateEnum({ enum: PersonDetailKind, name: 'PersonDetailKind' })
  kind!: PersonDetailKind;

  /** The kind's name as the owner saved it, such as "Home" in their own language. */
  key!: string;

  /** The text of the field, such as "Rathmines" or a street address. */
  value!: string;

  @ApiProperty({ type: 'number', format: 'double' })
  latitude!: number;

  @ApiProperty({ type: 'number', format: 'double' })
  longitude!: number;

  @ApiProperty({ format: 'date' })
  since!: string | null;

  @ValidateEnum({ enum: PersonDetailDatePrecision, name: 'PersonDetailDatePrecision', nullable: true })
  sincePrecision!: PersonDetailDatePrecision | null;

  @ApiProperty({ format: 'date' })
  until!: string | null;

  @ValidateEnum({ enum: PersonDetailDatePrecision, name: 'PersonDetailDatePrecision', nullable: true })
  untilPrecision!: PersonDetailDatePrecision | null;

  /** No Until date: the person lives or works there now. Spelled out so the client never derives it. */
  isCurrent!: boolean;
}

/**
 * One row of the picker's search, tagged with where it came from. Exactly the object named by `type`
 * is set and the other two are left out, so a client switches on `type` and reads that one.
 */
export class LocationSearchResultDto {
  @ValidateEnum({ enum: LocationSearchResultType, name: 'LocationSearchResultType' })
  type!: LocationSearchResultType;

  saved?: SavedLocationResponseDto;
  person?: PersonPlaceResponseDto;
  place?: PlacesResponseDto;
}

export const mapSavedLocation = (location: SavedLocation): SavedLocationResponseDto => ({
  id: location.id,
  name: location.name,
  latitude: location.latitude,
  longitude: location.longitude,
  createdAt: location.createdAt,
  updatedAt: location.updatedAt,
});

export const mapPersonPlace = (place: PersonPlace): PersonPlaceResponseDto => ({
  detailId: place.detailId,
  personId: place.personId,
  personName: place.personName,
  personUpdatedAt: place.personUpdatedAt,
  personIsHidden: place.personIsHidden,
  kind: place.kind,
  key: place.key,
  value: place.value,
  latitude: place.latitude,
  longitude: place.longitude,
  since: asDateString(place.since),
  sincePrecision: place.sincePrecision,
  until: asDateString(place.until),
  untilPrecision: place.untilPrecision,
  isCurrent: place.until === null,
});
