import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsNotEmpty,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { PersonDetailDatePrecision, PersonDetailKind } from 'src/enum';
import {
  AlongWith,
  AlongWithGroup,
  detailKeyToken,
  detailMatchKey,
  PersonDetail,
} from 'src/repositories/person-detail.repository';
import { asDateString } from 'src/utils/date';
import { IsDateStringFormat, Optional, ValidateBoolean, ValidateEnum, ValidateUUID } from 'src/validation';

/** Long enough for an address or a sentence, short enough that a bulk save cannot carry an essay. */
const MAX_DETAIL_LENGTH = 1000;

/**
 * How many details one person can hold. Nothing about the feature needs a limit — it is here so a
 * single bulk write cannot be used to grow the table without bound.
 */
const MAX_DETAILS_PER_PERSON = 200;

/** The same ceiling one level down, applied per detail rather than per person. */
const MAX_SUBDETAILS_PER_DETAIL = 50;

/** How many people one bulk insert can name at once, and how many keys one lookup can ask about. */
const MAX_PEOPLE_PER_BULK = 500;

export class PersonSubdetailUpsertDto {
  /** The row being edited. Absent on a subdetail that does not exist yet. */
  @ValidateUUID({ optional: true })
  id?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_DETAIL_LENGTH)
  key!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_DETAIL_LENGTH)
  value!: string;
}

/** A top-level detail without its dates, which is all a bulk insert writes. */
export class PersonDetailWithSubdetailsDto extends PersonSubdetailUpsertDto {
  /**
   * The contact field this detail is, or absent/null for a free-text one. Only top-level details
   * take one: the subdetail type has no such field, so a kind sent on a subdetail is stripped.
   */
  @ValidateEnum({ enum: PersonDetailKind, name: 'PersonDetailKind', optional: true, nullable: true })
  kind?: PersonDetailKind | null;

  /** A pin for a Home or Work detail. Both coordinates or neither; any other kind is refused one. */
  @IsLatitude()
  @Optional({ nullable: true })
  latitude?: number | null;

  @IsLongitude()
  @Optional({ nullable: true })
  longitude?: number | null;

  /**
   * What qualifies this detail rather than the person: "Class of" and "2016" under a school. Only
   * one level deep, which is why these carry no subdetails of their own.
   */
  @ValidateNested({ each: true })
  @Type(() => PersonSubdetailUpsertDto)
  @ArrayMaxSize(MAX_SUBDETAILS_PER_DETAIL)
  @Optional()
  subdetails?: PersonSubdetailUpsertDto[];
}

export class PersonDetailUpsertDto extends PersonDetailWithSubdetailsDto {
  /**
   * When the fact became true, as a full date. Snapped on write to the first day of the year or
   * month named by `sincePrecision`, so the day (and for a year, the month) sent here is ignored.
   */
  @ApiProperty({ format: 'date' })
  @IsDateStringFormat('yyyy-MM-dd')
  @Optional({ nullable: true, emptyToNull: true })
  since?: string | null;

  /** Defaults to month when `since` is given without one. */
  @ValidateEnum({ enum: PersonDetailDatePrecision, name: 'PersonDetailDatePrecision', optional: true, nullable: true })
  sincePrecision?: PersonDetailDatePrecision | null;

  /**
   * When the fact stopped being true. Set means Past, absent or null means Current — this is how a
   * whole-list save archives a row: the old row is sent back with `until` set, alongside a new row
   * without an id for the value that replaced it.
   */
  @ApiProperty({ format: 'date' })
  @IsDateStringFormat('yyyy-MM-dd')
  @Optional({ nullable: true, emptyToNull: true })
  until?: string | null;

  /** Defaults to month when `until` is given without one. */
  @ValidateEnum({ enum: PersonDetailDatePrecision, name: 'PersonDetailDatePrecision', optional: true, nullable: true })
  untilPrecision?: PersonDetailDatePrecision | null;
}

export class PersonDetailsUpdateDto {
  /**
   * The person's whole list, in the order it should be shown. Position in the array is position on
   * the page, and anything missing from it is deleted — the array is the list, not a patch to it.
   */
  @ValidateNested({ each: true })
  @Type(() => PersonDetailUpsertDto)
  @ArrayMaxSize(MAX_DETAILS_PER_PERSON)
  details!: PersonDetailUpsertDto[];
}

export class PersonDetailBulkItemDto extends PersonDetailWithSubdetailsDto {
  /**
   * Who among the people named by the request should have their existing value under this key
   * replaced rather than gaining a second row. Everyone else keeps what they had.
   */
  @ValidateUUID({ each: true, optional: true })
  replaceForPersonIds?: string[];

  /**
   * How a replacement treats the value it replaces. True (the default) moves it to Past — `until`
   * set to this month, subdetails kept with it — and adds the new value as a fresh Current row.
   * False overwrites it in place, which loses the old value.
   */
  @ValidateBoolean({ optional: true, default: true })
  archiveReplaced?: boolean;
}

export class PersonDetailsBulkAddDto {
  @ValidateUUID({ each: true })
  @ArrayNotEmpty()
  @ArrayMaxSize(MAX_PEOPLE_PER_BULK)
  personIds!: string[];

  /** Added to what each person already holds. Nothing here ever removes a detail they have. */
  @ValidateNested({ each: true })
  @Type(() => PersonDetailBulkItemDto)
  @ArrayMaxSize(MAX_DETAILS_PER_PERSON)
  details!: PersonDetailBulkItemDto[];
}

export class PersonDetailConflictSearchDto {
  @ValidateUUID({ each: true })
  @ArrayNotEmpty()
  @ArrayMaxSize(MAX_PEOPLE_PER_BULK)
  personIds!: string[];

  /** Matched with casing ignored, the same way details are matched everywhere else. */
  @IsArray()
  @IsString({ each: true })
  @MaxLength(MAX_DETAIL_LENGTH, { each: true })
  @ArrayMaxSize(MAX_DETAILS_PER_PERSON)
  keys!: string[];

  /**
   * Contact-field kinds to look up as well. A kind conflicts on the kind, never on key text, and
   * a free-text key never conflicts with a kind row, so the two lists are asked about separately.
   */
  @ValidateEnum({ enum: PersonDetailKind, name: 'PersonDetailKind', each: true, optional: true })
  kinds?: PersonDetailKind[];
}

export class PersonDetailSuggestionSearchDto {
  /** Matched anywhere in the text, not only at the start: "name" finds both "Nickname" and "Maiden name". */
  @IsString()
  @Optional()
  term?: string;

  /**
   * The key of the detail a subdetail is being typed under. Without it only top-level keys are
   * offered, since "Class of" is not a fact about a person on its own.
   */
  @IsString()
  @Optional()
  parentKey?: string;

  @IsInt()
  @Min(1)
  @Type(() => Number)
  @Optional()
  limit?: number;
}

export class PersonDetailValueSuggestionSearchDto extends PersonDetailSuggestionSearchDto {
  /**
   * The key whose values are wanted, since "Cork" means nothing without "Hometown" above it.
   *
   * Named `detailKey` rather than `key`: a query parameter called `key` is how a shared link
   * announces itself, so the guard would try to log the request in as one and turn a search for
   * "Secondary School" into "Invalid share key" before the controller ever ran.
   */
  @IsString()
  @IsNotEmpty()
  @Optional()
  detailKey?: string;

  /**
   * The contact-field kind whose values are wanted, in place of `detailKey`: kind rows are matched
   * on kind, whatever key text they were saved under. One of the two is required.
   */
  @ValidateEnum({ enum: PersonDetailKind, name: 'PersonDetailKind', optional: true })
  kind?: PersonDetailKind;
}

/** A key and a value with nothing else attached, for naming something rather than showing it. */
export class PersonDetailPairResponseDto {
  key!: string;
  value!: string;
}

/** No thumbnail: the web client builds the URL from the id alone. */
export class AlongWithPersonResponseDto {
  id!: string;
  name!: string;

  /**
   * The subject's other detail keys this person also records, named as the subject writes them.
   * Empty for someone who has this one pair in common and nothing else.
   */
  sharedKeys!: string[];

  /**
   * The subdetails both record under this very pair, named as the subject writes them.
   *
   * This is the narrow answer where `sharedKeys` is the broad one. Two people who both attended a
   * school and were both in the year of 2016 have "Class of 2016" here on the school's group, which
   * is what marks them out from the rest of the alumni.
   */
  sharedSubdetails!: PersonDetailPairResponseDto[];
}

/** One half of an along-with group: those who hold the pair Currently, or those who held it before. */
export class AlongWithGroupResponseDto {
  /**
   * The size of the whole group, which is larger than `people` once the cap is reached. The count
   * behind a `+N` is this, not the length of the list.
   */
  @ApiProperty({ type: 'integer' })
  total!: number;

  people!: AlongWithPersonResponseDto[];
}

/**
 * Everyone else recording the same key and value, split by whether their own row is Current or
 * Past. Matching ignores Current/Past on both sides; only the split reads it, and from the other
 * person's row, not the subject's. Someone holding the pair both ways counts as Current.
 */
export class AlongWithResponseDto {
  current!: AlongWithGroupResponseDto;
  past!: AlongWithGroupResponseDto;
}

/** One level down from a detail, and never shown on the person's page. */
export class PersonSubdetailResponseDto {
  id!: string;
  key!: string;
  value!: string;

  @ApiProperty({ type: 'integer' })
  sortOrder!: number;
}

export class PersonDetailResponseDto {
  id!: string;
  key!: string;
  value!: string;

  @ApiProperty({ type: 'integer' })
  sortOrder!: number;

  /** When the detail was first recorded. The box shows it on hover, as an age beside the date. */
  createdAt!: Date;

  /** When the fact became true, snapped to the start of its year or month. Null when unknown. */
  @ApiProperty({ format: 'date' })
  since!: string | null;

  @ValidateEnum({ enum: PersonDetailDatePrecision, name: 'PersonDetailDatePrecision', nullable: true })
  sincePrecision!: PersonDetailDatePrecision | null;

  /** When the fact stopped being true. Null means Current, set means Past. */
  @ApiProperty({ format: 'date' })
  until!: string | null;

  @ValidateEnum({ enum: PersonDetailDatePrecision, name: 'PersonDetailDatePrecision', nullable: true })
  untilPrecision!: PersonDetailDatePrecision | null;

  /** The contact field this detail is, or null for a free-text one. */
  @ValidateEnum({ enum: PersonDetailKind, name: 'PersonDetailKind', nullable: true })
  kind!: PersonDetailKind | null;

  /** The pin of a Home or Work detail. Both set or both null. */
  @ApiProperty({ type: 'number', format: 'double', nullable: true })
  latitude!: number | null;

  @ApiProperty({ type: 'number', format: 'double', nullable: true })
  longitude!: number | null;

  subdetails!: PersonSubdetailResponseDto[];

  alongWith!: AlongWithResponseDto;
}

/** One suggestion with how often it is already used, which is what orders the list. */
export class PersonDetailSuggestionResponseDto {
  value!: string;

  @ApiProperty({ type: 'integer' })
  count!: number;
}

/** One person already recording a key a bulk insert is about to write, and what they record. */
export class PersonDetailConflictPersonResponseDto {
  id!: string;
  name!: string;
  value!: string;
}

export class PersonDetailConflictResponseDto {
  /**
   * The key as it was asked about, so the client can match a row to its answer. For a kind
   * conflict this is the kind itself, and `kind` is set.
   */
  key!: string;

  /** The kind asked about, or null for a free-text key. */
  @ValidateEnum({ enum: PersonDetailKind, name: 'PersonDetailKind', nullable: true })
  kind!: PersonDetailKind | null;

  people!: PersonDetailConflictPersonResponseDto[];
}

/**
 * What is needed to name someone else's detail back to the subject in the subject's own words.
 *
 * Both maps are of the subject's own rows, keyed by their lowercased form. Along-with matching is
 * case-insensitive, so the other person's casing is theirs and not worth showing here — the label
 * belongs to the page it appears on.
 */
export interface PersonDetailNames {
  keys: Map<string, string>;
  subdetails: Map<string, PersonDetailPairResponseDto>;
}

export function mapPersonDetail(
  detail: PersonDetail,
  alongWith: Map<string, AlongWith>,
  names: PersonDetailNames,
): PersonDetailResponseDto {
  const group = alongWith.get(detailMatchKey(detail));
  const own = detailKeyToken(detail);

  const asGroup = (half?: AlongWithGroup): AlongWithGroupResponseDto => ({
    total: half?.total ?? 0,
    people: (half?.people ?? []).map(({ id, name, matchedKeys, matchedSubKeys, matchedSubValues }) => ({
      id,
      name,
      // The group's own key is what everyone here has in common, so it says nothing about any one
      // of them. Deduplicated because a key can be shared through more than one value.
      sharedKeys: [...new Set(matchedKeys)].filter((key) => key !== own).map((key) => names.keys.get(key) ?? key),
      // Two arrays read side by side, which is how the query has to return a list of pairs.
      sharedSubdetails: matchedSubKeys.map(
        (key, index) =>
          names.subdetails.get(`${key} ${matchedSubValues[index]}`) ?? { key, value: matchedSubValues[index] },
      ),
    })),
  });

  return {
    id: detail.id,
    key: detail.key,
    value: detail.value,
    sortOrder: detail.sortOrder,
    createdAt: detail.createdAt,
    since: asDateString(detail.since),
    sincePrecision: detail.sincePrecision,
    until: asDateString(detail.until),
    untilPrecision: detail.untilPrecision,
    kind: detail.kind,
    latitude: detail.latitude,
    longitude: detail.longitude,
    subdetails: detail.subdetails.map(({ id, key, value, sortOrder }) => ({ id, key, value, sortOrder })),
    alongWith: { current: asGroup(group?.current), past: asGroup(group?.past) },
  };
}
