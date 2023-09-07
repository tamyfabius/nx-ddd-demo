// Angular Core
import { Injectable } from '@angular/core';
import {
  BehaviorSubject,
  catchError,
  concatMap,
  forkJoin,
  map,
  Observable,
  of,
  tap,
} from 'rxjs';
import { HttpParams } from '@angular/common/http';
import { Router } from '@angular/router';

// Libs
import {
  RxFormArray,
  RxFormBuilder,
  RxFormGroup,
} from '@rxweb/reactive-form-validators';
import {
  buildPageableParamsByLazyLoadEvent,
  buildRxformGroup,
  buildRxformGroupForFormArray,
  deepCopy,
  disabledFormFields,
  formConfigIgnoreProps,
  hasPermission,
  isNullOrUndefinedOrEmptyString,
  LegacyWorkload,
  NameEnvironmentEnum,
  NesReferentialService,
  OmitProperty,
  PageableModel,
  patchRxForm,
  resetRxForm,
} from '@skynes/shared/utils/util-common';
import { LazyLoadEvent, PrimeIcons } from 'primeng/api';

// Entities
import { SkynesUserModel } from '@skynes/shared/su7-models';
import { EnvironmentModel } from '../entities/environment.model';
import { WarningMessageModel } from '../entities/warning-message.model';
import { DofTicketModel } from '../entities/dof-ticket.model';
import { DofTimelineModel } from '../entities/dof-timeline.model';
import { DofRuleModel } from '../entities/dof-rule.model';
import { PatchedDofTicketModel } from '../entities/patched-dot-ticket.model';
import { DofTicketComment } from '../entities/dof-ticket-comment.model';

// Enums
import { StateEnum } from '../enums/state.enum';
import { TeamsEnum } from '../enums/teams.enum';

// Services
import { DofService } from '../infrastructure/dof.service';
import { Su7ToastService } from '@skynes/shared/ui/containers/ui-su7-toast';
import { UserService } from '@skynes/shared/utils/util-auth';
import { LayoutService } from '@sakai-layout-v2';
import { DofTicketServerModel } from '../entities/dof-ticket-server.model';
import { DofTicketRuleModel } from '../entities/dof-ticket-rule.model';
import { DofTicketServiceModel } from '../entities/dof-ticket-service.model';
import { PriorityEnum } from '../enums/priority.enum';
import { DofTicketAttachmentModel } from '../entities/dof-ticket-attachment.model';

/**
 * @class FirewallRulesRequestFacade
 * @description Operations about dof ticket form.
 */
@Injectable()
export class FirewallRulesRequestFacade {
  totalRecordRules$ = new BehaviorSubject<number>(0);

  constructor(
    private dofService: DofService<any>,
    private nesReferentialService: NesReferentialService,
    private su7ToastService: Su7ToastService,
    private layoutService: LayoutService,
    private userService: UserService,
    private router: Router
  ) {}

  /**
   * @function getDofTicketServersByCia
   * @param {string} cia
   * @param nameEnvironment
   * @returns {Observable<DofTicketServerModel[]>}
   * @description Get the equipement server data by cia.
   */
  getDofTicketServersByCia(
    cia: string,
    nameEnvironment?: string
  ): Observable<DofTicketServerModel[]> {
    let params = new HttpParams();
    params = params.append('cia', cia);
    if (nameEnvironment) {
      params = params.append('name_environment__in', nameEnvironment);
    }
    return this.nesReferentialService.getLegacyWorkloadsByParams(params).pipe(
      map((response) =>
        response
          .map(
            (legacyWorkload: LegacyWorkload) =>
              ({
                ip: legacyWorkload.ip,
                application: legacyWorkload.name_application,
                environment: legacyWorkload.name_environment,
                equipment: legacyWorkload.name_equipment,
                department: legacyWorkload.name_department,
              } as DofTicketServerModel)
          )
          .filter(
            (item, index, self) =>
              index === self.findIndex((it) => it.ip === item.ip)
          )
      )
    );
  }

  /**
   * @function getDofTicketServersByCiaAndEnvironment
   * @param {string} cia
   * @param environment
   * @returns {Observable<DofTicketServerModel[]>}
   * @description Get the equipement server data by cia and environment.
   */
  getDofTicketServersByCiaAndEnvironment(
    cia: string,
    environment: EnvironmentModel
  ): Observable<DofTicketServerModel[]> {
    const nameEnvironment = environment.envList?.toString();
    return this.getDofTicketServersByCia(cia.toUpperCase(), nameEnvironment);
  }

  /**
   * @function getUsersByTeams
   * @param {TeamsEnum[]} teams
   * @returns {Observable<SkynesUserModel[]>}
   * @description Get the users list.
   */
  getUsersByTeams(
    teams: TeamsEnum[] = [TeamsEnum.SRM, TeamsEnum.SRP]
  ): Observable<SkynesUserModel[]> {
    const teamsTmp = teams?.length > 0 ? teams : [TeamsEnum.SRM, TeamsEnum.SRP];
    let params = new HttpParams();
    params = params.append(
      teams?.length > 1
        ? 'team__in'
        : teams?.length === 0
        ? 'team__in'
        : 'team',
      teamsTmp.join(',')
    );
    return this.dofService
      .getWithQueryParams(params, 'skynes-users/')
      .pipe(map((response) => response.results as SkynesUserModel[]));
  }

  /**
   * @function createDofTicket
   * @returns {Observable<any>}
   * @description Create a dof ticket in state Draft or Submit.
   * @param dofTicket
   */
  createDofTicket(
    dofTicket: Partial<DofTicketModel>
  ): Observable<DofTicketModel> {
    return this.dofService.create<DofTicketModel>(
      dofTicket,
      'dof-tickets/',
      false
    );
  }

  /**
   * @function createDofTicketAndAssignRulesToTicket
   * @param dofTicket
   * @description create dof ticket and create rules by id dof ticket
   */
  createDofTicketAndAssignRulesToTicket(
    dofTicket: DofTicketModel
  ): Observable<DofTicketModel> {
    const rules = deepCopy(dofTicket.rules) as DofTicketRuleModel[];
    const keysToOmit = !isNullOrUndefinedOrEmptyString(dofTicket.state)
      ? this._keyToOmit(dofTicket.state)
      : [];
    const dataToSend = OmitProperty(
      { ...dofTicket },
      keysToOmit
    ) as Partial<DofTicketModel>;

    return this.createDofTicket(dataToSend).pipe(
      concatMap((response: DofTicketModel) =>
        rules.length === 0
          ? of(response)
          : this.forkJoinTicketRules(rules, response.id as number).pipe(
              concatMap(() =>
                this.getDofTicketDetail(response?.id?.toString())
              ),
              catchError(() =>
                this.getDofTicketDetail(response?.id?.toString())
              )
            )
      )
    );
  }

  /**
   * @function createTicketRule
   * @param {DofRuleModel} rule
   * @param {string} dofTicketId
   * @returns {Observable<DofRuleModel>}
   * @description Create one rule for an existing dof ticket.
   */
  createTicketRule(
    rule: DofTicketRuleModel,
    dofTicketId: string
  ): Observable<DofTicketRuleModel> {
    const newRule: DofTicketRuleModel = deepCopy(rule) as DofTicketRuleModel;
    newRule.dof_ticket = +dofTicketId;
    return this.dofService.create<DofTicketRuleModel>(
      newRule,
      'dof-ticket-rules/',
      false
    );
  }

  /**
   * @function createRuleAndReturnRulesListByDofTicket
   * @param {string} dofTicketId
   * @param {DofTicketRuleModel} rule
   * @param form
   * @returns {Observable<DofRuleModel>}
   * @description Create one rule for an existing dof ticket and return rules list by dofticket.
   */
  createRuleAndReturnRulesListByDofTicket(
    dofTicketId: string,
    rule: DofTicketRuleModel,
    form?: RxFormGroup
  ): Observable<DofTicketRuleModel[]> {
    return this.createTicketRule(rule, dofTicketId).pipe(
      concatMap((ticketRule: DofTicketRuleModel) => {
        if (form) {
          resetRxForm(form);
        }
        return this.getRulesByDofTicketId(dofTicketId);
      }),
      catchError(() => {
        if (form) {
          resetRxForm(form);
        }
        return this.getRulesByDofTicketId(dofTicketId);
      })
    );
  }

  /**
   * @function updateRuleAndReturnRulesListByDofTicket
   * @param ruleToUpdate
   */
  updateRuleAndReturnRulesListByDofTicket(
    ruleToUpdate: DofTicketRuleModel
  ): Observable<DofTicketRuleModel[]> {
    return this.dofService
      .update<DofTicketRuleModel>(
        ruleToUpdate,
        ruleToUpdate.id + '/',
        'dof-ticket-rules'
      )
      .pipe(
        concatMap((ticketRule: DofTicketRuleModel) =>
          this.getRulesByDofTicketId(ticketRule.dof_ticket.toString())
        ),
        tap(() => this.su7ToastService.showToastSuccess('Rule updated !')),
        catchError(() => this.getRulesByDofTicketId(ruleToUpdate.dof_ticket))
      );
  }

  /**
   * @function deleteTicketRule
   * @param {string} dofTicketId
   * @returns {Observable<any>}
   * @description Delete one rule for an existing dof ticket.
   */
  deleteTicketRule(dofTicketId: any): Observable<any> {
    return this.dofService
      .delete(dofTicketId + '/', 'dof-ticket-rules')
      .pipe(tap(() => this.su7ToastService.showToastSuccess('Rule deleted !')));
  }

  /**
   * @function deleteRuleAndReturnRulesListByDofTicket
   * @returns {Observable<DofTicketRuleModel[]>}
   * @description Delete one rule for an existing dof ticket and return rules list by dofticket.
   * @param dofTicketRule
   */
  deleteRuleAndReturnRulesListByDofTicket(
    dofTicketRule: DofTicketRuleModel
  ): Observable<DofTicketRuleModel[]> {
    return this.deleteTicketRule(dofTicketRule?.id).pipe(
      concatMap(() =>
        this.getRulesByDofTicketId(dofTicketRule?.dof_ticket?.toString())
      )
    );
  }

  /**
   * @function resetServiceInAddRuleForm
   * @param form
   */
  resetServiceInAddRuleForm(form: RxFormGroup): void {
    const servicesForm = <RxFormArray>form.controls['services'];
    servicesForm.reset();
    const servicesList = servicesForm.value as DofTicketServiceModel[];
    if (servicesList.length > 1) {
      servicesList.forEach((v: any, i: number) => {
        if (i !== 0) {
          this.removeServiceInRule(servicesForm, i);
        }
      });
    }
  }

  /**
   * @function deleteDofTicketRuleFromRulelist
   * @param id
   * @param rowData
   * @description Delete one rule for an existing dof tikect rule list.
   */
  deleteDofTicketRuleFromRulelist(
    id: number,
    rowData: DofTicketRuleModel[]
  ): DofTicketRuleModel[] {
    return rowData.filter((rule) => rule.id !== id);
  }

  /**
   * @function refuseImplementationWithComment
   * @param id
   * @param comment
   * @param state
   */
  refuseImplementationWithComment(
    id: any,
    comment: string,
    state: StateEnum
  ): Observable<[DofTicketComment, DofTicketModel]> {
    return forkJoin([
      this.createComment(id, comment),
      this.patchDofTicket(id, state),
    ]).pipe(
      tap(() => this.su7ToastService.showToastSuccess('Dof ticket refused !'))
    );
  }

  /**
   * @function forkJoinTicketRules
   * @param rules
   * @param {string} dofTicketId
   * @returns {Observable<DofRuleModel[]>}
   * @description Fork join all the post request for rules creation.
   */
  forkJoinTicketRules(
    rules: DofTicketRuleModel[],
    dofTicketId: number
  ): Observable<DofTicketRuleModel[]> {
    const forkTab: Observable<DofTicketRuleModel>[] = [];
    if (dofTicketId) {
      rules.forEach((element) =>
        forkTab.push(this.createTicketRule(element, dofTicketId?.toString()))
      );
    }
    return forkJoin(forkTab);
  }

  /**
   * @function patchDofTicket
   * @param id
   * @param state
   * @param dofTicketForm
   */
  patchDofTicket(
    id: any,
    state: StateEnum = StateEnum.DRAFT,
    dofTicketForm: RxFormGroup | null = null,
    stateComment?: string
  ): Observable<DofTicketModel> {
    let patchedDofTicket: PatchedDofTicketModel = {};
    if (state !== StateEnum.DRAFT) {
      patchedDofTicket.state = state;
    }
    if (dofTicketForm !== null) {
      if (dofTicketForm.isModified) {
        patchedDofTicket = {
          ...patchedDofTicket,
          ...OmitProperty(dofTicketForm?.modifiedValue, [
            'id',
            'duration',
            'rules',
          ]),
        };
      }
    }

    if (stateComment) {
      patchedDofTicket = { ...patchedDofTicket, state_comment: stateComment };
    }

    return this.dofService
      .patch('dof-tickets', `${id}/`, patchedDofTicket)
      .pipe(
        tap(() => this.su7ToastService.showToastSuccess('Dof Ticket updated !'))
      );
  }

  /**
   * @function createDofTicketAndAssignRulesToTicketAndUpdateToWaitingAttachment
   * @param dofTicket
   * @param form
   */
  createDofTicketAndAssignRulesToTicketAndUpdateToWaitingAttachment(
    dofTicket: DofTicketModel
  ): Observable<DofTicketModel> {
    return this.createDofTicketAndAssignRulesToTicket(dofTicket).pipe(
      concatMap((response) =>
        this.patchDofTicket(response?.id, StateEnum.WAITINGATTACHMENT)
      )
    );
  }

  /**
   * @function sendAttachment
   * @param dofTicketAttachment
   */
  sendAttachment(dofTicketAttachment: any): Observable<any | null> {
    const formData: FormData = new FormData();
    Object.keys(dofTicketAttachment).forEach((key: string) => {
      if (dofTicketAttachment[key] !== null) {
        formData.append(key, dofTicketAttachment[key]);
      }
    });
    return this.dofService
      .createWithFormData('dof-ticket-attachments/', formData)
      .pipe(
        tap(() => this.su7ToastService.showToastSuccess('Attachment sended !'))
      );
  }

  /**
   * @function sendAttachmentAndGetAttachmentByDofTicket
   * @param dofTicketAttachment
   * @description send attachments and get attachment by dofin ticket
   */
  sendAttachmentAndGetAttachmentByDofTicket(
    dofTicketAttachment: DofTicketAttachmentModel
  ): Observable<DofTicketAttachmentModel> {
    return this.sendAttachment(dofTicketAttachment).pipe(
      concatMap(() =>
        this.getDofTicketDetail(dofTicketAttachment?.ticket_id).pipe(
          map((response) => this.buildDofTicketAttachmentByDofTicket(response))
        )
      )
    );
  }

  /**
   * @function getDofTicketDetail
   * @param {string} id
   * @returns {Observable<DofTicketModel>}
   * @description Get dof ticket detail by id.
   */
  getDofTicketDetail(id: unknown): Observable<DofTicketModel> {
    return this.dofService.getById<any>(id + '/', 'dof-tickets').pipe(
      map((response: any) => {
        const dofTicket: DofTicketModel = {
          ...new DofTicketModel(),
          ...response,
          duration: response.end_date ? 'Temporary' : 'Permanent',
        };
        return dofTicket;
      })
    );
  }

  /**
   * @function getRulesByDofTicketId
   * @param {string} id
   * @returns {Observable<DofTicketModel>}
   * @description Get dof ticket detail by id.
   */
  getRulesByDofTicketId(id: unknown): Observable<DofTicketRuleModel[]> {
    return this.dofService
      .getPageableList<DofTicketRuleModel>(
        `dof-ticket-rules/?dof_ticket_id=${id?.toString()}`
      )
      .pipe(
        map((response: PageableModel<DofTicketRuleModel>) => {
          this.totalRecordRules$.next(response.count);
          return response.results as DofTicketRuleModel[];
        })
      );
  }

  /**
   * @function lazyLoadRulesByDofTicketId
   * @param lazyLoadEvent
   * @param id
   */
  lazyLoadRulesByDofTicketId(
    id: unknown,
    lazyLoadEvent: LazyLoadEvent
  ): Observable<DofTicketRuleModel[]> {
    return this.dofService
      .getLazyLoadPageableListWithQueryParams<DofTicketRuleModel>(
        `/dof-ticket-rules/?dof_ticket_id=${id?.toString()}`,
        buildPageableParamsByLazyLoadEvent(lazyLoadEvent)
      )
      .pipe(
        map((response: PageableModel<DofTicketRuleModel>) => {
          this.totalRecordRules$.next(response.count);
          return response.results as DofTicketRuleModel[];
        })
      );
  }

  /**
   * @function buildRulesList
   * @description Add one rule to dof ticket.
   * @param dofTicketRuleList
   * @param dofTicketRule
   * @param dofTicketRuleForm
   */
  buildRulesList(
    dofTicketRuleList: DofTicketRuleModel[],
    dofTicketRule: DofTicketRuleModel,
    dofTicketRuleForm: RxFormGroup
  ): DofTicketRuleModel[] {
    dofTicketRule = {
      ...new DofRuleModel(),
      ...dofTicketRule,
      services: dofTicketRule?.services?.map((x) => Object.assign({}, x)),
    } as DofTicketRuleModel;
    dofTicketRuleList.push(dofTicketRule);
    resetRxForm(dofTicketRuleForm);
    return dofTicketRuleList;
  }

  /**
   * @function buildCreateDofTicketForm
   * @description build create dof ticket form
   * @return RxFormGroup
   */
  buildCreateDofTicketForm(dofTicket?: DofTicketModel): RxFormGroup {
    let initDataForm = new DofTicketModel();
    if (dofTicket) {
      initDataForm = {
        ...initDataForm,
        priority: dofTicket.priority,
        duration: dofTicket.end_date ? 'Temporary' : 'Permanent',
        rules: dofTicket.rules,
      };
    }
    const owner = {
      ...initDataForm.owner,
      username: this._getUsername(this.layoutService.userInfo),
    };
    initDataForm.mode = 'CREATE';
    const ignoreProps = ['owner.iup', 'owner.email', 'assignee', 'teams'];
    const form = buildRxformGroup(DofTicketModel, initDataForm, ignoreProps);
    patchRxForm(form, {
      owner,
      state: StateEnum.DRAFT,
      priority: PriorityEnum.LOW,
    });
    const fieldsToDisable = ['state', 'owner', 'implementation_desired_date'];
    disabledFormFields(fieldsToDisable, form);
    return form;
  }

  /**
   * @function buildUpdateDofTicketForm
   * @param data
   */
  buildUpdateDofTicketForm(data: DofTicketModel): RxFormGroup {
    const { teams, ...rest } = data;
    data = {
      ...rest,
      mode: 'UPDATE',
      teams: teams,
      duration: data.end_date ? 'Temporary' : 'Permanent',
    };

    const getPropsToIgnoreByState = (state: StateEnum): Array<string> => {
      let arr = ['owner.iup', 'owner.email'];
      if (
        state === StateEnum.DRAFT ||
        state === StateEnum.WAITINGUPDATE ||
        state === StateEnum.WAITINGATTACHMENT
      ) {
        arr = [...arr, 'assignee', 'teams'];
      }
      return arr;
    };

    const rxFormBuilder: RxFormBuilder = new RxFormBuilder();
    const ignoreProps = getPropsToIgnoreByState(data?.state);
    const form: RxFormGroup = <RxFormGroup>(
      rxFormBuilder.formGroup(
        DofTicketModel,
        data,
        formConfigIgnoreProps(ignoreProps)
      )
    );
    this._setUpFormFieldsByState(
      data.state,
      form,
      hasPermission('change_validation_to_implementation_state_dofticket')
    );
    return form;
  }

  /**
   * @function buildDofRuleForm
   * @return {RxFormGroup}
   * @description Instantiates the dof rule form.
   */
  buildDofRuleForm(): RxFormGroup {
    const initDataForm = new DofTicketRuleModel();
    return buildRxformGroup(DofTicketRuleModel, initDataForm);
  }

  /**
   * @function buildUpdateDofRuleForm
   * @return {RxFormGroup}
   * @description Instantiates the updated dof rule form.
   */
  buildUpdateDofRuleForm(rule: DofTicketRuleModel): RxFormGroup {
    const dataForm: DofTicketRuleModel = {
      ...rule,
      source_type: isNullOrUndefinedOrEmptyString(rule.source_cia)
        ? 'any'
        : 'ip',
      destination_type: isNullOrUndefinedOrEmptyString(rule.destination_cia)
        ? 'any'
        : 'ip',
    };
    return buildRxformGroup(DofTicketRuleModel, dataForm);
  }

  /**
   * @function getEnvironments
   * @returns {EnvironmentModel[]}
   * @description Get the environments listing.
   */
  getEnvironments(): EnvironmentModel[] {
    return [
      {
        value: 'Prod',
        name: 'PROD',
        envList: [NameEnvironmentEnum.PROD],
        description: 'PROD / PRD / Production',
      },
      {
        value: 'Bench',
        name: 'BENCH',
        envList: [NameEnvironmentEnum.BENCH],
        description: 'BENCH / BCH  / Pré-production',
      },
      {
        value: 'hp',
        name: 'HPROD',
        envList: [
          NameEnvironmentEnum.UAT,
          NameEnvironmentEnum.DEV,
          NameEnvironmentEnum.TEST,
        ],
        description:
          'UAT / DEV / TEST / MAP / DEV / Développement / Assemblage / Vérification / Validation / Homologation / Hors Prod',
      },
    ];
  }

  /**
   * @function getEnvSelected
   * @param envName
   */
  getEnvSelected(envName: string): EnvironmentModel {
    return this.getEnvironments().find(
      (item) => envName?.toUpperCase() === item.value?.toUpperCase()
    ) as EnvironmentModel;
  }

  /**
   * @function getWarningPortMessages
   * @description All port warning messages.
   * @returns {WarningMessageModel}
   */
  getWarningPortMessages(): WarningMessageModel {
    return {
      'TCP/20': `FTP - This protocol transmit unencrypted informations on network.
        Vulnerable to network listening and MITM attacks (man-in-the-middle attack).
        Please use SFTP alternative or encrypt data with TLS (Transport Layer Security) 1.2/1.3.`,
      'TCP/21': `FTP - This protocol transmit unencrypted informations on network.
        Vulnerable to network listening and MITM attacks (man-in-the-middle attack).
        Please use SFTP alternative or encrypt data with TLS (Transport Layer Security) 1.2/1.3.`,
      'TCP/23': `TELNET - This port is not allowed in the company. Please use the SSH alternative.`,
      'TCP/25': `SMTP - This protocol transmit unencrypted informations on network.
        Vulnerable to network listening and MITM attacks (man-in-the-middle attack).
        Please use SFTP alternative or encrypt data with TLS (Transport Layer Security) 1.2/1.3.`,
      'TCP/514': `RSH - This port is not allowed in the company. Please use the SSH alternative.`,
      'TCP/80': `HTTP - This protocol transmit unencrypted informations on network.
        Vulnerable to network listening and MITM attacks (man-in-the-middle attack).
        Please use HTTPS(TCP 443) alternative with TLS (Transport Layer Security) 1.2/1.3.`,
      'TCP/110': `POP3 - This protocol transmit unencrypted informations on network.
        Vulnerable to network listening and MITM attacks (man-in-the-middle attack).
        Please ensure data encryption with TLS (Transport Layer Security) 1.2/1.3 - POP3S(TCP 995)`,
      'TCP/143': `IMAP - This protocol transmit unencrypted informations on network.
        Vulnerable to network listening and MITM attacks (man-in-the-middle attack).
        Please ensure data encryption with TLS (Transport Layer Security) 1.2/1.3 - IMAPS(TCP 993)`,
      'TCP/137': `NBName - This protocol is obsolete, Netbios (TCP 445) has replaced it since the 2000s.`,
      'UDP/137': `NBName - This protocol is obsolete, Netbios (TCP 445) has replaced it since the 2000s.`,
      'UDP/138': `NBDatagram - This protocol is obsolete, Netbios (TCP 445) has replaced it since the 2000s.`,
      'TCP/139': `NBSession - This protocol is obsolete, Netbios (TCP 445) has replaced it since the 2000s.`,
    };
  }

  /**
   * @function getCommentsByDoftickeid
   * @param {string} id
   * @description get comments by dof ticket id
   */
  getCommentsByDoftickeid(id: unknown): Observable<DofTicketComment[]> {
    return this.dofService
      .getPageableList<DofTicketComment>(
        `dof-ticket-comments/?dof_ticket_id=${id?.toString()}`
      )
      .pipe(
        map((response: PageableModel<DofTicketComment>) => response.results)
      );
  }

  /**
   * @function getCommentsTimelineByDoftickeid
   * @param {string} id
   */
  getCommentsTimelineByDoftickeid(id: unknown): Observable<DofTimelineModel[]> {
    return this.getCommentsByDoftickeid(id).pipe(
      map((res: DofTicketComment[]) =>
        this.buildDofTimelines(res).sort((a, b) => {
          if (a.id < b.id) return 1;
          return -1;
        })
      )
    );
  }

  /**
   * @function createComment
   * @param dofTicketId
   * @param comment
   * @description add comment to the dof ticket
   */
  createComment(
    dofTicketId: any,
    comment: string
  ): Observable<DofTicketComment> {
    const newComment: Partial<DofTicketComment> = {
      comment,
      dof_ticket: dofTicketId,
    };
    return this.dofService.create<DofTicketComment>(
      newComment,
      'dof-ticket-comments/',
      false
    );
  }

  /**
   * @function createCommentAndReturnCommentsTimeline
   * @param dofTicketId
   * @param comment
   */
  createCommentAndReturnCommentsTimeline(
    dofTicketId: any,
    comment: string
  ): Observable<DofTimelineModel[]> {
    return this.createComment(dofTicketId, comment).pipe(
      concatMap((res: DofTicketComment) =>
        this.getCommentsTimelineByDoftickeid(res?.dof_ticket)
      )
    );
  }

  /**
   * @function redirectToDofTicketDetails
   * @param id
   */
  redirectToDofTicketDetails(id: any): void {
    this._redirectTo(`/dof/firewall-rules-request/dof-ticket-detail/${id}`);
  }

  /**
   * @function buildDofTimelines
   * @param comments
   * @description create a dof timelines
   */
  buildDofTimelines(comments: DofTicketComment[]): DofTimelineModel[] {
    return comments?.length > 0
      ? (comments.map((com) => ({
          ...com,
          icon: PrimeIcons.COMMENT,
          color: '#673AB7',
          tagIcon: this._buildTagIconTimeline(com),
        })) as DofTimelineModel[])
      : [];
  }

  /**
   * @function setServiceInRule
   * @param arrayForm
   */
  setServiceInRule(arrayForm: any): void {
    const initDataForm = new DofTicketServiceModel();
    (arrayForm as RxFormArray).push(
      buildRxformGroupForFormArray(DofTicketServiceModel, initDataForm)
    );
  }

  /**
   * @function removeServiceInRule
   * @param arrayForm
   * @param index
   */
  removeServiceInRule(arrayForm: any, index: number): void {
    (arrayForm as RxFormArray).removeAt(index);
  }

  /**
   * @function getIconState
   * @param value
   * @private
   */
  getIconState(value: unknown): string {
    let classIcon = 'mr-1 dofin-icon';
    switch (value) {
      case StateEnum.DRAFT:
        classIcon += ' dofin-icon-pencil';
        break;
      case StateEnum.WAITINGATTACHMENT:
        classIcon = 'pi pi-paperclip mr-1';
        break;
      case StateEnum.WAITINGUPDATE:
        classIcon = 'pi pi-file-edit mr-1';
        break;
      case StateEnum.VALIDATION:
        classIcon += ' dofin-icon-check-circle';
        break;
      case StateEnum.IMPLEMENTATION:
        classIcon += ' dofin-icon-cog';
        break;
      case 'CANCELLATION':
        classIcon += ' dofin-icon-pencil';
        break;
      case StateEnum.CANCELED:
        classIcon += ' dofin-icon-pencil';
        break;
      case StateEnum.TESTING:
        classIcon = 'pi pi-sync mr-1';
        break;
      case 'CLOSING':
        classIcon = 'pi pi-lock mr-1';
        break;
      case StateEnum.CLOSED || 'CLOSING':
        classIcon = 'pi pi-lock mr-1';
        break;
      default:
        classIcon = '';
        break;
    }
    return classIcon;
  }

  /**
   * @function updateDofTicketForm
   * @param dofTicketForm
   * @param obj
   * @description update dofticket form
   */
  updateDofTicketForm(dofTicketForm: RxFormGroup, obj: object): void {
    patchRxForm(dofTicketForm, obj);
  }

  /**
   * @function buildDofTicketAttachmentByDofTicket
   * @param dofTicket
   * @description
   */
  buildDofTicketAttachmentByDofTicket(
    dofTicket: DofTicketModel
  ): DofTicketAttachmentModel {
    const dofTicketAttachment = new DofTicketAttachmentModel();
    if (dofTicket?.id) {
      dofTicketAttachment.ticket_id = dofTicket.id.toString();
      dofTicketAttachment.architecture_diagram_file =
        dofTicket.architecture_diagram_url;
      dofTicketAttachment.exemption_file = dofTicket.exemption_url;
    }
    return dofTicketAttachment;
  }

  /**
   * @function isOwner
   * @description Check if current user is the ticket's owner.
   * @returns {boolean}
   */
  isOwner(owner: SkynesUserModel): boolean {
    return this.userService.getSkynesUsersMeInLocalStorage().iup === owner.iup;
  }

  /**
   * @function _setUpFormFieldsByState
   * @param {StateEnum} state
   * @param {RxFormGroup} form
   * @param {boolean} isUserNesAdmin
   * @description Enable/Disable fields according to the current state.
   * @returns {RxFormGroup}
   * @private
   */
  private _setUpFormFieldsByState(
    state: StateEnum,
    form: RxFormGroup,
    isUserNesAdmin: boolean
  ): RxFormGroup {
    const fieldsToDisable = ['state', 'owner', 'implementation_desired_date'];

    switch (state) {
      case StateEnum.VALIDATION:
        fieldsToDisable.push(
          ...['priority', 'description', 'duration', 'end_date']
        );
        if (!isUserNesAdmin) fieldsToDisable.push(...['assignee', 'teams']);
        break;
      case StateEnum.IMPLEMENTATION:
        fieldsToDisable.push(
          ...['priority', 'description', 'duration', 'end_date']
        );
        if (!isUserNesAdmin) fieldsToDisable.push(...['assignee', 'teams']);
        break;
      case StateEnum.WAITINGATTACHMENT:
        fieldsToDisable.push(
          ...['priority', 'description', 'duration', 'end_date']
        );
        break;
      case StateEnum.TESTING:
        form.disable();
        return form;
      case StateEnum.CLOSED:
        form.disable();
        return form;
    }
    disabledFormFields(fieldsToDisable, form);

    return form;
  }

  /**
   * @function _getUsername
   * @param userInfo
   * @private
   */
  private _getUsername(userInfo: any): string {
    return `${userInfo?.given_name} ${userInfo?.family_name}`;
  }

  /**
   * @function _keyToOmit
   * @param state
   * @private
   */
  private _keyToOmit(state: StateEnum): string[] {
    let keysToOmit = [
      'id',
      'alias',
      'architecture_diagram_url',
      'exemption_url',
      'rules',
      'created_at',
      'updated_at',
      'last_status_update_date',
      'sun_ticket_id',
      'tufin_ticket_id',
      'statistic',
      'mode',
      'duration',
    ];

    if (state === StateEnum.DRAFT || state === StateEnum.WAITINGUPDATE) {
      keysToOmit = [...keysToOmit, 'assignee', 'teams'];
    }

    if (state === StateEnum.VALIDATION || state === StateEnum.IMPLEMENTATION) {
      keysToOmit = [
        ...keysToOmit,
        'owner',
        'exemption_description',
        'end_date',
        'implementation_desired_date',
        'description',
        'priority',
      ];
    }
    if (
      state === StateEnum.IMPLEMENTATION ||
      state === StateEnum.TESTING ||
      state === StateEnum.CLOSED
    ) {
      keysToOmit = [
        ...keysToOmit,
        'owner',
        'exemption_description',
        'end_date',
        'implementation_desired_date',
        'description',
        'priority',
        'assignee',
        'teams',
      ];
    }

    return keysToOmit;
  }

  /**
   * @function redirectTo
   * @param url
   */
  private _redirectTo(url: string): void {
    this.router.navigate([url]);
  }

  /**
   * @function getTagIconTimeline
   * @param comment
   * @private
   * @description get tag icon for timeline
   */
  private _buildTagIconTimeline(comment: DofTicketComment): {
    oldStateIcon: string;
    newStateIcon: string;
  } {
    const fieldStateValue = comment?.fields?.find(
      (f) => f?.field_name?.toLowerCase() === 'state'
    );
    const oldStateIcon = this.getIconState(fieldStateValue?.old_value);
    const newStateIcon = this.getIconState(fieldStateValue?.new_value);
    return { oldStateIcon, newStateIcon };
  }

  /**
   * @function _buildRuleWithDetails
   * @description Wainting refactoring
   * @param rules
   * @private
   
  private _buildRulesWithDetails(
    rules: DofTicketRuleModel[]
  ): Observable<DofTicketRuleModel[]> {
    const forkTab: Observable<DofTicketServerModel[]>[] = [];
    if (rules && rules.length > 0) {
      rules?.forEach((rule) => {
        const sourceEnvName =
          rule.source_servers.length > 0
            ? rule.source_servers[0].environment?.toUpperCase()
            : '';
        const destEnvName =
          rule.destination_servers.length > 0
            ? rule.destination_servers[0].environment?.toUpperCase()
            : '';
        if (
          !isNullOrUndefinedOrEmptyString(sourceEnvName) &&
          !isNullOrUndefinedOrEmptyString(rule.source_cia)
        ) {
          const selectedSourceEnv = this.getEnvSelected(sourceEnvName);
          forkTab.push(
            this.getDofTicketServersByCiaAndEnvironment(
              rule.source_cia as string,
              selectedSourceEnv
            )
          );
        }

        if (
          !isNullOrUndefinedOrEmptyString(destEnvName) &&
          !isNullOrUndefinedOrEmptyString(rule.destination_cia)
        ) {
          const selectedDestinationEnv = this.getEnvSelected(destEnvName);
          forkTab.push(
            this.getDofTicketServersByCiaAndEnvironment(
              rule.destination_cia as string,
              selectedDestinationEnv
            )
          );
        }
      });
    }

    return forkTab.length > 0
      ? forkJoin(forkTab).pipe(
          map((results) => {
            rules = rules?.map((item) => {
              if (results.length > 1) {
                const sourceServerList = results[0];
                const destinationServerList = results[1];
                if (item.source_servers.length > 0) {
                  item.source_type = 'ip';
                  item.source_servers = sourceServerList.filter((ss) =>
                    item.source_servers.some((it) => it.ip === ss.ip)
                  );
                } else {
                  item.source_type = 'any';
                }
                if (item.destination_servers.length > 0) {
                  item.destination_type = 'ip';
                  item.destination_servers = destinationServerList.filter(
                    (ds) =>
                      item.destination_servers.some((it) => it.ip === ds.ip)
                  );
                } else {
                  item.destination_type = 'any';
                }
              } else if (results.length === 1) {
                const serversList = results[0];
                if (item.source_servers.length > 0) {
                  item.source_type = 'ip';
                  item.source_servers = serversList.filter((ss) =>
                    item.source_servers.some((it) => it.ip === ss.ip)
                  );
                } else {
                  item.source_type = 'any';
                }
                if (item.destination_servers.length > 0) {
                  item.destination_type = 'ip';
                  item.destination_servers = serversList.filter((ds) =>
                    item.destination_servers.some((it) => it.ip === ds.ip)
                  );
                } else {
                  item.destination_type = 'any';
                }
              }
              return item;
            });
            return rules;
          })
        )
      : of(rules);
  }
  */
}
