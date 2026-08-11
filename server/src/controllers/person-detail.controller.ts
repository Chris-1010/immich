import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Endpoint, HistoryBuilder } from 'src/decorators';
import { AuthDto } from 'src/dtos/auth.dto';
import {
  PersonDetailConflictResponseDto,
  PersonDetailConflictSearchDto,
  PersonDetailResponseDto,
  PersonDetailsBulkAddDto,
  PersonDetailSuggestionResponseDto,
  PersonDetailSuggestionSearchDto,
  PersonDetailsUpdateDto,
  PersonDetailValueSuggestionSearchDto,
} from 'src/dtos/person-detail.dto';
import { ApiTag, Permission } from 'src/enum';
import { Auth, Authenticated } from 'src/middleware/auth.guard';
import { PersonDetailService } from 'src/services/person-detail.service';
import { UUIDParamDto } from 'src/validation';

/**
 * The person routes here rather than on `person.controller.ts` so the whole feature reads in one
 * place. The controller carries no prefix of its own, since the suggestions are not scoped to a
 * person: they are drawn from the owner's whole library.
 */
@ApiTags(ApiTag.PersonDetails)
@Controller()
export class PersonDetailController {
  constructor(private service: PersonDetailService) {}

  @Get('people/:id/details')
  @Authenticated({ permission: Permission.PersonDetailRead })
  @Endpoint({
    summary: "List a person's details",
    description:
      'Retrieve everything recorded about a person as a key and a value, in the order the page shows them. Each one carries its subdetails and the other people who record the same key and value, matched with the casing and surrounding spaces ignored. Those people are ordered by how much else they have in common, subdetails of this very pair counting ahead of details shared anywhere.',
    history: new HistoryBuilder().added('v2.4.1').alpha('v2.4.1'),
  })
  getPersonDetails(@Auth() auth: AuthDto, @Param() { id }: UUIDParamDto): Promise<PersonDetailResponseDto[]> {
    return this.service.getDetails(auth, id);
  }

  @Put('people/:id/details')
  @Authenticated({ permission: Permission.PersonDetailUpdate })
  @Endpoint({
    summary: "Replace a person's details",
    description:
      'Write the whole list at once, subdetails included. The array sent is what the person ends up with and its order is the order shown, so anything left out is deleted. A key already used elsewhere in the library is stored with the casing the library already uses, and entries blank at either end are dropped rather than rejected.',
    history: new HistoryBuilder().added('v2.4.1').alpha('v2.4.1'),
  })
  updatePersonDetails(
    @Auth() auth: AuthDto,
    @Param() { id }: UUIDParamDto,
    @Body() dto: PersonDetailsUpdateDto,
  ): Promise<PersonDetailResponseDto[]> {
    return this.service.updateDetails(auth, id, dto);
  }

  @Post('person-details/conflicts')
  @HttpCode(HttpStatus.OK)
  @Authenticated({ permission: Permission.PersonDetailRead })
  @Endpoint({
    summary: 'Find people already recording a detail key',
    description:
      'Retrieve which of the given people already record each of the given keys and what they record under it, so a bulk insert can be told apart from a bulk overwrite before anything is written. Keys are matched with their casing ignored, and someone holding a key twice is reported by the entry a replacement would rewrite. A key nobody holds is left out of the response entirely.',
    history: new HistoryBuilder().added('v2.4.1').alpha('v2.4.1'),
  })
  getPersonDetailConflicts(
    @Auth() auth: AuthDto,
    @Body() dto: PersonDetailConflictSearchDto,
  ): Promise<PersonDetailConflictResponseDto[]> {
    return this.service.getConflicts(auth, dto);
  }

  @Post('person-details/bulk')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Authenticated({ permission: Permission.PersonDetailUpdate })
  @Endpoint({
    summary: 'Add details to several people',
    description:
      "Write the same details onto every person named, adding to what each already holds rather than replacing it. A person already recording the exact key and value keeps the entry they have and only gains its subdetails; a person named under the key's replaceForPersonIds has their existing value rewritten; everyone else gains an entry at the end of their list.",
    history: new HistoryBuilder().added('v2.4.1').alpha('v2.4.1'),
  })
  addPersonDetails(@Auth() auth: AuthDto, @Body() dto: PersonDetailsBulkAddDto): Promise<void> {
    return this.service.addDetails(auth, dto);
  }

  @Get('person-details/keys')
  @Authenticated({ permission: Permission.PersonDetailRead })
  @Endpoint({
    summary: 'Suggest detail keys',
    description:
      'Retrieve the keys already used anywhere in the library, most used first, matched anywhere in the text rather than only at the start. A key written in more than one casing is offered once, in the casing it is most often written in. Only top-level keys are offered unless a parent key is given, in which case only the keys already written as subdetails of it are.',
    history: new HistoryBuilder().added('v2.4.1').alpha('v2.4.1'),
  })
  getPersonDetailKeys(
    @Auth() auth: AuthDto,
    @Query() dto: PersonDetailSuggestionSearchDto,
  ): Promise<PersonDetailSuggestionResponseDto[]> {
    return this.service.getKeySuggestions(auth, dto);
  }

  @Get('person-details/values')
  @Authenticated({ permission: Permission.PersonDetailRead })
  @Endpoint({
    summary: 'Suggest detail values',
    description:
      'Retrieve the values already recorded under one key, ranked, matched and scoped the same way as the keys are. The key is matched with its casing ignored.',
    history: new HistoryBuilder().added('v2.4.1').alpha('v2.4.1'),
  })
  getPersonDetailValues(
    @Auth() auth: AuthDto,
    @Query() dto: PersonDetailValueSuggestionSearchDto,
  ): Promise<PersonDetailSuggestionResponseDto[]> {
    return this.service.getValueSuggestions(auth, dto);
  }
}
