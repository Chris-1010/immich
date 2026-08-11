import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { AlongWith, PersonDetail } from 'src/repositories/person-detail.repository';
import { Optional, ValidateUUID } from 'src/validation';

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

export class PersonDetailUpsertDto extends PersonSubdetailUpsertDto {
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

export class PersonDetailBulkItemDto extends PersonDetailUpsertDto {
  /**
   * Who among the people named by the request should have their existing value under this key
   * overwritten rather than gaining a second row. Everyone else keeps what they had.
   */
  @ValidateUUID({ each: true, optional: true })
  replaceForPersonIds?: string[];
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
  detailKey!: string;
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

/** Everyone else recording the same key and value. */
export class AlongWithResponseDto {
  /**
   * The size of the whole group, which is larger than `people` once the cap is reached. The count
   * behind a `+N` is this, not the length of the list.
   */
  @ApiProperty({ type: 'integer' })
  total!: number;

  people!: AlongWithPersonResponseDto[];
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
  /** The key as it was asked about, so the client can match a row to its answer. */
  key!: string;
  people!: PersonDetailConflictPersonResponseDto[];
}

/** The key and value as they are compared: both ends of a match are trimmed and lowercased. */
const matchKey = (key: string, value: string) => `${key.trim().toLowerCase()} ${value.trim().toLowerCase()}`;

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
  const group = alongWith.get(matchKey(detail.key, detail.value));
  const own = detail.key.trim().toLowerCase();

  return {
    id: detail.id,
    key: detail.key,
    value: detail.value,
    sortOrder: detail.sortOrder,
    createdAt: detail.createdAt,
    subdetails: detail.subdetails.map(({ id, key, value, sortOrder }) => ({ id, key, value, sortOrder })),
    alongWith: {
      total: group?.total ?? 0,
      people: (group?.people ?? []).map(({ id, name, matchedKeys, matchedSubKeys, matchedSubValues }) => ({
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
    },
  };
}
