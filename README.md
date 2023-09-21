// Angular Core
import { Component, OnDestroy, OnInit } from '@angular/core';
import { BehaviorSubject, finalize, Observable, of, Subscription } from 'rxjs';
import { ActivatedRoute } from '@angular/router';

// Libs
import { RxFormGroup } from '@rxweb/reactive-form-validators';
import {
  DofTicketAttachmentModel,
  DofTicketModel,
  DofTicketRuleModel,
  DofTicketServerModel,
  DofTimelineModel,
  EnvironmentModel,
  FirewallRulesRequestFacade,
  StateEnum,
  TeamsEnum,
} from '@skynes/dof/domain';
import {
  getItemFromLocalStorage,
  hasPermission,
  isNullOrUndefinedOrEmptyString,
  setLocation,
  SkyneUserMeModel,
} from '@skynes/shared/utils/util-common';
import { SkynesUserModel } from '@skynes/shared/su7-models';
import { LazyLoadEvent } from 'primeng/api';
import {
  PermissionManagerService,
  PermissionTypeEnum,
} from '@skynes/shared/utils/util-permission-manage';

/**
 * @class UpdateDofTicketComponent
 * @description Dof ticket update form container.
 * @implements OnInit, OnDestroy
 */
@Component({
  selector: 'dof-update-dof-ticket',
  templateUrl: './update-dof-ticket.component.html',
  styleUrls: ['./update-dof-ticket.component.scss'],
})
export class UpdateDofTicketComponent implements OnInit, OnDestroy {
  /**
   * @description Dof ticket request form.
   */
  dofTicketForm!: RxFormGroup;

  /**
   * @description Dof ticket rule form.
   */
  dofTicketRuleForm: RxFormGroup =
    this._firewallRulesRequestFacade.buildDofRuleForm();

  /**
   * @description Dof ticket rule update form .
   */
  dofTicketRuleUpdateForm!: RxFormGroup;

  /**
   * @description Display refuse implementation dialog
   */
  displayRefuseImplementationDialog = false;

  /**
   * @description Display implementation comment dialog
   */
  displayImplementationCommentDialog = false;

  /**
   * @description Display add source dialog
   */
  displayAddSourceDialog = false;

  /**
   * @description
   */
  iconState = '';

  /**
   * @description
   */
  stateEnum: typeof StateEnum = StateEnum;

  /**
   * @description
   */
  permissionTypeEnum: typeof PermissionTypeEnum = PermissionTypeEnum;

  /**
   * @description Environment list.
   */
  environmentsList: EnvironmentModel[] =
    this._firewallRulesRequestFacade.getEnvironments();

  /**
   * @description
   */
  selectedSourceEnv!: EnvironmentModel;

  /**
   * @description
   */
  selectedDestinationEnv!: EnvironmentModel;

  /**
   * @description Dof ticket rule list.
   */
  dofTicketRuleList$!: Observable<DofTicketRuleModel[]>;

  /**
   * @description
   */
  totalRecordRules$ = this._firewallRulesRequestFacade.totalRecordRules$;

  /**
   * @description Dof ticket attachment
   */
  dofTicketAttachment$ = of(new DofTicketAttachmentModel());

  /**
   * @description Dof users list.
   */
  users$!: Observable<SkynesUserModel[]>;

  /**
   * @description Source ips list.
   */
  ipsDestinationList$!: Observable<DofTicketServerModel[]>;

  /**
   * @description Destination ips list.
   */
  ipsSourceList$!: Observable<DofTicketServerModel[]>;

  /**
   * @description
   */
  loading$: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false);

  /**
   * @description Send attchement loading
   */
  sendAttchmentLoading$: BehaviorSubject<boolean> =
    new BehaviorSubject<boolean>(false);
  /**
   * @description
   */
  loadingDofTicketRule = true;

  /**
   * @description
   */
  dofTicketId = this._activetedRoute.snapshot.params?.['dofTicketId'];

  /**
   * @description  Dof ticket comments timeline list
   */
  dofTicketCommentsTimeline$: Observable<DofTimelineModel[]> =
    this._firewallRulesRequestFacade.getCommentsTimelineByDoftickeid(
      this.dofTicketId
    );

  /**
   * @description
   */
  firstRowSourceServers = 0;

  /**
   * @description
   */
  rowsSourceServers = 10;

  /**
   * @description
   */
  firstRowDestinationServers = 0;

  /**
   * @description
   */
  rowsDestinationServers = 100;

  /**
   * @description
   */
  loadingSourceServers = false;

  /**
   * @description
   */
  loadingDestinationServers = false;

  /**
   * @description Total records source servers.
   */
  totalRecordSourceServers$ =
    this._firewallRulesRequestFacade.totalRecordSourceLegacyWorkloads$;

  /**
   * @description Total records destination server.
   */
  totalRecordDestinationServers$ =
    this._firewallRulesRequestFacade.totalRecordDestinationLegacyWorkloads$;

  /**
   * @description
   */
  sourceDialogMode: 'ADD' | 'UPDATE' = 'ADD';

  /**
   * @description
   */
  private _sub = new Subscription();

  constructor(
    private _firewallRulesRequestFacade: FirewallRulesRequestFacade,
    private _activetedRoute: ActivatedRoute,
    private _permissionManagerService: PermissionManagerService
  ) {}

  ngOnInit(): void {
    setLocation(
      `dof/firewall-rules-request/dof-ticket-detail/${this.dofTicketId}`
    );
    this._initData();
  }

  ngOnDestroy(): void {
    this._sub.unsubscribe();
  }

  /**
   * @function onSelectTeam
   * @param {TeamsEnum[]} teams
   * @description Selected team event callback.
   */
  onSelectTeam(teams: TeamsEnum[]): void {
    this.users$ = this._firewallRulesRequestFacade.getUsersByTeams(teams);
  }

  /**
   * @function onEnvironmentSourceSelected
   * @param {{env: EnvironmentModel, cia: string}} data
   * @description Environment source selection event callback.
   */
  onEnvironmentSourceSelected(data: {
    environment: EnvironmentModel | undefined;
    cia: string;
  }): void {
    this._firewallRulesRequestFacade.setSelectedCiaAndEnvironementSource(data);
    const customParams =
      this._firewallRulesRequestFacade.buildPageableParamsMultiselect(
        this.firstRowSourceServers,
        this.rowsSourceServers
      );
    this.loadingSourceServers = true;
    this.ipsSourceList$ = this._firewallRulesRequestFacade
      .lazyLoadDofTicketServersByCiaAndEnvironment(
        data.cia,
        data.environment,
        customParams,
        'SOURCE'
      )
      .pipe(finalize(() => (this.loadingSourceServers = false)));
  }

  /**
   * @function onEnvironmentDestinationSelected
   * @param {{environment: EnvironmentModel, cia: string}} data
   * @description Environment destination selection event callback.
   */
  onEnvironmentDestinationSelected(data: {
    environment: EnvironmentModel | undefined;
    cia: string;
  }): void {
    this._firewallRulesRequestFacade.setSelectedCiaAndEnvironementDestination(
      data
    );
    const customParams =
      this._firewallRulesRequestFacade.buildPageableParamsMultiselect(
        this.firstRowDestinationServers,
        this.rowsDestinationServers
      );
    this.loadingDestinationServers = true;
    this.ipsDestinationList$ = this._firewallRulesRequestFacade
      .lazyLoadDofTicketServersByCiaAndEnvironment(
        data.cia,
        data.environment,
        customParams,
        'DESTINATION'
      )
      .pipe(finalize(() => (this.loadingDestinationServers = false)));
  }

  /**
   * @function
   * @param event
   */
  onDestinationServersPageChange(event: any): void {
    const data =
      this._firewallRulesRequestFacade.getSelectedCiaAndEnvironementDestination();
    if (data) {
      this.firstRowDestinationServers = event.first;
      this.rowsDestinationServers = event.rows;
      const customParams =
        this._firewallRulesRequestFacade.buildPageableParamsMultiselect(
          this.firstRowDestinationServers,
          this.rowsDestinationServers
        );
      this.loadingDestinationServers = true;
      this.ipsDestinationList$ = this._firewallRulesRequestFacade
        .lazyLoadDofTicketServersByCiaAndEnvironment(
          data.cia,
          data.environment,
          customParams,
          'DESTINATION'
        )
        .pipe(finalize(() => (this.loadingDestinationServers = false)));
    }
  }

  /**
   * @function
   * @param event
   */
  onSourceServersPageChange(event: any): void {
    const data =
      this._firewallRulesRequestFacade.getSelectedCiaAndEnvironementSource();
    this.loadingSourceServers = true;
    if (data) {
      this.firstRowSourceServers = event.first;
      this.rowsSourceServers = event.rows;
      const customParams =
        this._firewallRulesRequestFacade.buildPageableParamsMultiselect(
          this.firstRowSourceServers,
          this.rowsSourceServers
        );
      this.ipsSourceList$ = this._firewallRulesRequestFacade
        .lazyLoadDofTicketServersByCiaAndEnvironment(
          data.cia,
          data.environment,
          customParams,
          'SOURCE'
        )
        .pipe(finalize(() => (this.loadingSourceServers = false)));
    }
  }

  /**
   * @function onFilterSourceServers
   * @param searchTerm
   */
  onFilterSourceServers(searchTerm: string): void {
    const data =
      this._firewallRulesRequestFacade.getSelectedCiaAndEnvironementSource();
    this.loadingSourceServers = true;
    if (data) {
      const customParams =
        this._firewallRulesRequestFacade.buildPageableParamsMultiselect(
          0,
          10,
          searchTerm
        );
      this.ipsSourceList$ = this._firewallRulesRequestFacade
        .lazyLoadDofTicketServersByCiaAndEnvironment(
          data.cia,
          data.environment,
          customParams,
          'SOURCE'
        )
        .pipe(finalize(() => (this.loadingSourceServers = false)));
    }
  }

  /**
   * @function onFilterDestinationServers
   * @param searchTerm
   */
  onFilterDestinationServers(searchTerm: string): void {
    const data =
      this._firewallRulesRequestFacade.getSelectedCiaAndEnvironementDestination();
    this.loadingDestinationServers = true;
    if (data) {
      const customParams =
        this._firewallRulesRequestFacade.buildPageableParamsMultiselect(
          0,
          100,
          searchTerm
        );
      this.ipsDestinationList$ = this._firewallRulesRequestFacade
        .lazyLoadDofTicketServersByCiaAndEnvironment(
          data.cia,
          data.environment,
          customParams,
          'DESTINATION'
        )
        .pipe(finalize(() => (this.loadingDestinationServers = false)));
    }
  }

  /**
   * @function onAddRule
   * @description Add ticket rule event callback.
   * @param ruleToAdd
   */
  onAddRule(ruleToAdd: DofTicketRuleModel): void {
    this.loadingDofTicketRule = true;
    this.dofTicketRuleList$ = this._firewallRulesRequestFacade
      .createRuleAndReturnRulesListByDofTicket(
        this.dofTicketId,
        ruleToAdd,
        this.dofTicketRuleForm
      )
      .pipe(finalize(() => (this.loadingDofTicketRule = false)));
    this.displayAddSourceDialog = !this.displayAddSourceDialog;
  }

  /**
   * @function onDeleteRule
   * @param {{ruleToDelete: DofTicketRuleModel; rowIndex: number;}} data
   * @description Delete ticket rule event callback.
   */
  onDeleteRule(data: {
    ruleToDelete: DofTicketRuleModel;
    rowIndex: number;
  }): void {
    this.loadingDofTicketRule = true;
    this.dofTicketRuleList$ = this._firewallRulesRequestFacade
      .deleteRuleAndReturnRulesListByDofTicket(data.ruleToDelete)
      .pipe(finalize(() => (this.loadingDofTicketRule = false)));
  }

  onUpdateRule(ruleToUpdate: DofTicketRuleModel): void {
    this.loadingDofTicketRule = true;
    this.dofTicketRuleList$ = this._firewallRulesRequestFacade
      .updateRuleAndReturnRulesListByDofTicket(ruleToUpdate)
      .pipe(finalize(() => (this.loadingDofTicketRule = false)));
    this.displayAddSourceDialog = !this.displayAddSourceDialog;
  }

  /**
   * @function openAddSourceDialogForUpdate
   * @param data
   */
  openAddSourceDialogForUpdate(data: {
    ruleToUpdate: DofTicketRuleModel;
    rowIndex: number;
  }): void {
    this.sourceDialogMode = 'UPDATE';
    this.dofTicketRuleUpdateForm =
      this._firewallRulesRequestFacade.buildUpdateDofRuleForm(
        data?.ruleToUpdate
      );
    const sourceEnvName = this._firewallRulesRequestFacade.getEnvNameSelected(
      data?.ruleToUpdate.source_servers
    );
    const destEnvName = this._firewallRulesRequestFacade.getEnvNameSelected(
      data?.ruleToUpdate.destination_servers
    );
    /*data?.ruleToUpdate.source_servers.length > 0
      ? data?.ruleToUpdate.source_servers[0].environment?.toUpperCase()
      : '';
  const destEnvName =
    data?.ruleToUpdate.destination_servers.length > 0
      ? data?.ruleToUpdate.destination_servers[0].environment?.toUpperCase()
      : '';*/
    if (
      !isNullOrUndefinedOrEmptyString(sourceEnvName) &&
      data?.ruleToUpdate.source_cia
    ) {
      this.selectedSourceEnv =
        this._firewallRulesRequestFacade.getEnvSelected(sourceEnvName);
      this.ipsSourceList$ =
        this._firewallRulesRequestFacade.getDofTicketServersByCiaAndEnvironment(
          data?.ruleToUpdate.source_cia,
          this.selectedSourceEnv
        );
    }

    if (
      !isNullOrUndefinedOrEmptyString(destEnvName) &&
      data?.ruleToUpdate.destination_cia
    ) {
      this.selectedDestinationEnv =
        this._firewallRulesRequestFacade.getEnvSelected(destEnvName);
      this.ipsDestinationList$ =
        this._firewallRulesRequestFacade.getDofTicketServersByCiaAndEnvironment(
          data?.ruleToUpdate.destination_cia,
          this.selectedDestinationEnv
        );
    }

    this.displayAddSourceDialog = !this.displayAddSourceDialog;
  }

  /**
   * @function openAddSourceDialog
   * @description Open add source dialog event callback
   */
  openAddSourceDialog(): void {
    this.sourceDialogMode = 'ADD';
    this.displayAddSourceDialog = !this.displayAddSourceDialog;
    this._firewallRulesRequestFacade.resetServiceInAddRuleForm(
      this.dofTicketRuleForm
    );
  }

  /**
   * @function onHideAddSourceDialog
   * @description hide add source dialog event callback
   */
  onHideAddSourceDialog(): void {
    this.totalRecordSourceServers$.next(0);
    this.totalRecordDestinationServers$.next(0);
    this.firstRowSourceServers = 0;
    this.firstRowDestinationServers = 0;
    this.rowsSourceServers = 10;
    this.rowsDestinationServers = 10;
    this.displayAddSourceDialog = !this.displayAddSourceDialog;
    this.dofTicketRuleForm.resetForm();
    this.dofTicketRuleForm.reset();
  }

  /**
   * @function onAddServiceInRule
   * @description Add service event callback.
   */
  onAddServiceInRule(): void {
    this._firewallRulesRequestFacade.setServiceInRule(
      this.sourceDialogMode === 'ADD'
        ? this.dofTicketRuleForm.controls['services']
        : this.dofTicketRuleUpdateForm.controls['services']
    );
  }

  /**
   * @function onRemoveServiceInRule
   * @description Remove service event callback.
   */
  onRemoveServiceInRule(index: number): void {
    this._firewallRulesRequestFacade.removeServiceInRule(
      this.sourceDialogMode === 'ADD'
        ? this.dofTicketRuleForm.controls['services']
        : this.dofTicketRuleUpdateForm.controls['services'],
      index
    );
  }

  /**
   * @function onAddNewComment
   * @param comment
   * @description Add comment to the dof ticket event callback.
   */
  onAddNewComment(comment: string): void {
    this.dofTicketCommentsTimeline$ =
      this._firewallRulesRequestFacade.createCommentAndReturnCommentsTimeline(
        this.dofTicketId,
        comment
      );
  }

  /**
   * @function onRefuseImplementationWithComment
   * @param {comment: string; state: StateEnum} data
   * @description Refuse implementation with comment event callback
   */
  onRefuseImplementationWithComment(data: {
    comment: string;
    state: StateEnum;
  }): void {
    this.loading$.next(true);
    this.hideRefuseImplementationDialog();
    this._sub.add(
      this._firewallRulesRequestFacade
        .refuseImplementationWithComment(
          this.dofTicketId,
          data.comment,
          data.state
        )
        .pipe(finalize(() => this.loading$.next(false)))
        .subscribe((res) => {
          this._setDataAndBuildFormUpdate(res[1]);
          window.location.reload();
        })
    );
  }

  /**
   * @function openRefuseImplementationDialog
   * @description Open refuse implementaion dialog event callback
   */
  openRefuseImplementationDialog(): void {
    this.displayRefuseImplementationDialog =
      !this.displayRefuseImplementationDialog;
  }

  /**
   * @function hideRefuseImplementationDialog
   * @description Hide refuse implementation dialog event callback
   */
  hideRefuseImplementationDialog(): void {
    this.displayRefuseImplementationDialog =
      !this.displayRefuseImplementationDialog;
  }

  /**
   * @function openImplementationCommentDialog
   * @description Open implementaion comment dialog.
   */
  openImplementationCommentDialog(): void {
    this.displayImplementationCommentDialog = true;
  }

  /**
   * @function onHideImplementationCommentDialog
   * @description Hide implementaion comment dialog event callback
   */
  onHideImplementationCommentDialog(value: boolean): void {
    this.displayImplementationCommentDialog = value;
  }

  /**
   * @function onTestingWithImplementationComment
   * @param data
   */
  onTestingWithImplementationComment(data: {
    state_comment: string;
    state: StateEnum;
  }): void {
    this.loading$.next(true);
    this._sub.add(
      this._firewallRulesRequestFacade
        .patchDofTicket(
          this.dofTicketId,
          data.state,
          this.dofTicketForm,
          data.state_comment
        )
        .pipe(
          finalize(() => {
            this.loading$.next(false);
          })
        )
        .subscribe((res) => {
          this._setDataAndBuildFormUpdate(res);
          window.location.reload();
        })
    );
  }

  /**
   * @function onConfirmDofTicket
   * @description Submit dof ticket form event callback.
   * @param state
   */
  onConfirmDofTicket(state: StateEnum): void {
    this.loading$.next(true);
    this._sub.add(
      this._firewallRulesRequestFacade
        .patchDofTicket(this.dofTicketId, state, this.dofTicketForm)
        .pipe(
          finalize(() => {
            this.loading$.next(false);
          })
        )
        .subscribe((res) => {
          this._setDataAndBuildFormUpdate(res);
          window.location.reload();
        })
    );
  }

  /**
   * @function sendFile
   * @param dofTicketAttachmentModel
   * @description Send attachment event callback
   */
  onSendAttachment(dofTicketAttachmentModel: DofTicketAttachmentModel): void {
    this.sendAttchmentLoading$.next(true);
    this.dofTicketAttachment$ = this._firewallRulesRequestFacade
      .sendAttachmentAndGetAttachmentByDofTicket(dofTicketAttachmentModel)
      .pipe(
        finalize(() => {
          this.sendAttchmentLoading$.next(false);
        })
      );
  }

  /**
   * @function onLazyLoadDofTicketRules
   * @private
   * @description Lazy load dof tickets data.
   */
  onLazyLoadDofTicketRules(lazyLoadEvent: LazyLoadEvent): void {
    this.loadingDofTicketRule = true;
    this.dofTicketRuleList$ = this._firewallRulesRequestFacade
      .lazyLoadRulesByDofTicketId(this.dofTicketId, lazyLoadEvent)
      .pipe(finalize(() => (this.loadingDofTicketRule = false)));
  }

  /**
   * @function isOwner
   * @description Check if current user is the ticket's owner.
   * @returns {boolean}
   */
  isOwner(): boolean {
    return this._firewallRulesRequestFacade.isOwner(
      this.dofTicketForm.modelInstance['owner']
    );
  }

  /**
   * @function isUserRequestor
   * @description Check if current user is a requestor.
   * @returns {boolean}
   */
  isUserRequestor(): boolean {
    return !hasPermission(
      'change_validation_to_implementation_state_dofticket'
    );
  }

  /**
   * @function onAssignToMe
   */
  onAssignToMe(): void {
    const me = JSON.parse(
      getItemFromLocalStorage('skynesUsersMe')
    ) as SkyneUserMeModel;
    if (me.iup !== '') {
      this.dofTicketForm.patchModelValue({
        assignee: me,
        teams: [me.team],
      });
    }
  }

  /**
   * @function canShowAssignToMeBtn
   */
  canShowAssignToMeBtn(): boolean {
    return this._permissionManagerService.isGranted(
      PermissionTypeEnum.UPDATE,
      'dofticket'
    );
  }

  /**
   * @function _setDataAndBuildFormUpdate
   * @private
   * @param dofTicketModel
   */
  private _setDataAndBuildFormUpdate(dofTicketModel: DofTicketModel): void {
    this.users$ = this._firewallRulesRequestFacade.getUsersByTeams(
      dofTicketModel.teams as TeamsEnum[]
    );
    this.dofTicketForm =
      this._firewallRulesRequestFacade.buildUpdateDofTicketForm(dofTicketModel);
    this.dofTicketAttachment$ = of(
      this._firewallRulesRequestFacade.buildDofTicketAttachmentByDofTicket(
        dofTicketModel
      )
    );
    this.iconState = this._firewallRulesRequestFacade.getIconState(
      dofTicketModel?.state
    );
  }

  /**
   * @function _initData
   * @private
   * @description Initializes data.
   */
  private _initData(): void {
    if (this.dofTicketId) {
      this._sub.add(
        this._firewallRulesRequestFacade
          .getDofTicketDetail(this.dofTicketId)
          .subscribe((dofTicketModel: DofTicketModel) => {
            this._setDataAndBuildFormUpdate(dofTicketModel);
          })
      );
    }
  }
}
