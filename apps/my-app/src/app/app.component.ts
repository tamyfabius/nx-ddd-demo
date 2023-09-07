import { Component } from '@angular/core';

getDofTicketsStatics(): Observable<DofTicketsStatisticsModel[]> {
  return this._dofService
    .getPageableListWithQueryParams<DofTicketsStatisticsModel>(
      '/dof-ticket-statistics/'
    )
    .pipe(
      map((res: PageableModel<DofTicketsStatisticsModel>) => res.results)
    );
}

export interface PageableModel<T> {
  previous?: string;
  next?: string;
  count: number;
  results: T[];
}

export interface DofTicketsStatisticsModel {
  nb_opened_tickets: number;
  nb_self_assigned_tickets: number;
  nb_low_priority_tickets: number;
  nb_medium_priority_tickets: number;
  nb_high_priority_tickets: number;
  nb_tickets_in_validation_status: number;
  nb_tickets_in_waiting_update_status: number;
  nb_tickets_in_implementation_status: number;
  nb_tickets_in_testing_status: number;
}
